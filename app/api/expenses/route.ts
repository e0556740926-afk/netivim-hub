import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`SELECT e.*, ev.name as event_name FROM expenses e LEFT JOIN events ev ON ev.id=e.event_id ORDER BY e.date DESC`;
  return NextResponse.json({ expenses: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO expenses (event_id,description,vendor,amount,date,status,category)
    VALUES (${d.event_id||null},${d.description},${d.vendor||''},${d.amount||0},${d.date||null},${d.status||'pending'},${d.category||'other'})
    RETURNING *`;
  return NextResponse.json({ expense: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  await sql`UPDATE expenses SET event_id=${d.event_id||null},description=${d.description},vendor=${d.vendor||''},amount=${d.amount||0},date=${d.date||null},status=${d.status},category=${d.category||'other'} WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM expenses WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}