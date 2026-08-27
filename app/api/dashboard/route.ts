import { NextResponse } from "next/server";
import sql from "@/lib/db";

/**
 * The dashboard only ever counted these rows client-side, so the counting
 * happens in SQL now. Previously this shipped every task, every expense
 * and every lead in the org just to produce four numbers.
 *
 * Shapes kept deliberately small and stable:
 *   leadCounts  [{ coordinator_id, count }]
 *   expenseByEvent [{ event_id, total }]
 *   totals      { leads, spent, budget, lateTasks }
 */
export async function GET() {
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
          (SELECT COALESCE(SUM(amount),0)::float FROM expenses)                  AS spent,
          (SELECT COALESCE(SUM(budget_planned),0)::float FROM events)            AS budget,
          (SELECT COUNT(*)::int FROM tasks
             WHERE status <> 'done' AND due_date IS NOT NULL
               AND due_date < CURRENT_DATE)                                      AS late_tasks`,

    sql`SELECT coordinator_id FROM weekly_reports
        WHERE submitted_at > NOW() - INTERVAL '7 days'`,
  ]);

  const t: any = totals[0] || {};
  return NextResponse.json({
    coordinators,
    targets,
    events,
    leadCounts,
    expenseByEvent,
    reports,
    totals: {
      leads: t.leads ?? 0,
      spent: t.spent ?? 0,
      budget: t.budget ?? 0,
      lateTasks: t.late_tasks ?? 0,
    },
  });
}
