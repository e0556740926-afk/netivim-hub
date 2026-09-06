import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`
    SELECT p.*,
      (SELECT array_agg(l.name) FROM parent_leads pl JOIN leads l ON l.id = pl.case_id WHERE pl.parent_id = p.id) AS children_names,
      (SELECT count(*)::int FROM parent_leads pl WHERE pl.parent_id = p.id) AS children_count
    FROM parents p ORDER BY p.name`;
  return NextResponse.json({ parents: rows });
}

/** { name, phone, email, relation } — creates a standalone parent record, not yet linked to any case. */
export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const rows = await sql`INSERT INTO parents (name, phone, email, relation) VALUES (${d.name}, ${d.phone || null}, ${d.email || null}, ${d.relation || null}) RETURNING *`;
  return NextResponse.json({ parent: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await sql`UPDATE parents SET name=${d.name}, phone=${d.phone || null}, email=${d.email || null}, relation=${d.relation || null} WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}
