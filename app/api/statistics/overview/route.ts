import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import { narrateAnomalies } from "@/lib/gemini";
import sql from "@/lib/db";

const MIN_SAMPLE = 3;
const MIN_HISTORY_MONTHS = 2;
const THRESHOLD = 0.5;
const CITY_POSITIONS: Record<string, { x: number; y: number }> = {
  "ירושלים": { x: 62, y: 62 }, "בני ברק": { x: 48, y: 38 }, "אשדוד": { x: 38, y: 68 },
  "בית שמש": { x: 55, y: 58 }, "מודיעין עילית": { x: 55, y: 48 }, "אלעד": { x: 50, y: 44 },
  "ביתר עילית": { x: 58, y: 55 }, "פתח תקווה": { x: 47, y: 34 },
};

/**
 * Performance fix: the statistics page used to fire 7 separate fetch()
 * calls (cost, propensity, anomalies, median-time, conversion-simple,
 * outcome-metrics, geo) on load — 7 browser round-trips, each its own
 * serverless invocation and its own canAccessStatistics() auth check.
 * This combines them into one request: one auth check, one set of
 * server-side Promise.all-parallel queries, one response. The 7
 * original routes are left in place, but the page itself now calls
 * only this endpoint for this batch.
 */
export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const [
    byCampaign, byCoordinatorCost, leadsByMonth, expensesByMonth,
    propensityRows, anomalyRows, medianRows, convBySource, convByCoordinator,
    outcomeOverall, outcomeByAdvisor, geoRows,
  ] = await Promise.all([
    sql`
      SELECT l.source AS campaign, count(DISTINCT l.id)::int AS leads,
        count(DISTINCT l.id) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placements,
        (SELECT COALESCE(sum(e.amount), 0) FROM expenses e WHERE e.status='paid' AND e.category='marketing') AS total_marketing_spend
      FROM leads l WHERE l.deleted_at IS NULL GROUP BY l.source`,
    sql`
      SELECT c.name AS coordinator_name, count(DISTINCT l.id)::int AS leads,
        count(DISTINCT l.id) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placements,
        (SELECT COALESCE(sum(ex.amount), 0) FROM expenses ex WHERE ex.status='paid' AND ex.event_id IN (SELECT id FROM events WHERE coordinator_id = c.id)) AS event_spend
      FROM coordinators c LEFT JOIN leads l ON l.coordinator_id = c.id AND l.deleted_at IS NULL
      GROUP BY c.id, c.name`,
    sql`SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS leads FROM leads WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1`,
    sql`SELECT to_char(date, 'YYYY-MM') AS month, COALESCE(sum(amount), 0) AS spend FROM expenses WHERE status='paid' GROUP BY 1`,
    sql`
      SELECT
        CASE WHEN age BETWEEN 15 AND 16 THEN '15-16' WHEN age BETWEEN 17 AND 18 THEN '17-18' WHEN age >= 19 THEN '19+' ELSE 'לא ידוע' END AS age_bucket,
        COALESCE(NULLIF(city, ''), 'לא ידוע') AS city, COALESCE(sector, 'לא ידוע') AS sector, source,
        count(*)::int AS total,
        count(*) FILTER (WHERE advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
      FROM leads WHERE deleted_at IS NULL GROUP BY 1, 2, 3, 4 HAVING count(*) >= 1
      ORDER BY (count(*) FILTER (WHERE advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה')))::float / count(*) DESC`,
    sql`
      SELECT c.name AS coordinator_name, to_char(l.created_at, 'YYYY-MM') AS month,
        count(*)::int AS leads, count(*) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
      FROM coordinators c JOIN leads l ON l.coordinator_id = c.id WHERE l.deleted_at IS NULL
      GROUP BY c.name, 2 ORDER BY c.name, 2`,
    sql`
      WITH ordered AS (
        SELECT h.case_id, h.from_status, h.to_status, h.changed_at,
          COALESCE(LAG(h.changed_at) OVER (PARTITION BY h.case_id ORDER BY h.changed_at), l.created_at) AS prev_at
        FROM case_status_history h JOIN leads l ON l.id = h.case_id
      )
      SELECT from_status, to_status, count(*)::int AS n,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (changed_at - prev_at)) / 86400) AS median_days
      FROM ordered GROUP BY from_status, to_status ORDER BY median_days DESC NULLS LAST`,
    sql`
      SELECT ls.label, count(l.id)::int AS total,
        count(l.id) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
      FROM lead_sources ls LEFT JOIN leads l ON l.lead_source_id = ls.id AND l.deleted_at IS NULL
      GROUP BY ls.label HAVING count(l.id) > 0 ORDER BY placed DESC`,
    sql`
      SELECT c.name AS coordinator_name, count(l.id)::int AS total,
        count(l.id) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
      FROM coordinators c LEFT JOIN leads l ON l.coordinator_id = c.id AND l.deleted_at IS NULL
      GROUP BY c.name HAVING count(l.id) > 0 ORDER BY placed DESC`,
    sql`
      SELECT count(*)::int AS sent, count(responded_at)::int AS responded,
        avg(personalized_score)::float AS avg_personalized, avg(nps)::float AS avg_nps
      FROM feedback_responses`,
    sql`
      SELECT owner_name, count(*)::int AS sent, count(responded_at)::int AS responded,
        round(avg(personalized_score)::numeric, 1) AS avg_personalized, round(avg(nps)::numeric, 1) AS avg_nps
      FROM feedback_responses WHERE owner_name IS NOT NULL GROUP BY owner_name ORDER BY responded DESC`,
    sql`SELECT COALESCE(NULLIF(city, ''), 'לא ידוע') AS city, count(*)::int AS n FROM leads WHERE deleted_at IS NULL GROUP BY 1 ORDER BY n DESC`,
  ]);

  const spendByMonth = new Map((expensesByMonth as any[]).map(r => [r.month, Number(r.spend)]));
  const monthlyTrend = (leadsByMonth as any[]).map(r => ({ month: r.month, leads: r.leads, spend: spendByMonth.get(r.month) || 0 }));
  const cost = {
    by_campaign: (byCampaign as any[]).map(c => ({
      campaign: c.campaign, leads: c.leads, placements: c.placements,
      cost_per_lead_approx: c.leads > 0 ? Math.round(Number(c.total_marketing_spend) / c.leads) : null,
      cost_per_placement_approx: c.placements > 0 ? Math.round(Number(c.total_marketing_spend) / c.placements) : null,
    })),
    by_coordinator: (byCoordinatorCost as any[]).map(c => ({
      coordinator_name: c.coordinator_name, leads: c.leads, placements: c.placements,
      cost_per_lead: c.leads > 0 ? Math.round(Number(c.event_spend) / c.leads) : null,
      cost_per_placement: c.placements > 0 ? Math.round(Number(c.event_spend) / c.placements) : null,
    })),
    monthly_trend: monthlyTrend,
    campaign_note: "expenses אין שדה קמפיין — עלות-לקמפיין היא קירוב (סה\"כ הוצאות שיווק ÷ לידי אותו מקור), לא עלות אמיתית לכל קמפיין בנפרד.",
  };

  const propensity = {
    combinations: (propensityRows as any[]).map(r => ({ ...r, placement_rate: r.total > 0 ? Math.round((r.placed / r.total) * 100) : 0, reliable: r.total >= MIN_SAMPLE })),
    methodology: "שיעור המרה בפועל (שובצו÷סה\"כ) לכל שילוב גיל/עיר/מגזר/מקור, מהיסטוריית סטטוסים אמיתית — לא מודל למידת מכונה. שילובים עם פחות מ-3 תיקים מסומנים 'לא מהימן סטטיסטית' ולא רק מוסתרים.",
  };

  const byCoordinatorHist = new Map<string, { month: string; rate: number }[]>();
  for (const r of anomalyRows as any[]) {
    const rate = r.leads > 0 ? r.placed / r.leads : 0;
    if (!byCoordinatorHist.has(r.coordinator_name)) byCoordinatorHist.set(r.coordinator_name, []);
    byCoordinatorHist.get(r.coordinator_name)!.push({ month: r.month, rate });
  }
  const anomalies: any[] = [];
  const insufficientData: string[] = [];
  for (const [name, months] of byCoordinatorHist) {
    if (months.length <= MIN_HISTORY_MONTHS) { insufficientData.push(name); continue; }
    const current = months[months.length - 1];
    const history = months.slice(0, -1);
    const avg = history.reduce((s, m) => s + m.rate, 0) / history.length;
    if (avg === 0) continue;
    const deviation = (current.rate - avg) / avg;
    if (Math.abs(deviation) >= THRESHOLD) {
      anomalies.push({ coordinator_name: name, month: current.month, current_rate: Math.round(current.rate * 100), historical_avg: Math.round(avg * 100), deviation_pct: Math.round(deviation * 100) });
    }
  }
  const stories = await narrateAnomalies(anomalies);
  if (stories) anomalies.forEach((a, i) => { a.story = stories[i]; });

  const known = (geoRows as any[]).filter(r => CITY_POSITIONS[r.city]).map(r => ({ ...r, ...CITY_POSITIONS[r.city] }));
  const unknownCount = (geoRows as any[]).find(r => r.city === "לא ידוע")?.n || 0;

  return NextResponse.json({
    cost, propensity,
    anomalies: {
      anomalies, insufficient_data_for: insufficientData,
      methodology: `סטייה של ${THRESHOLD * 100}%+ בשיעור ההמרה החודשי מול ממוצע ${MIN_HISTORY_MONTHS}+ החודשים הקודמים.`,
    },
    median_time: { transitions: medianRows, note: "מבוסס על case_status_history — ככל שיצטברו יותר מעברים אמיתיים, המספר יתייצב." },
    conversion_simple: {
      by_source: (convBySource as any[]).map(r => ({ ...r, rate: r.total > 0 ? Math.round((r.placed / r.total) * 100) : 0 })),
      by_coordinator: (convByCoordinator as any[]).map(r => ({ ...r, rate: r.total > 0 ? Math.round((r.placed / r.total) * 100) : 0 })),
    },
    outcome_metrics: { overall: (outcomeOverall as any[])[0], by_advisor: outcomeByAdvisor },
    geo: { cities: known, unknown_city_count: unknownCount, note: "מפה סכמטית — גודל הבועה משקף כמות לידים בלבד." },
  });
}
