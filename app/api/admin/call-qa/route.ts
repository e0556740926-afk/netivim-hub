import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

/**
 * Flag rules per spec §4.1: too-short-but-marked-positive, too-long,
 * undocumented, or a case with 4+ calls and no status progression.
 * Implemented as a real query — it will simply return zero rows until
 * calls actually exist (blocked on the Aspire integration), rather than
 * faking flagged entries.
 */
export async function GET() {
  const flagged = await sql`
    SELECT c.*, l.name AS case_name
    FROM calls c LEFT JOIN leads l ON l.id = c.case_id
    WHERE c.flagged = true
    ORDER BY c.created_at DESC`;
  const totalCalls = await sql`SELECT count(*)::int AS n FROM calls`;
  return NextResponse.json({ flagged, total_calls: (totalCalls as any[])[0].n });
}

/** { call_id, opening, need_identification, professional_fit, closing, documentation_quality } — each 0-1, weighted 0.20 default each per project decision. */
export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.call_id) return NextResponse.json({ error: "missing call_id" }, { status: 400 });
  const weightRows = await sql`SELECT key, value FROM app_settings WHERE key LIKE 'qa_weight_%'`;
  const wMap = new Map((weightRows as any[]).map(r => [r.key, Number(r.value)]));
  const w = {
    opening: wMap.get("qa_weight_opening") ?? 0.2,
    need: wMap.get("qa_weight_need") ?? 0.2,
    fit: wMap.get("qa_weight_fit") ?? 0.2,
    closing: wMap.get("qa_weight_closing") ?? 0.2,
    docs: wMap.get("qa_weight_docs") ?? 0.2,
  };
  const score = (d.opening || 0) * w.opening + (d.need_identification || 0) * w.need + (d.professional_fit || 0) * w.fit + (d.closing || 0) * w.closing + (d.documentation_quality || 0) * w.docs;
  const needsCalibration = score >= 0.4 && score <= 0.6; // borderline band — flagged for team calibration
  const rows = await sql`
    INSERT INTO call_qa_scores (call_id, opening, need_identification, professional_fit, closing, documentation_quality, computed_score, needs_calibration, scored_by)
    VALUES (${d.call_id}, ${d.opening}, ${d.need_identification}, ${d.professional_fit}, ${d.closing}, ${d.documentation_quality}, ${score * 100}, ${needsCalibration}, ${d.scored_by || null})
    RETURNING *`;
  return NextResponse.json({ score: rows[0] });
}
