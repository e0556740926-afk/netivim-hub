import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const now = new Date();
  const month = now.getMonth() + 1, year = now.getFullYear();

  const [sources, targets, orgTargetRow] = await Promise.all([
    sql`
      SELECT ls.id, ls.label, ls.coordinator_id, ls.active,
        (SELECT count(*)::int FROM leads l WHERE l.lead_source_id = ls.id AND l.deleted_at IS NULL) AS total_all_time,
        (SELECT count(*)::int FROM leads l WHERE l.lead_source_id = ls.id AND l.deleted_at IS NULL
          AND EXTRACT(MONTH FROM l.created_at) = ${month} AND EXTRACT(YEAR FROM l.created_at) = ${year}) AS total_this_month
      FROM lead_sources ls WHERE ls.active = true ORDER BY total_this_month DESC`,
    sql`SELECT lead_source_id, target_leads FROM lead_source_targets WHERE month=${month} AND year=${year}`,
    sql`SELECT value FROM app_settings WHERE key='org_lead_target_monthly'`,
  ]);

  const targetMap = new Map((targets as any[]).map(t => [t.lead_source_id, t.target_leads]));
  const rows = (sources as any[]).map(s => ({ ...s, target_leads: targetMap.get(s.id) || 0 }));

  // Attributed vs total: leads without a lead_source_id at all (mostly
  // historical, from before this field was mandatory) aren't counted
  // under any source — surfaced separately so the numbers stay honest
  // rather than silently under-reporting the org total.
  const [{ n: totalLeadsThisMonth }] = await sql`
    SELECT count(*)::int AS n FROM leads WHERE deleted_at IS NULL
      AND EXTRACT(MONTH FROM created_at) = ${month} AND EXTRACT(YEAR FROM created_at) = ${year}`;
  const attributedThisMonth = rows.reduce((s, r) => s + r.total_this_month, 0);

  return NextResponse.json({
    month, year,
    sources: rows,
    org_target: Number((orgTargetRow as any[])[0]?.value) || 0,
    total_this_month: totalLeadsThisMonth,
    unattributed_this_month: totalLeadsThisMonth - attributedThisMonth,
  });
}

/** { lead_source_id, target_leads } — sets this month's target for one source. */
export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.lead_source_id) return NextResponse.json({ error: "missing lead_source_id" }, { status: 400 });
  const now = new Date();
  await sql`
    INSERT INTO lead_source_targets (lead_source_id, month, year, target_leads)
    VALUES (${d.lead_source_id}, ${now.getMonth() + 1}, ${now.getFullYear()}, ${d.target_leads || 0})
    ON CONFLICT (lead_source_id, month, year) DO UPDATE SET target_leads=${d.target_leads || 0}`;
  return NextResponse.json({ ok: true });
}

/** { org_target } — the overall organizational monthly target, set manually. */
export async function PATCH(req: NextRequest) {
  const { org_target } = await req.json();
  await sql`
    INSERT INTO app_settings (key, value) VALUES ('org_lead_target_monthly', ${String(org_target || 0)})
    ON CONFLICT (key) DO UPDATE SET value=${String(org_target || 0)}`;
  return NextResponse.json({ ok: true });
}
