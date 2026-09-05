import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

/**
 * Suggests organizations/programs for a case's referral wizard step 1.
 * This is a deliberately simple, transparent scoring heuristic — not a
 * trained matching model, since none exists. Score (0-100):
 *   +40 base
 *   +40 if the org or program category shares a word with the case's
 *       stated interest (case-insensitive substring match)
 *   +20 if a program has remaining capacity (capacity - current_count > 0);
 *       omitted (no bonus, no penalty) when there's no program row to check
 * Every returned item carries `reason` explaining which parts fired, so the
 * advisor can see why something was suggested rather than trusting a bare
 * number — matches the spec's "the suggestion is only that, the advisor
 * decides" framing (§7.1).
 */
export async function GET(req: NextRequest) {
  const caseId = req.nextUrl.searchParams.get("case_id");
  if (!caseId) return NextResponse.json({ error: "missing case_id" }, { status: 400 });

  const [caseRow] = await sql`SELECT interest, age, city FROM leads WHERE id=${Number(caseId)}`;
  if (!caseRow) return NextResponse.json({ error: "case not found" }, { status: 404 });

  const orgs = await sql`SELECT id, name, category, region FROM organizations ORDER BY name`;
  const programs = await sql`SELECT * FROM org_programs`;

  const interest = (caseRow.interest || "").toLowerCase();
  const results: any[] = [];

  for (const o of orgs as any[]) {
    const orgPrograms = (programs as any[]).filter(p => p.organization_id === o.id);
    const candidates = orgPrograms.length ? orgPrograms : [null];

    for (const p of candidates) {
      let score = 40;
      const reasons: string[] = [];
      const category = (p?.category || o.category || "").toLowerCase();
      if (category && interest && (category.includes(interest) || interest.includes(category))) {
        score += 40;
        reasons.push("קטגוריה תואמת לתחום העניין");
      }
      let capacityLeft: number | null = null;
      if (p) {
        capacityLeft = p.capacity != null ? p.capacity - (p.current_count || 0) : null;
        if (capacityLeft !== null) {
          if (capacityLeft > 0) { score += 20; reasons.push(`${capacityLeft} מקומות פנויים`); }
          else reasons.push("אין מקומות פנויים כרגע");
        }
      }
      if (caseRow.age && p?.age_min != null && p?.age_max != null) {
        if (caseRow.age >= p.age_min && caseRow.age <= p.age_max) reasons.push("מתאים בגיל");
      }
      results.push({
        organization_id: o.id, organization_name: o.name, organization_region: o.region,
        program_id: p?.id || null, program_name: p?.name || null,
        match_pct: Math.min(100, score), capacity_left: capacityLeft,
        reason: reasons.join(" · ") || "התאמה בסיסית בלבד — אין מספיק נתונים",
      });
    }
  }

  results.sort((a, b) => b.match_pct - a.match_pct);
  return NextResponse.json({ suggested: results.slice(0, 5), all_organizations: orgs });
}
