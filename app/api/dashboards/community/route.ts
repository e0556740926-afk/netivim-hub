import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const [pulse, coordPerf, eventLeaderboard, communityActivity] = await Promise.all([
    sql`
      SELECT
        (SELECT count(*)::int FROM leads WHERE date_trunc('month', created_at) = date_trunc('month', now()) AND deleted_at IS NULL) AS leads_this_month,
        (SELECT COALESCE(sum(target_leads), 0)::int FROM monthly_targets WHERE month = EXTRACT(MONTH FROM now())::int AND year = EXTRACT(YEAR FROM now())::int) AS target_this_month,
        (SELECT count(*)::int FROM events WHERE date_trunc('month', date) = date_trunc('month', now())) AS events_this_month,
        (SELECT COALESCE(sum(amount), 0) FROM expenses WHERE status='paid' AND date_trunc('month', date) = date_trunc('month', now())) AS spend_this_month`,
    sql`
      SELECT c.name AS coordinator_name, mt.target_leads,
        (SELECT count(*)::int FROM leads l WHERE l.coordinator_id = c.id AND date_trunc('month', l.created_at) = date_trunc('month', now())) AS leads_entered,
        (SELECT count(*)::int FROM leads l WHERE l.coordinator_id = c.id AND l.advisor_status NOT IN ('פנייה חדשה','לא פעיל')) AS converted_to_process,
        (SELECT count(*)::int FROM leads l WHERE l.coordinator_id = c.id AND l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה')) AS placed,
        (SELECT count(*)::int FROM events e WHERE e.coordinator_id = c.id) AS events_owned
      FROM coordinators c LEFT JOIN monthly_targets mt ON mt.coordinator_id = c.id
        AND mt.month = EXTRACT(MONTH FROM now())::int AND mt.year = EXTRACT(YEAR FROM now())::int`,
    sql`
      SELECT e.id, e.name, e.location, e.leads_collected,
        (SELECT COALESCE(sum(amount), 0) FROM expenses ex WHERE ex.event_id = e.id) AS cost,
        e.actual_attendees
      FROM events e WHERE e.status NOT IN ('planning','cancelled') ORDER BY e.date DESC LIMIT 20`,
    sql`
      SELECT
        (SELECT count(*)::int FROM leads WHERE inactive_reason = 'פעילות קהילתית') AS community_activity_count,
        (SELECT count(*)::int FROM event_attendees) AS total_event_attendees`,
  ]);

  const p = (pulse as any[])[0];
  const ca = (communityActivity as any[])[0];

  return NextResponse.json({
    pulse: {
      leads_this_month: p.leads_this_month, target_this_month: p.target_this_month,
      events_this_month: p.events_this_month,
      cost_per_lead: p.leads_this_month > 0 ? Math.round(Number(p.spend_this_month) / p.leads_this_month) : null,
    },
    coordinator_performance: coordPerf,
    event_leaderboard: (eventLeaderboard as any[]).map(e => ({
      ...e,
      cost_per_lead: e.leads_collected > 0 ? Math.round(Number(e.cost) / e.leads_collected) : null,
    })),
    community_activity_count: ca.community_activity_count,
    total_event_attendees: ca.total_event_attendees,
    // Institutions/rabbis-project block depends on chapters not yet built this round.
    community_institutions: null,
  });
}
