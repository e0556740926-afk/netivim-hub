import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser } from "@/lib/auth-server";

/**
 * Everything the manager's field dashboard shows, in one request.
 * Same short in-memory cache pattern as /api/dashboard (20s): correct
 * within one warm instance, short enough that an inline action
 * (completing a task, approving an event) is reflected on the next load
 * because callers bust it with ?fresh=1 after a mutation.
 */
let cached: { body: any; at: number } | null = null;
const TTL_MS = 20_000;

export type Alert = { level: "high" | "medium" | "low"; text: string; href: string };

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me || me.role === "coordinator") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return NextResponse.json(cached.body);

  const [hasContactsCreated, hasLeadSource, hasLastLogin, hasPriority, hasEventSummary] = await Promise.all([
    hasColumn("contacts", "created_at"),
    hasColumn("leads", "lead_source_id"),
    hasColumn("users", "last_login_at"),
    hasColumn("tasks", "priority"),
    hasColumn("events", "summary"),
  ]);

  const priorityCol = hasPriority ? "t.priority" : "'normal'";
  const debriefCond = hasEventSummary
    ? "(e.actual_attendees IS NULL OR e.actual_attendees = 0) AND COALESCE(e.summary,'') = ''"
    : "(e.actual_attendees IS NULL OR e.actual_attendees = 0)";

  const [
    kpiRows, coordinators, tasks, eventsUpcoming, eventsPending, eventsNoDebrief,
    leadSeries, plannedSeries, bySource, latestLeads, interactionsWeek, coldContacts, orgTargetRow,
  ] = await Promise.all([
    sql.query(`
      SELECT
        (SELECT count(*)::int FROM leads WHERE deleted_at IS NULL AND date_trunc('month', created_at) = date_trunc('month', now())) AS leads_this_month,
        (SELECT count(*)::int FROM leads WHERE deleted_at IS NULL AND date_trunc('month', created_at) = date_trunc('month', now() - interval '1 month')) AS leads_prev_month,
        (SELECT COALESCE(sum(target_leads),0)::int FROM monthly_targets WHERE month = EXTRACT(MONTH FROM now())::int AND year = EXTRACT(YEAR FROM now())::int) AS targets_sum,
        (SELECT count(*)::int FROM tasks WHERE status <> 'done') AS tasks_open,
        (SELECT count(*)::int FROM tasks WHERE status <> 'done' AND due_date IS NOT NULL AND due_date < CURRENT_DATE) AS tasks_overdue,
        (SELECT count(*)::int FROM events WHERE date >= CURRENT_DATE AND date < CURRENT_DATE + 30 AND status <> 'cancelled') AS events_next_30d,
        (SELECT count(*)::int FROM coordinators c WHERE NOT EXISTS (SELECT 1 FROM weekly_reports w WHERE w.coordinator_id = c.id AND w.submitted_at > now() - interval '7 days')) AS reports_missing_this_week,
        ${hasContactsCreated
          ? "(SELECT count(*)::int FROM contacts WHERE deleted_at IS NULL AND date_trunc('month', created_at) = date_trunc('month', now()))"
          : "0"} AS contacts_new_this_month
    `),

    sql.query(`
      SELECT c.id, c.name, c.area, c.slug,
        (SELECT count(*)::int FROM leads l WHERE l.coordinator_id = c.id AND l.deleted_at IS NULL AND date_trunc('month', l.created_at) = date_trunc('month', now())) AS leads,
        (SELECT COALESCE(mt.target_leads,0)::int FROM monthly_targets mt WHERE mt.coordinator_id = c.id AND mt.month = EXTRACT(MONTH FROM now())::int AND mt.year = EXTRACT(YEAR FROM now())::int LIMIT 1) AS target,
        (SELECT count(*)::int FROM tasks t WHERE t.status <> 'done' AND (c.name = ANY(t.assignees) OR t.coordinator_id = c.id)) AS tasks_open,
        (SELECT count(*)::int FROM tasks t WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE AND (c.name = ANY(t.assignees) OR t.coordinator_id = c.id)) AS tasks_overdue,
        (SELECT json_build_object('id', e.id, 'name', e.name, 'date', e.date) FROM events e WHERE e.coordinator_id = c.id AND e.date >= CURRENT_DATE AND e.status <> 'cancelled' ORDER BY e.date LIMIT 1) AS next_event,
        (SELECT max(w.submitted_at) FROM weekly_reports w WHERE w.coordinator_id = c.id) AS last_report_at,
        (SELECT max(a.created_at) FROM audit_log a WHERE a.actor_name = c.name) AS last_active_at,
        ${hasLastLogin ? "u.last_login_at" : "NULL"} AS last_login_at
      FROM coordinators c LEFT JOIN users u ON u.id = c.user_id
      ORDER BY leads DESC, c.name
    `),

    sql.query(`
      SELECT t.id, t.title, t.assignees, t.due_date, t.status, ${priorityCol} AS priority,
        c.name AS contact_name, c.id AS contact_id, e.name AS event_name, e.id AS event_id
      FROM tasks t
      LEFT JOIN contacts c ON c.id = t.contact_id
      LEFT JOIN events e ON e.id = t.event_id
      WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE + 7
      ORDER BY t.due_date, ${priorityCol} = 'urgent' DESC
      LIMIT 50
    `),

    sql`
      SELECT e.id, e.name, e.date, e.time, e.location, e.status, e.approved, e.target_attendees, c.name AS coordinator_name
      FROM events e LEFT JOIN coordinators c ON c.id = e.coordinator_id
      WHERE e.date >= CURRENT_DATE AND e.date < CURRENT_DATE + 30 AND e.status <> 'cancelled'
      ORDER BY e.date, e.time LIMIT 30`,

    sql`
      SELECT e.id, e.name, e.date, e.location, e.budget_planned, c.name AS coordinator_name
      FROM events e LEFT JOIN coordinators c ON c.id = e.coordinator_id
      WHERE e.status = 'pending_approval' AND COALESCE(e.approved,false) = false
      ORDER BY e.date LIMIT 20`,

    sql.query(`
      SELECT e.id, e.name, e.date, c.name AS coordinator_name
      FROM events e LEFT JOIN coordinators c ON c.id = e.coordinator_id
      WHERE e.date < CURRENT_DATE AND e.date > CURRENT_DATE - 60 AND e.status NOT IN ('cancelled','planning') AND ${debriefCond}
      ORDER BY e.date DESC LIMIT 20
    `),

    sql`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*)::int AS actual
      FROM leads WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now()) - interval '5 months'
      GROUP BY 1 ORDER BY 1`,

    sql`
      SELECT year, month, sum(target_leads)::int AS planned FROM monthly_targets
      WHERE make_date(year, month, 1) >= date_trunc('month', now()) - interval '5 months'
      GROUP BY year, month`,

    hasLeadSource ? sql`
      SELECT ls.id, ls.label, ls.coordinator_id,
        (SELECT count(*)::int FROM leads l WHERE l.deleted_at IS NULL
          AND date_trunc('month', l.created_at) = date_trunc('month', now())
          AND (l.lead_source_id = ls.id OR (ls.coordinator_id IS NOT NULL AND l.coordinator_id = ls.coordinator_id))) AS count
      FROM lead_sources ls WHERE ls.active = true ORDER BY count DESC, ls.label` : Promise.resolve([]),

    sql`
      SELECT l.id, l.name, l.city, l.phone, l.created_at, l.source, l.status, c.name AS coordinator_name, l.owner_name
      FROM leads l LEFT JOIN coordinators c ON c.id = l.coordinator_id
      WHERE l.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT 10`,

    sql`
      SELECT c.id AS coordinator_id, c.name,
        (SELECT count(*)::int FROM interactions i WHERE i.coordinator_id = c.id AND i.date >= CURRENT_DATE - 7) AS interactions
      FROM coordinators c ORDER BY interactions DESC`,

    sql`
      SELECT id, name, org, status, last_contact, owner
      FROM contacts
      WHERE deleted_at IS NULL AND status NOT IN ('irrelevant')
        AND (last_contact IS NULL OR last_contact < CURRENT_DATE - 60)
      ORDER BY last_contact NULLS FIRST LIMIT 20`,

    sql`SELECT value FROM app_settings WHERE key='org_lead_target_monthly'`,
  ]);

  const k: any = (kpiRows as any[])[0] || {};
  const orgTarget = Number(k.targets_sum) > 0 ? Number(k.targets_sum) : Number((orgTargetRow as any[])[0]?.value) || 0;

  // 6-month series, filled with zeros for months with no rows.
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const actualMap = new Map((leadSeries as any[]).map(r => [r.month, r.actual]));
  const plannedMap = new Map((plannedSeries as any[]).map(r => [`${r.year}-${String(r.month).padStart(2, "0")}`, r.planned]));
  const series = months.map(m => ({ month: m, actual: actualMap.get(m) || 0, planned: plannedMap.get(m) || 0 }));

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const taskRows = (tasks as any[]).map(t => ({ ...t, due_date: t.due_date ? String(t.due_date instanceof Date ? t.due_date.toISOString() : t.due_date).slice(0, 10) : null }));
  const tasksOut = {
    overdue: taskRows.filter(t => t.due_date && t.due_date < today),
    today: taskRows.filter(t => t.due_date === today),
    this_week: taskRows.filter(t => t.due_date && t.due_date > today && t.due_date <= weekEnd),
  };

  // Alerts — each one is actionable and links to where it's fixed.
  const alerts: Alert[] = [];
  const coordRows = coordinators as any[];
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  for (const c of coordRows) {
    const lastReport = c.last_report_at ? new Date(c.last_report_at).getTime() : 0;
    if (lastReport < sevenDaysAgo) alerts.push({ level: "high", text: `${c.name} לא הגיש דיווח שבועי`, href: `/admin/reports/${c.id}` });
    const lastLogin = c.last_login_at ? new Date(c.last_login_at).getTime() : (c.last_active_at ? new Date(c.last_active_at).getTime() : 0);
    if (lastLogin && lastLogin < sevenDaysAgo) alerts.push({ level: "medium", text: `${c.name} לא נכנס למערכת 7+ ימים`, href: `/admin/reports/${c.id}` });
  }
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const stale = tasksOut.overdue.filter(t => t.due_date < threeDaysAgo);
  if (stale.length) alerts.push({ level: "high", text: `${stale.length} משימות באיחור של 3+ ימים`, href: "/admin/tasks?due=overdue" });
  const openTaskEventIds = new Set(taskRows.map(t => t.event_id).filter(Boolean));
  for (const e of eventsUpcoming as any[]) {
    const d = String(e.date instanceof Date ? e.date.toISOString() : e.date).slice(0, 10);
    if (d <= weekEnd && !openTaskEventIds.has(e.id)) alerts.push({ level: "medium", text: `"${e.name}" בעוד פחות משבוע בלי משימות פתוחות`, href: "/admin/events" });
  }
  for (const e of eventsNoDebrief as any[]) alerts.push({ level: "low", text: `"${e.name}" עבר בלי תחקיר`, href: "/admin/events" });

  const body = {
    kpis: {
      leads_this_month: k.leads_this_month ?? 0,
      leads_prev_month: k.leads_prev_month ?? 0,
      org_target: orgTarget,
      tasks_open: k.tasks_open ?? 0,
      tasks_overdue: k.tasks_overdue ?? 0,
      events_next_30d: k.events_next_30d ?? 0,
      reports_missing_this_week: k.reports_missing_this_week ?? 0,
      contacts_new_this_month: k.contacts_new_this_month ?? 0,
    },
    coordinators: coordRows,
    tasks: tasksOut,
    events: { upcoming: eventsUpcoming, pending: eventsPending, no_debrief: eventsNoDebrief },
    leads: { series, by_source: bySource, latest: latestLeads },
    contacts: { interactions_week: interactionsWeek, cold: coldContacts },
    alerts,
    generated_at: new Date().toISOString(),
  };
  cached = { body, at: Date.now() };
  return NextResponse.json(body);
}
