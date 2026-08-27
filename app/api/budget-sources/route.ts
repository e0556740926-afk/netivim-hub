import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year") || new Date().getFullYear().toString();
  const rows = await sql`SELECT * FROM budget_sources WHERE year = ${parseInt(year)} ORDER BY name`;
  return NextResponse.json({ sources: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO budget_sources (name, description, total_amount, used_amount, year, category, status)
    VALUES (${d.name}, ${d.description||''}, ${d.total_amount||0}, ${d.used_amount||0}, ${d.year||new Date().getFullYear()}, ${d.category||'other'}, 'active')
    RETURNING *`;
  return NextResponse.json({ source: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  await sql`UPDATE budget_sources SET name=${d.name}, description=${d.description||''}, total_amount=${d.total_amount||0}, used_amount=${d.used_amount||0}, category=${d.category||'other'}, status=${d.status} WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM budget_sources WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
