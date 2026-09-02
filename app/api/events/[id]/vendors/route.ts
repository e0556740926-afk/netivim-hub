import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await sql`SELECT * FROM event_vendors WHERE event_id=${parseInt(id)} ORDER BY created_at ASC`;
  return NextResponse.json({ vendors: rows });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await req.json();
  if (!d.name?.trim()) return NextResponse.json({ error: "שם הספק הוא שדה חובה" }, { status: 400 });
  const rows = await sql`
    INSERT INTO event_vendors (event_id, name, category, contact, amount, deposit_paid, notes)
    VALUES (${parseInt(id)}, ${d.name.trim()}, ${d.category||'other'}, ${d.contact||''}, ${d.amount||0}, ${d.deposit_paid||false}, ${d.notes||''})
    RETURNING *`;
  return NextResponse.json({ vendor: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await sql`UPDATE event_vendors SET
    name=${d.name}, category=${d.category||'other'}, contact=${d.contact||''},
    amount=${d.amount||0}, deposit_paid=${d.deposit_paid||false}, notes=${d.notes||''}
    WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM event_vendors WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
