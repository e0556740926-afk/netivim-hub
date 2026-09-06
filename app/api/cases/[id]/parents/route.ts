import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT p.* FROM parents p JOIN parent_leads pl ON pl.parent_id = p.id WHERE pl.case_id=${Number(id)} ORDER BY p.name`;
  return NextResponse.json({ parents: rows });
}

/**
 * { parent_id } to link an existing parent, or { name, phone, email, relation } to create+link a new one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await req.json();
  let parentId = d.parent_id;
  if (!parentId) {
    if (!d.name) return NextResponse.json({ error: "missing parent_id or name" }, { status: 400 });
    const rows = await sql`INSERT INTO parents (name, phone, email, relation) VALUES (${d.name}, ${d.phone || null}, ${d.email || null}, ${d.relation || null}) RETURNING id`;
    parentId = rows[0].id;
  }
  await sql`INSERT INTO parent_leads (parent_id, case_id) VALUES (${parentId}, ${Number(id)}) ON CONFLICT DO NOTHING`;
  return NextResponse.json({ ok: true, parent_id: parentId });
}

/** { parent_id } — unlinks this parent from this case only. Does NOT delete the parent record (they may be linked to a sibling too). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { parent_id } = await req.json();
  await sql`DELETE FROM parent_leads WHERE parent_id=${parent_id} AND case_id=${Number(id)}`;
  return NextResponse.json({ ok: true });
}
