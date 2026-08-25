import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  if (!cid) return NextResponse.json({ leads: [] });
  const leads = await sql`SELECT * FROM leads WHERE coordinator_id = ${parseInt(cid)} ORDER BY created_at DESC`;
  return NextResponse.json({ leads });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO leads (coordinator_id, name, phone, city, age, interest, source, status, event_id)
    VALUES (${d.coordinator_id}, ${d.name}, ${d.phone}, ${d.city||''}, ${d.age||null}, ${d.interest||'training'}, ${d.source||'manual'}, 'new', ${d.event_id||null})
    RETURNING *
  `;
  return NextResponse.json({ lead: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  await sql`UPDATE leads SET status = ${status} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
