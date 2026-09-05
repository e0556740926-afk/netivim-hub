import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const rows = await sql`
    SELECT o.*,
      (SELECT count(*)::int FROM contacts c WHERE c.organization_id = o.id AND c.deleted_at IS NULL) AS contact_count,
      (SELECT count(*)::int FROM org_programs p WHERE p.organization_id = o.id) AS program_count,
      (SELECT count(*)::int FROM referrals r WHERE r.organization_id = o.id) AS referral_count,
      (SELECT COALESCE(sum(p.capacity - p.current_count), 0)::int FROM org_programs p WHERE p.organization_id = o.id) AS capacity_left,
      (SELECT count(*)::int FROM referrals r JOIN leads l ON l.id = r.case_id
        WHERE r.organization_id = o.id AND l.advisor_status IN ('התקבל למסגרת','שובץ במסגרת')) AS our_guys_count
    FROM organizations o
    ORDER BY o.name`;
  return NextResponse.json({ organizations: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const rows = await sql`
    INSERT INTO organizations (name, category, region, owner_type, owner_id, notes, description, total_students)
    VALUES (${d.name}, ${d.category || null}, ${d.region || null}, ${d.owner_type || null}, ${d.owner_id || null}, ${d.notes || ''}, ${d.description || ''}, ${d.total_students || null})
    RETURNING *`;
  const me = await currentUser(req);
  logAudit({ entityType: "organization", entityId: rows[0].id, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `נוצר מוסד: ${d.name}` });
  return NextResponse.json({ organization: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await sql`
    UPDATE organizations SET
      name=${d.name}, category=${d.category || null}, region=${d.region || null},
      owner_type=${d.owner_type || null}, owner_id=${d.owner_id || null}, notes=${d.notes || ''},
      description=${d.description ?? ''}, total_students=${d.total_students ?? null},
      rating=${d.rating ?? null}, relationship_status=${d.relationship_status || 'חדש'}
    WHERE id=${d.id}`;
  const me = await currentUser(req);
  logAudit({ entityType: "organization", entityId: d.id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `מוסד עודכן: ${d.name}` });
  return NextResponse.json({ ok: true });
}
