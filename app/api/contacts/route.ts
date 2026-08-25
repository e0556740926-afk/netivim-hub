import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  const rows = cid
    ? await sql`SELECT c.*, COALESCE(i.cnt,0)::int as interaction_count FROM contacts c LEFT JOIN (SELECT contact_id, COUNT(*) as cnt FROM interactions GROUP BY contact_id) i ON i.contact_id=c.id WHERE c.coordinator_id=${parseInt(cid)} ORDER BY c.name`
    : await sql`SELECT c.*, COALESCE(i.cnt,0)::int as interaction_count FROM contacts c LEFT JOIN (SELECT contact_id, COUNT(*) as cnt FROM interactions GROUP BY contact_id) i ON i.contact_id=c.id ORDER BY c.name`;
  return NextResponse.json({ contacts: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO contacts (coordinator_id,owner,name,org,role,phone,email,type,status,potential,last_contact,notes)
    VALUES (${d.coordinator_id||null},${d.owner||''},${d.name},${d.org||''},${d.role||''},${d.phone||''},${d.email||''},${d.type||'partner'},${d.status||'cold'},${d.potential||1},${d.last_contact||null},${d.notes||''})
    RETURNING *`;
  return NextResponse.json({ contact: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  await sql`UPDATE contacts SET name=${d.name},org=${d.org||''},role=${d.role||''},phone=${d.phone||''},email=${d.email||''},type=${d.type},status=${d.status},potential=${d.potential||1},last_contact=${d.last_contact||null},notes=${d.notes||''},owner=${d.owner||''} WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM contacts WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}