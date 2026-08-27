import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";

function monthBounds(monthStr?: string | null) {
  const [y, m] = (monthStr || new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { ms: start.toISOString().slice(0, 10), me: end.toISOString().slice(0, 10), year: y, month: m };
}

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { ms, me: monthEnd, year, month } = monthBounds(req.nextUrl.searchParams.get("month"));

  const [coordinators, targets, leadCounts, taskStats, interactionCounts, reportCounts, events, expenses] = await Promise.all([
    sql`SELECT id, name, area FROM coordinators ORDER BY name`,

    sql`SELECT coordinator_id, target_leads FROM monthly_targets WHERE month=${month} AND year=${year}`,

    sql`SELECT coordinator_id, COUNT(*)::int AS count FROM leads
        WHERE created_at::date BETWEEN ${ms} AND ${monthEnd} GROUP BY coordinator_id`,

    sql`SELECT coordinator_id,
          COUNT(*) FILTER (WHERE status='done')::int AS done,
          COUNT(*) FILTER (WHERE status<>'done' AND due_date < CURRENT_DATE)::int AS late
        FROM tasks
        WHERE created_at::date BETWEEN ${ms} AND ${monthEnd}
        GROUP BY coordinator_id`,

    sql`SELECT coordinator_id, COUNT(*)::int AS count FROM interactions
        WHERE date BETWEEN ${ms} AND ${monthEnd} GROUP BY coordinator_id`,

    sql`SELECT coordinator_id, COUNT(*)::int AS count FROM weekly_reports
        WHERE week_start BETWEEN ${ms} AND ${monthEnd} GROUP BY coordinator_id`,

    sql`SELECT id, name, date, status, budget_planned, leads_collected, actual_attendees
        FROM events WHERE date BETWEEN ${ms} AND ${monthEnd} ORDER BY date`,

    sql`SELECT COALESCE(SUM(amount),0)::float AS total FROM expenses WHERE date BETWEEN ${ms} AND ${monthEnd}`,
  ]);

  const byId = <T extends { coordinator_id: number }>(rows: T[]) => {
    const m = new Map<number, T>();
    for (const r of rows) m.set(r.coordinator_id, r);
    return m;
  };
  const leadsMap = byId(leadCounts as any[]);
  const taskMap = byId(taskStats as any[]);
  const intMap = byId(interactionCounts as any[]);
  const reportMap = byId(reportCounts as any[]);
  const targetMap = new Map((targets as any[]).map(t => [t.coordinator_id, t.target_leads]));

  const rows = (coordinators as any[]).map(c => {
    const leads = leadsMap.get(c.id)?.count || 0;
    const target = targetMap.get(c.id) || 0;
    const tasksDone = taskMap.get(c.id)?.done || 0;
    const tasksLate = taskMap.get(c.id)?.late || 0;
    const interactions = intMap.get(c.id)?.count || 0;
    const reportsSubmitted = reportMap.get(c.id)?.count || 0;
    // Same weighting as the weekly report, scaled to a month (4 weeks)
    const score = Math.min(leads * 2, 30) + Math.min(interactions * 2, 30)
                + Math.min(tasksDone * 2, 20) + Math.min(reportsSubmitted * 5, 20);
    return { ...c, leads, target, tasksDone, tasksLate, interactions, reportsSubmitted, score };
  }).sort((a, b) => b.score - a.score);

  return NextResponse.json({
    month: { year, month, start: ms, end: monthEnd },
    coordinators: rows,
    events,
    totalExpenses: (expenses[0] as any)?.total || 0,
    totals: {
      leads: rows.reduce((s, r) => s + r.leads, 0),
      target: rows.reduce((s, r) => s + r.target, 0),
      tasksDone: rows.reduce((s, r) => s + r.tasksDone, 0),
      interactions: rows.reduce((s, r) => s + r.interactions, 0),
    },
  });
}
