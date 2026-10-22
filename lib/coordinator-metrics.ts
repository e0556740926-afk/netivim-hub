import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";

/**
 * Shared metric queries for ניהול רכזים (coordinator management).
 *
 * Engagement traffic light — deliberately simple and documented so a
 * manager can explain it to a coordinator:
 *   green  : logged in ≥2× in the last 7 days AND ≥5 audited actions
 *            in the last 7 days AND overdue ratio < 25%
 *   red    : no login in the last 7 days, OR overdue ratio ≥ 50%
 *   yellow : everything in between
 * "Actions" = any audit_log line by this person (lead created, task
 * closed, event updated, report submitted, login, ...). Overdue ratio =
 * overdue open tasks / all open tasks (0 when there are no open tasks).
 */
export type Light = "green" | "yellow" | "red";

export interface CoordinatorMetrics {
  id: number;
  user_id: number | null;
  name: string;
  area: string;
  email: string | null;
  phone: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  target_leads: number;
  leads_month: number;
  leads_via_link_month: number;
  tasks_open: number;
  tasks_done_month: number;
  tasks_overdue: number;
  avg_close_days: number | null;
  interactions_month: number;
  events_month: number;
  reports_month: number;
  last_report_at: string | null;
  meetings_month: number;
  /** Monday the coordinator's weekly-report form stamps for the current week. */
  report_week_start: string;
  report_this_week: boolean;
  last_meeting_date: string | null;
  next_meeting_date: string | null;
  logins_7d: number;
  actions_7d: number;
  overdue_ratio: number;
  light: Light;
}

export function lightFor(m: { logins_7d: number; actions_7d: number; overdue_ratio: number }): Light {
  if (m.logins_7d === 0 || m.overdue_ratio >= 0.5) return "red";
  if (m.logins_7d >= 2 && m.actions_7d >= 5 && m.overdue_ratio < 0.25) return "green";
  return "yellow";
}

/** Parses "YYYY-MM" (defaults to the current month). Returns first day + exclusive end. */
export function monthRange(ym?: string | null) {
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth() + 1;
  if (ym && /^\d{4}-\d{2}$/.test(ym)) { y = Number(ym.slice(0, 4)); m = Number(ym.slice(5, 7)); }
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endD = new Date(Date.UTC(y, m, 1)); // first day of next month
  const end = endD.toISOString().slice(0, 10);
  return { year: y, month: m, start, end };
}

export async function coordinatorMetrics(ym?: string | null, onlyId?: number): Promise<CoordinatorMetrics[]> {
  const { year, month, start, end } = monthRange(ym);
  const [hasActorId, hasStatusChanged, hasLastLogin] = await Promise.all([
    hasColumn("audit_log", "actor_id"),
    hasColumn("tasks", "status_changed_at"),
    hasColumn("users", "last_login_at"),
  ]);
  // `sql` fragments can't be nested in this driver, so the optional
  // columns are handled with text built per branch below (no user input
  // goes into the text — only our own column names).
  const closeExpr = hasStatusChanged
    ? "AVG(EXTRACT(EPOCH FROM (t.status_changed_at - t.created_at)) / 86400.0)"
    : "NULL";
  const actorMatch = hasActorId
    ? "(a.actor_id = c.user_id OR a.actor_name = c.name)"
    : "a.actor_name = c.name";
  const lastLogin = hasLastLogin ? "u.last_login_at" : "NULL::timestamptz";

  const text = `
    SELECT c.id, c.user_id, c.name, COALESCE(c.area,'') AS area, u.email, COALESCE(c.phone, u.phone) AS phone,
      ${lastLogin} AS last_login_at,
      (SELECT max(a.created_at) FROM audit_log a WHERE ${actorMatch}) AS last_active_at,
      COALESCE((SELECT target_leads FROM monthly_targets mt WHERE mt.coordinator_id = c.id AND mt.month = $1 AND mt.year = $2), 0)::int AS target_leads,
      (SELECT count(*)::int FROM leads l WHERE l.coordinator_id = c.id AND l.deleted_at IS NULL AND l.created_at >= $3 AND l.created_at < $4) AS leads_month,
      (SELECT count(*)::int FROM leads l WHERE l.coordinator_id = c.id AND l.deleted_at IS NULL AND l.source = 'link' AND l.created_at >= $3 AND l.created_at < $4) AS leads_via_link_month,
      (SELECT count(*)::int FROM tasks t WHERE (c.name = ANY(t.assignees) OR t.coordinator_id = c.id) AND t.status <> 'done') AS tasks_open,
      (SELECT count(*)::int FROM tasks t WHERE (c.name = ANY(t.assignees) OR t.coordinator_id = c.id) AND t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE) AS tasks_overdue,
      (SELECT count(*)::int FROM tasks t WHERE (c.name = ANY(t.assignees) OR t.coordinator_id = c.id) AND t.status = 'done'
         ${hasStatusChanged ? "AND t.status_changed_at >= $3 AND t.status_changed_at < $4" : "AND t.created_at >= $3 AND t.created_at < $4"}) AS tasks_done_month,
      (SELECT ${closeExpr} FROM tasks t WHERE (c.name = ANY(t.assignees) OR t.coordinator_id = c.id) AND t.status = 'done'
         ${hasStatusChanged ? "AND t.status_changed_at >= now() - interval '90 days'" : ""})::float AS avg_close_days,
      (SELECT count(*)::int FROM interactions i WHERE i.coordinator_id = c.id AND i.date >= $3 AND i.date < $4) AS interactions_month,
      (SELECT count(*)::int FROM events e WHERE e.coordinator_id = c.id AND e.date >= $3 AND e.date < $4) AS events_month,
      (SELECT count(*)::int FROM weekly_reports r WHERE r.coordinator_id = c.id AND r.submitted_at >= $3 AND r.submitted_at < $4) AS reports_month,
      (SELECT max(r.submitted_at) FROM weekly_reports r WHERE r.coordinator_id = c.id) AS last_report_at,
      (SELECT count(*)::int FROM meetings m WHERE m.coordinator_id = c.id AND m.date >= $3 AND m.date < $4) AS meetings_month,
      (SELECT max(m.date) FROM meetings m WHERE m.coordinator_id = c.id) AS last_meeting_date,
      (SELECT m.next_meeting_date FROM meetings m WHERE m.coordinator_id = c.id ORDER BY m.date DESC, m.id DESC LIMIT 1) AS next_meeting_date,
      wk.week_start::text AS report_week_start,
      EXISTS (SELECT 1 FROM weekly_reports r WHERE r.coordinator_id = c.id AND r.week_start = wk.week_start) AS report_this_week,
      (SELECT count(*)::int FROM audit_log a WHERE ${actorMatch} AND a.action = 'login' AND a.created_at >= now() - interval '7 days') AS logins_7d,
      (SELECT count(*)::int FROM audit_log a WHERE ${actorMatch} AND a.created_at >= now() - interval '7 days') AS actions_7d
    FROM coordinators c
    LEFT JOIN users u ON u.id = c.user_id
    -- Same rule as the coordinator's report form (Monday of the week that
    -- contains tomorrow, Israel time): a report sent on Sunday is stamped
    -- with the coming Monday.
    CROSS JOIN (SELECT date_trunc('week', (now() AT TIME ZONE 'Asia/Jerusalem')::date + 1)::date AS week_start) wk
    WHERE 1=1 ${onlyId ? "AND c.id = $5" : ""}
    ORDER BY c.name`;
  const params: any[] = [month, year, start, end];
  if (onlyId) params.push(onlyId);
  const rows = (await sql.query(text, params)) as any[];

  return rows.map(r => {
    const overdue_ratio = r.tasks_open > 0 ? r.tasks_overdue / r.tasks_open : 0;
    // A user who never had a login audited (feature is new) but has
    // last_login_at within 7 days counts as 1 login, so the light
    // isn't red purely for lack of history.
    let logins_7d = r.logins_7d;
    if (!logins_7d && r.last_login_at && Date.now() - new Date(r.last_login_at).getTime() < 7 * 86400000) logins_7d = 1;
    const m = {
      ...r,
      target_leads: Number(r.target_leads) || 0,
      avg_close_days: r.avg_close_days == null ? null : Math.round(Number(r.avg_close_days) * 10) / 10,
      logins_7d,
      overdue_ratio: Math.round(overdue_ratio * 100) / 100,
    };
    return { ...m, light: lightFor(m) } as CoordinatorMetrics;
  });
}
