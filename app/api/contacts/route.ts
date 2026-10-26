import { NextRequest, NextResponse } from "next/server";
import { contactRequiredError } from "@/lib/contact-validation";
import {resolveContactOrganization,OrganizationError,organizationRegistryReady} from "@/lib/partner-organizations";
import { DISTRICTS, isDistrict } from "@/lib/districts";
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

  if(await organizationRegistryReady()){
    const values:any[]=[];const filters:string[]=[];if(cid){values.push(Number(cid));filters.push('c.coordinator_id=$1')}if(soft)filters.push('c.deleted_at IS NULL');
    const rows=await sql.query(`SELECT c.*,COALESCE(o.name,c.org) AS org,COALESCE(i.cnt,0)::int AS interaction_count FROM contacts c LEFT JOIN partner_organizations o ON o.id=c.partner_organization_id LEFT JOIN (SELECT contact_id,COUNT(*) AS cnt FROM interactions GROUP BY contact_id) i ON i.contact_id=c.id ${filters.length?'WHERE '+filters.join(' AND '):''} ORDER BY c.name`,values);
    return NextResponse.json({contacts:rows});
  }
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
  { const err = contactRequiredError(d); if (err) return NextResponse.json({ error: err }, { status: 400 }); }
  const creator=await currentUser(req);
  if(creator?.role==='coordinator'){
    const [own]=await sql`SELECT id,name FROM coordinators WHERE user_id=${creator.id} LIMIT 1`;
    if(!own)return NextResponse.json({error:'לא נמצאה רשומת רכז לחשבון זה'},{status:409});
    d.coordinator_id=Number(own.id);d.owner=own.name;
  }
  let organization:any;
  try{organization=await resolveContactOrganization(d,req.method==='POST')}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'שיוך ארגון נכשל'},{status:e instanceof OrganizationError?e.status:500})}
  if('coordinator_id' in d){
    if(d.coordinator_id){const [coord]=await sql`SELECT id,name FROM coordinators WHERE id=${Number(d.coordinator_id)} LIMIT 1`;if(!coord)return NextResponse.json({error:'הרכז לא נמצא'},{status:400});d.coordinator_id=Number(coord.id);d.owner=coord.name}else{d.coordinator_id=null;d.owner=''}
  }
  const soft = await hasColumn("contacts", "deleted_at");

  if (d.phone && !d.force) {
    const dup = soft
      ? await sql`SELECT id, name, org FROM contacts WHERE phone=${d.phone} AND deleted_at IS NULL LIMIT 1`
      : await sql`SELECT id, name, org FROM contacts WHERE phone=${d.phone} LIMIT 1`;
    if (dup.length) return NextResponse.json({ error: "כפילות", duplicate: dup[0] }, { status: 409 });
  }

  const columns=['coordinator_id','owner','name','org','role','phone','email','type','status','potential','last_contact','notes'];
  const values:any[]=[d.coordinator_id||null,d.owner||'',d.name,d.org||'',d.role||'',d.phone||'',d.email||'',d.type||'partner',d.status||'cold',d.potential||1,d.last_contact||null,d.notes||''];
  if(organization){columns.push('partner_organization_id');values.push(organization.id)}
  if(await hasColumn('contacts','district')){columns.push('city','district');values.push(String(d.city||'').trim().slice(0,80),isDistrict(d.district)?d.district:'')}
  const rows=await sql.query(`INSERT INTO contacts (${columns.join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values);
  const me = await currentUser(req);
  logAudit({ entityType:"contact", entityId:rows[0].id, action:"create", actorId: me?.id, actorName:me?.name, actorEmail:me?.email, summary:`נוצר: ${d.name}` });
  return NextResponse.json({ contact: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  // Full edits from the forms carry all three; partial updates (e.g. a status change) are left alone.
  if ('name' in d && 'phone' in d && 'role' in d) { const err = contactRequiredError(d); if (err) return NextResponse.json({ error: err }, { status: 400 }); }
  let organization:any;
  try{organization=await resolveContactOrganization(d,req.method==='POST')}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'שיוך ארגון נכשל'},{status:e instanceof OrganizationError?e.status:500})}
  if('coordinator_id' in d){
    if(d.coordinator_id){const [coord]=await sql`SELECT id,name FROM coordinators WHERE id=${Number(d.coordinator_id)} LIMIT 1`;if(!coord)return NextResponse.json({error:'הרכז לא נמצא'},{status:400});d.coordinator_id=Number(coord.id);d.owner=coord.name}else{d.coordinator_id=null;d.owner=''}
  }
  const hasPlace = await hasColumn('contacts','district');
  const before = hasPlace ? await sql`SELECT status, owner, city, district FROM contacts WHERE id=${d.id} LIMIT 1` : await sql`SELECT status, owner FROM contacts WHERE id=${d.id} LIMIT 1`;
  const updates:Record<string,any>={name:d.name,org:d.org||'',role:d.role||'',phone:d.phone||'',email:d.email||'',type:d.type,status:d.status,potential:d.potential||1,last_contact:d.last_contact||null,notes:d.notes||'',owner:d.owner||''};
  if('coordinator_id' in d)updates.coordinator_id=d.coordinator_id;
  if(organization)updates.partner_organization_id=organization.id;
  else if(organization===null)updates.partner_organization_id=null;
  if(hasPlace&&'city' in d)updates.city=String(d.city||'').trim().slice(0,80);
  if(hasPlace&&'district' in d)updates.district=isDistrict(d.district)?d.district:'';
  const values=Object.values(updates);values.push(d.id);
  await sql.query(`UPDATE contacts SET ${Object.keys(updates).map((key,i)=>key+'=$'+(i+1)).join(',')} WHERE id=$${values.length}`,values);

  const me = await currentUser(req);
  const b: any = before[0] || {};
  const parts = [];
  if (b.status !== d.status) parts.push(`סטטוס: ${b.status||"—"} → ${d.status||"—"}`);
  if (b.owner !== d.owner) parts.push(`רכז: ${b.owner||"—"} → ${d.owner||"—"}`);
  if (hasPlace && 'district' in updates && (b.district||'') !== updates.district) parts.push(`מחוז: ${DISTRICTS[b.district]||"—"} → ${DISTRICTS[updates.district]||"—"}`);
  if (hasPlace && 'city' in updates && (b.city||'') !== updates.city) parts.push(`עיר: ${b.city||"—"} → ${updates.city||"—"}`);
  logAudit({ entityType:"contact", entityId:d.id, action:"update", actorId: me?.id, actorName:me?.name, actorEmail:me?.email, summary: parts.join(" · ") || "עודכן" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const me = await currentUser(req);
  if (await hasColumn("contacts", "deleted_at")) {
    await sql`UPDATE contacts SET deleted_at=now() WHERE id=${id}`;
    logAudit({ entityType:"contact", entityId:id, action:"delete", actorId: me?.id, actorName:me?.name, actorEmail:me?.email });
    return NextResponse.json({ ok: true, soft: true });
  }
  await sql`DELETE FROM contacts WHERE id=${id}`;
  logAudit({ entityType:"contact", entityId:id, action:"delete", actorId: me?.id, actorName:me?.name, actorEmail:me?.email });
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
  logAudit({ entityType:"contact", entityId:id, action:"restore", actorId: me?.id, actorName:me?.name, actorEmail:me?.email });
  return NextResponse.json({ ok: true });
}

