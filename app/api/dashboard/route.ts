import { NextResponse } from "next/server";
import sql from "@/lib/db";

/**
 * The admin sidebar polls this endpoint every 60s (per logged-in
 * admin) purely for badge counts — pending approvals, late tasks,
 * missing reports. With more than one admin active, that's several
 * full re-runs of 7 parallel queries a minute for numbers that
 * usually haven't changed since the last poll.
 *
 * Short in-memory cache, same TTL pattern already proven in
 * lib/schema.ts: correct within one warm serverless instance, and
 * short enough (20s) that a real change — an admin approving
 * something — shows up well within the sidebar's own 60s poll
 * interval regardless of which instance serves the next request.
 */
let cached: { body: any; at: number } | null = null;
const TTL_MS = 20_000;

/**
 * Shapes kept deliberately small and stable:
 *   leadCounts  [{ coordinator_id, count }]
 *   expenseByEvent [{ event_id, total }]
 *   totals      { leads, spent, budget, lateTasks }
 */
export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(cached.body);
  }

  const [
    coordinators, targets, events,
    leadCounts, expenseByEvent, totals, reports,
  ] = await Promise.all([
    sql`SELECT id, name, area, role FROM coordinators ORDER BY id`,

    sql`SELECT coordinator_id, target_leads FROM monthly_targets
        WHERE month = EXTRACT(MONTH FROM NOW()) AND year = EXTRACT(YEAR FROM NOW())`,

    // Events still come through in full — the radar and the approval
    // queue need their fields — but bounded to what a dashboard shows.
    sql`SELECT id, name, date, location, status, budget_planned, approved
        FROM events
        WHERE date IS NULL OR date >= (NOW() - INTERVAL '120 days')::date
        ORDER BY date`,

    sql`SELECT coordinator_id, COUNT(*)::int AS count
        FROM leads
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        GROUP BY coordinator_id`,

    sql`SELECT event_id, SUM(amount)::float AS total
        FROM expenses
        WHERE event_id IS NOT NULL
        GROUP BY event_id`,

    sql`SELECT
          (SELECT COUNT(*)::int FROM leads
             WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())) AS leads,
          (SELECT COUNT(*)::int FROM leads
             WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')) AS leads_prev_month,
          (SELECT COALESCE(SUM(amount),0)::float FROM expenses)                  AS spent,
          (SELECT COALESCE(SUM(budget_planned),0)::float FROM events)            AS budget,
          (SELECT COUNT(*)::int FROM tasks
             WHERE status <> 'done' AND due_date IS NOT NULL
               AND due_date < CURRENT_DATE)                                      AS late_tasks`,

    sql`SELECT coordinator_id FROM weekly_reports
        WHERE submitted_at > NOW() - INTERVAL '7 days'`,
  ]);

  const t: any = totals[0] || {};
  const prevLeads = t.leads_prev_month ?? 0;
  const leadsTrendPct = prevLeads > 0
    ? Math.round(((t.leads - prevLeads) / prevLeads) * 100)
    : (t.leads > 0 ? 100 : 0);

  const body = {
    coordinators,
    targets,
    events,
    leadCounts,
    expenseByEvent,
    reports,
    totals: {
      leads: t.leads ?? 0,
      leadsPrevMonth: prevLeads,
      leadsTrendPct,
      spent: t.spent ?? 0,
      budget: t.budget ?? 0,
      lateTasks: t.late_tasks ?? 0,
    },
  };
  cached = { body, at: Date.now() };
  return NextResponse.json(body);
}
