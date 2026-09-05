import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const [byCampaign, byCoordinator, leadsByMonth, expensesByMonth] = await Promise.all([
    sql`
      SELECT l.source AS campaign,
        count(DISTINCT l.id)::int AS leads,
        count(DISTINCT l.id) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placements,
        (SELECT COALESCE(sum(e.amount), 0) FROM expenses e WHERE e.status='paid' AND e.category='marketing') AS total_marketing_spend
      FROM leads l WHERE l.deleted_at IS NULL GROUP BY l.source`,
    sql`
      SELECT c.name AS coordinator_name,
        count(DISTINCT l.id)::int AS leads,
        count(DISTINCT l.id) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placements,
        (SELECT COALESCE(sum(ex.amount), 0) FROM expenses ex WHERE ex.status='paid' AND ex.event_id IN (SELECT id FROM events WHERE coordinator_id = c.id)) AS event_spend
      FROM coordinators c LEFT JOIN leads l ON l.coordinator_id = c.id AND l.deleted_at IS NULL
      GROUP BY c.id, c.name`,
    sql`
      SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS leads
      FROM leads WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1`,
    sql`
      SELECT to_char(date, 'YYYY-MM') AS month, COALESCE(sum(amount), 0) AS spend
      FROM expenses WHERE status='paid' GROUP BY 1`,
  ]);

  // Two independent aggregates merged in JS — the previous version tried
  // to correlate a subquery on l.created_at against an outer query
  // grouped by to_char(l.created_at, ...), which Postgres rejects
  // ("subquery uses ungrouped column") since the raw column isn't in the
  // GROUP BY, only its derived alias is. This avoids the correlation
  // entirely instead of trying to patch around it.
  const spendByMonth = new Map((expensesByMonth as any[]).map(r => [r.month, Number(r.spend)]));
  const monthlyTrend = (leadsByMonth as any[]).map(r => ({ month: r.month, leads: r.leads, spend: spendByMonth.get(r.month) || 0 }));

  const campaignRows = (byCampaign as any[]).map(c => ({
    campaign: c.campaign, leads: c.leads, placements: c.placements,
    cost_per_lead_approx: c.leads > 0 ? Math.round(Number(c.total_marketing_spend) / c.leads) : null,
    cost_per_placement_approx: c.placements > 0 ? Math.round(Number(c.total_marketing_spend) / c.placements) : null,
  }));
  const coordinatorRows = (byCoordinator as any[]).map(c => ({
    coordinator_name: c.coordinator_name, leads: c.leads, placements: c.placements,
    cost_per_lead: c.leads > 0 ? Math.round(Number(c.event_spend) / c.leads) : null,
    cost_per_placement: c.placements > 0 ? Math.round(Number(c.event_spend) / c.placements) : null,
  }));

  return NextResponse.json({
    by_campaign: campaignRows, by_coordinator: coordinatorRows, monthly_trend: monthlyTrend,
    campaign_note: "expenses אין שדה קמפיין — עלות-לקמפיין היא קירוב (סה\"כ הוצאות שיווק ÷ לידי אותו מקור), לא עלות אמיתית לכל קמפיין בנפרד.",
  });
}
