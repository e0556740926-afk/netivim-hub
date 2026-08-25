import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO interactions (contact_id,coordinator_id,date,type,summary,next_step)
    VALUES (${d.contact_id},${d.coordinator_id||null},${d.date},${d.type||'call'},${d.summary||''},${d.next_step||''})
    RETURNING *`;
  await sql`UPDATE contacts SET last_contact=${d.date} WHERE id=${d.contact_id}`;
  return NextResponse.json({ interaction: rows[0] });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM interactions WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}