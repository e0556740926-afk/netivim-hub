import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`
    SELECT m.*, c.name as coordinator_name, c.area
    FROM meetings m
    JOIN coordinators c ON c.id = m.coordinator_id
    ORDER BY m.date DESC
  `;
  return NextResponse.json({ meetings: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO meetings (coordinator_id, manager_id, date, type, agenda, summary, next_meeting_date)
    VALUES (${d.coordinator_id}, ${d.manager_id||null}, ${d.date}, ${d.type||'regular'}, ${d.agenda||''}, ${d.summary||''}, ${d.next_meeting_date||null})
    RETURNING *
  `;
  return NextResponse.json({ meeting: rows[0] });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM meetings WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
