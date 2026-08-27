import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";

const WITH_COUNTS = `
  SELECT c.*, COALESCE(i.cnt,0)::int as interaction_count
  FROM contacts c
  LEFT JOIN (SELECT contact_id, COUNT(*) as cnt FROM interactions GROUP BY contact_id) i
    ON i.contact_id = c.id`;

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  const soft = await hasColumn("contacts", "deleted_at");

  let rows;
  if (cid) {
    const id = parseInt(cid);
    rows = soft
      ? await sql`SELECT c.*, COALESCE(i.cnt,0)::int as interaction_count FROM contacts c LEFT JOIN (SELECT contact_id, COUNT(*) as cnt FROM interactions GROUP BY contact_id) i ON i.contact_id=c.id WHERE c.coordinator_id=${id} AND c.deleted_at IS NULL ORDER BY c.name`
      : await sql`SELECT c.*, COALESCE(i.cnt,0)::int as interaction_count FROM contacts c LEFT JOIN (SELECT contact_id, COUNT(*) as cnt FROM interactions GROUP BY contact_id) i ON i.contact_id=c.id WHERE c.coordinator_id=${id} ORDER BY c.name`;
  } else {
    rows = soft
      ? await sql`SELECT c.*, COALESCE(i.cnt,0)::int as interaction_count FROM contacts c LEFT JOIN (SELECT contact_id, COUNT(*) as cnt FROM interactions GROUP BY contact_id) i ON i.contact_id=c.id WHERE c.deleted_at IS NULL ORDER BY c.name`
      : await sql`SELECT c.*, COALESCE(i.cnt,0)::int as interaction_count FROM contacts c LEFT JOIN (SELECT contact_id, COUNT(*) as cnt FROM interactions GROUP BY contact_id) i ON i.contact_id=c.id ORDER BY c.name`;
  }
  return NextResponse.json({ contacts: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO contacts (coordinator_id,owner,name,org,role,phone,email,type,status,potential,last_contact,notes)
    VALUES (${d.coordinator_id||null},${d.owner||''},${d.name},${d.org||''},${d.role||''},${d.phone||''},${d.email||''},${d.type||'partner'},${d.status||'cold'},${d.potential||1},${d.last_contact||null},${d.notes||''})
    RETURNING *`;
  const me = await currentUser(req);
  logAudit({ entityType:"contact", entityId:rows[0].id, action:"create", actorName:me?.name, actorEmail:me?.email, summary:`נוצר: ${d.name}` });
  return NextResponse.json({ contact: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  const before = await sql`SELECT status, owner FROM contacts WHERE id=${d.id} LIMIT 1`;
  await sql`UPDATE contacts SET name=${d.name},org=${d.org||''},role=${d.role||''},phone=${d.phone||''},email=${d.email||''},type=${d.type},status=${d.status},potential=${d.potential||1},last_contact=${d.last_contact||null},notes=${d.notes||''},owner=${d.owner||''} WHERE id=${d.id}`;
  const me = await currentUser(req);
  const b: any = before[0] || {};
  const parts = [];
  if (b.status !== d.status) parts.push(`סטטוס: ${b.status||"—"} → ${d.status||"—"}`);
  if (b.owner !== d.owner) parts.push(`רכז: ${b.owner||"—"} → ${d.owner||"—"}`);
  logAudit({ entityType:"contact", entityId:d.id, action:"update", actorName:me?.name, actorEmail:me?.email, summary: parts.join(" · ") || "עודכן" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const me = await currentUser(req);
  if (await hasColumn("contacts", "deleted_at")) {
    await sql`UPDATE contacts SET deleted_at=now() WHERE id=${id}`;
    logAudit({ entityType:"contact", entityId:id, action:"delete", actorName:me?.name, actorEmail:me?.email });
    return NextResponse.json({ ok: true, soft: true });
  }
  await sql`DELETE FROM contacts WHERE id=${id}`;
  logAudit({ entityType:"contact", entityId:id, action:"delete", actorName:me?.name, actorEmail:me?.email });
  return NextResponse.json({ ok: true, soft: false });
}

/** Undo a soft delete. */
export async function PUT(req: NextRequest) {
  const { id, restore } = await req.json();
  if (!restore) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!(await hasColumn("contacts", "deleted_at"))) {
    return NextResponse.json({ error: "restore unavailable" }, { status: 409 });
  }
  await sql`UPDATE contacts SET deleted_at=NULL WHERE id=${id}`;
  const me = await currentUser(req);
  logAudit({ entityType:"contact", entityId:id, action:"restore", actorName:me?.name, actorEmail:me?.email });
  return NextResponse.json({ ok: true });
}
