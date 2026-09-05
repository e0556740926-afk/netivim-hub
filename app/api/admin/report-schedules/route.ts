import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";

export async function GET() {
  const rows = await sql`SELECT * FROM report_schedules ORDER BY created_at DESC`;
  return NextResponse.json({ schedules: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.name || !d.recipients?.length) return NextResponse.json({ error: "missing name/recipients" }, { status: 400 });
  const me = await currentUser(req);
  const rows = await sql`
    INSERT INTO report_schedules (name, frequency, recipients, report_type, filters, created_by)
    VALUES (${d.name}, ${d.frequency || 'weekly'}, ${d.recipients}, ${d.report_type || 'anomalies'}, ${JSON.stringify(d.filters || {})}::jsonb, ${me?.name || null})
    RETURNING *`;
  return NextResponse.json({ schedule: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await sql`UPDATE report_schedules SET active=${d.active} WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM report_schedules WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
