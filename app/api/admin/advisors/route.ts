import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

const CATEGORIES = ["קרבי", "טכנולוגי", "הסדר", "מכינה", 'תומכ"ל', "תיכונית"];

export async function GET() {
  const advisors = await sql`SELECT id, name, specializations, available, role FROM users WHERE status='active' ORDER BY name`;

  // Live load per advisor: active cases owned + open tasks assigned + items
  // currently sitting in their follow-up/support columns. No known-good
  // threshold exists yet (per spec §4.3) — this is a display-only weighted
  // count, it never blocks assignment.
  const load = await sql`
    SELECT u.name,
      (SELECT count(*)::int FROM leads l WHERE l.owner_name = u.name AND l.advisor_status NOT IN ('לא פעיל','הסתיים בהצלחה')) AS active_cases,
      (SELECT count(*)::int FROM tasks t WHERE t.assigned_to = u.id AND t.status != 'done') AS open_tasks,
      (SELECT count(*)::int FROM leads l WHERE l.owner_name = u.name AND l.advisor_status = 'לא פעיל') AS followup_items
    FROM users u WHERE u.status='active'`;

  const weightRows = await sql`SELECT key, value FROM app_settings WHERE key LIKE 'assign_weight_%'`;
  const weightMap = new Map((weightRows as any[]).map(r => [r.key, Number(r.value)]));
  const weights = {
    specialization: weightMap.get("assign_weight_specialization") ?? 0.4,
    availability: weightMap.get("assign_weight_availability") ?? 0.3,
    load: weightMap.get("assign_weight_load") ?? 0.3,
  };

  const loadWithScore = (load as any[]).map(l => ({
    ...l,
    load_score: l.active_cases + l.open_tasks * 0.5 + l.followup_items * 0.3,
  }));

  return NextResponse.json({ advisors, load: loadWithScore, weights, categories: CATEGORIES });
}

/** { user_id, specializations?: string[], available?: boolean } */
export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.user_id) return NextResponse.json({ error: "missing user_id" }, { status: 400 });
  if (d.specializations !== undefined) await sql`UPDATE users SET specializations=${d.specializations} WHERE id=${d.user_id}`;
  if (d.available !== undefined) await sql`UPDATE users SET available=${d.available} WHERE id=${d.user_id}`;
  return NextResponse.json({ ok: true });
}

/** { weight_specialization?, weight_availability?, weight_load? } — each 0-1 */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const keys = { weight_specialization: "assign_weight_specialization", weight_availability: "assign_weight_availability", weight_load: "assign_weight_load" };
  for (const [k, dbKey] of Object.entries(keys)) {
    if (d[k] === undefined) continue;
    await sql`INSERT INTO app_settings (key, value) VALUES (${dbKey}, ${String(d[k])}) ON CONFLICT (key) DO UPDATE SET value=${String(d[k])}`;
  }
  return NextResponse.json({ ok: true });
}
