import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { NextRequest } from "next/server";
import { eventScope } from "@/lib/event-access";

/**
 * Aggregate view — cost-per-lead trend, best coordinators, not just
 * per-event numbers. Admin sees the whole org; a coordinator gets the
 * same view narrowed to their own events (ownership resolved server-
 * side, never from the query string).
 */
export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  const scope = await eventScope(req);
  if (!isAdmin(me) && !scope.isCoordinator) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  if (scope.isCoordinator && !scope.ownCoordId) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  // `all` short-circuits the filter for admins; -1 never matches a real id.
  const cid = scope.ownCoordId ?? -1;
  const all = !scope.isCoordinator;

  const [byMonth, byCoord, totals, expensesByEvent] = await Promise.all([
    sql`SELECT TO_CHAR(e.date, 'YYYY-MM') as month,
          COUNT(*)::int as events,
          COALESCE(SUM((SELECT COUNT(*)::int FROM leads l WHERE l.event_id=e.id)),0)::int as leads
        FROM events e WHERE e.date IS NOT NULL AND e.status='done' AND (${all} OR e.coordinator_id=${cid})
        GROUP BY month ORDER BY month DESC LIMIT 12`,

    sql`SELECT c.name as coordinator_name,
          COUNT(DISTINCT e.id)::int as events,
          COALESCE(SUM((SELECT COUNT(*)::int FROM leads l WHERE l.event_id=e.id)),0)::int as leads
        FROM events e LEFT JOIN coordinators c ON c.id=e.coordinator_id
        WHERE e.status='done' AND (${all} OR e.coordinator_id=${cid})
        GROUP BY c.name ORDER BY leads DESC LIMIT 15`,

    sql`SELECT COUNT(*)::int as total_events,
          COALESCE(SUM((SELECT COUNT(*)::int FROM leads l WHERE l.event_id=events.id)),0)::int as total_leads
        FROM events WHERE status='done' AND (${all} OR coordinator_id=${cid})`,

    sql`SELECT x.event_id, SUM(x.amount)::int as spent FROM expenses x JOIN events e ON e.id=x.event_id WHERE (${all} OR e.coordinator_id=${cid}) GROUP BY x.event_id`,
  ]);

  const spentMap: Record<number, number> = {};
  for (const r of expensesByEvent as any[]) spentMap[r.event_id] = r.spent;

  const totalSpent = Object.values(spentMap).reduce((a, b) => a + b, 0);
  const totalLeads = (totals[0] as any)?.total_leads || 0;

  return NextResponse.json({
    byMonth: (byMonth as any[]).reverse(),
    byCoordinator: byCoord,
    totals: {
      events: (totals[0] as any)?.total_events || 0,
      leads: totalLeads,
      spent: totalSpent,
      costPerLead: totalLeads > 0 ? Math.round(totalSpent / totalLeads) : null,
    },
  });
}
