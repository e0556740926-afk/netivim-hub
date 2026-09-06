import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`SELECT * FROM arrival_channels ORDER BY sort_order, label`;
  return NextResponse.json({ arrival_channels: rows });
}

export async function POST(req: NextRequest) {
  const { label } = await req.json();
  if (!label) return NextResponse.json({ error: "missing label" }, { status: 400 });
  const rows = await sql`INSERT INTO arrival_channels (label) VALUES (${label}) ON CONFLICT (label) DO NOTHING RETURNING *`;
  return NextResponse.json({ arrival_channel: rows[0] || null });
}

export async function PATCH(req: NextRequest) {
  const { id, active } = await req.json();
  await sql`UPDATE arrival_channels SET active=${active} WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
