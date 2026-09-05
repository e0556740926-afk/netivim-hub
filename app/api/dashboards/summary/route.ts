import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAutomationSettings } from "@/lib/automation-settings";

/**
 * One shared aggregation endpoint for the three management dashboards
 * (G1 Executive, G2 CEO, G3 Funder) — they overlap heavily (funnel,
 * category split, dropout reasons, demographics, budget utilization),
 * so this computes each metric once from real data rather than three
 * times with drift risk between them.
 *
 * Everything here is a real query against live tables. Where the mock
 * shows a number with no backing data model in this system (call-center
 * QC, staffing positions, campaign-level dropout), the corresponding
 * field is `null` and the UI shows an honest empty state instead of a
 * fabricated figure.
 */
export async function GET() {
  const settings = await getAutomationSettings();
  const [
    totals, dropout, demographics, categoryPlacements, budgetSources,
    coordinatorPerf, pendingExpenses, pendingRequests, monthlyPlacements,
    responseTime, processDuration,
  ] = await Promise.all([
    sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE first_touch_at IS NOT NULL)::int AS contacted,
        count(*) FILTER (WHERE advisor_status NOT IN ('פנייה חדשה'))::int AS active_process,
        count(DISTINCT r.case_id)::int AS referred,
        count(DISTINCT r.case_id) FILTER (WHERE r.status = 'התקבל')::int AS accepted,
        count(*) FILTER (WHERE advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
      FROM leads l LEFT JOIN referrals r ON r.case_id = l.id
      WHERE l.deleted_at IS NULL`,
    sql`
      SELECT inactive_reason, count(*)::int AS n FROM leads
      WHERE advisor_status = 'לא פעיל' AND inactive_reason IS NOT NULL
      GROUP BY inactive_reason ORDER BY n DESC`,
    sql`
      SELECT
        count(*) FILTER (WHERE age BETWEEN 15 AND 16)::int AS age_15_16,
        count(*) FILTER (WHERE age BETWEEN 17 AND 18)::int AS age_17_18,
        count(*) FILTER (WHERE age >= 19)::int AS age_19_plus
      FROM leads WHERE deleted_at IS NULL`,
    sql`
      SELECT COALESCE(op.category, o.category, 'לא סווג') AS category, count(*)::int AS n
      FROM referrals r
      JOIN organizations o ON o.id = r.organization_id
      LEFT JOIN org_programs op ON op.id = r.program_id
      WHERE r.status IN ('התקבל')
      GROUP BY 1 ORDER BY n DESC`,
    sql`
      SELECT funder, amount,
        (SELECT COALESCE(sum(e.amount), 0) FROM expenses e WHERE e.funding_source_id = fs.id) AS used
      FROM funding_sources fs`,
    sql`
      SELECT c.name AS coordinator_name, mt.target_leads,
        (SELECT count(*)::int FROM leads l WHERE l.coordinator_id = c.id
          AND date_trunc('month', l.created_at) = date_trunc('month', now())) AS actual_leads
      FROM monthly_targets mt JOIN coordinators c ON c.id = mt.coordinator_id
      WHERE mt.month = EXTRACT(MONTH FROM now())::int AND mt.year = EXTRACT(YEAR FROM now())::int`,
    sql`SELECT count(*)::int AS n, COALESCE(sum(amount),0) AS total FROM expenses WHERE status='pending'`,
    sql`SELECT count(*)::int AS n FROM purchase_requests WHERE status='pending'`,
    sql`
      SELECT to_char(changed_at, 'YYYY-MM') AS month, count(*)::int AS n
      FROM case_status_history WHERE to_status = 'שובץ במסגרת'
        AND changed_at >= now() - interval '12 months'
      GROUP BY 1 ORDER BY 1`,
    sql`
      SELECT avg(EXTRACT(EPOCH FROM (first_touch_at - created_at)) / 3600)::float AS avg_hours,
        count(*) FILTER (WHERE EXTRACT(EPOCH FROM (first_touch_at - created_at)) / 3600 > ${settings.sla_hours})::int AS breaching
      FROM leads WHERE first_touch_at IS NOT NULL AND deleted_at IS NULL`,
    sql`
      SELECT avg(EXTRACT(EPOCH FROM (h2.changed_at - h1.changed_at)) / 86400)::float AS avg_days
      FROM case_status_history h1
      JOIN case_status_history h2 ON h2.case_id = h1.case_id AND h2.to_status = 'הופנה למסגרת' AND h2.changed_at > h1.changed_at
      WHERE h1.to_status = 'בתהליך ייעוץ'`,
  ]);

  const t = (totals as any[])[0];
  const dropoutTotal = (dropout as any[]).reduce((s, d) => s + d.n, 0);

  return NextResponse.json({
    funnel: {
      total_inquiries: t.total, contacted: t.contacted, active_process: t.active_process,
      referred: t.referred, accepted: t.accepted, placed: t.placed,
      conversion_rate: t.total > 0 ? Math.round((t.placed / t.total) * 100) : null,
    },
    dropout_reasons: (dropout as any[]).map(d => ({ reason: d.inactive_reason, count: d.n, pct: dropoutTotal > 0 ? Math.round((d.n / dropoutTotal) * 100) : 0 })),
    demographics: (demographics as any[])[0],
    category_placements: categoryPlacements,
    budget_sources: (budgetSources as any[]).map(b => ({ funder: b.funder, amount: Number(b.amount), used: Number(b.used) })),
    coordinator_performance: coordinatorPerf,
    pending_approvals: { expenses_count: (pendingExpenses as any[])[0].n, expenses_total: Number((pendingExpenses as any[])[0].total), requests_count: (pendingRequests as any[])[0].n },
    monthly_placements: monthlyPlacements,
    response_time: { avg_hours: (responseTime as any[])[0]?.avg_hours ?? null, breaching_count: (responseTime as any[])[0]?.breaching ?? 0, sla_hours: settings.sla_hours },
    process_duration: { avg_days: (processDuration as any[])[0]?.avg_days ?? null },
    // Explicitly no data model exists for these yet — surfaced as null so
    // the UI can show an honest "not available" state instead of 0 or a
    // made-up number.
    call_center_qc: null,
    staffing_positions: null,
    retention_rates: null,
  });
}
