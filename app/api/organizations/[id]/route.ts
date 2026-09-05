import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = Number(id);
  const [org] = await sql`SELECT * FROM organizations WHERE id=${orgId}`;
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [contacts, programs, referrals, retention] = await Promise.all([
    sql`SELECT * FROM contacts WHERE organization_id=${orgId} AND deleted_at IS NULL ORDER BY name`,
    sql`SELECT * FROM org_programs WHERE organization_id=${orgId} ORDER BY name`,
    sql`
      SELECT r.*, l.name AS case_name
      FROM referrals r LEFT JOIN leads l ON l.id = r.case_id
      WHERE r.organization_id=${orgId} ORDER BY r.created_at DESC`,
    sql`SELECT * FROM retention_confirmations WHERE organization_id=${orgId} ORDER BY quarter DESC`,
  ]);

  return NextResponse.json({ organization: org, contacts, programs, referrals, retention });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Add a program (track) to this organization.
  const { id } = await params;
  const d = await req.json();
  if (!d.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const rows = await sql`
    INSERT INTO org_programs (organization_id, name, category, intake_dates, admission_conditions, age_min, age_max, capacity, current_count)
    VALUES (${Number(id)}, ${d.name}, ${d.category || null}, ${d.intake_dates || null}, ${d.admission_conditions || null}, ${d.age_min || null}, ${d.age_max || null}, ${d.capacity || null}, ${d.current_count || 0})
    RETURNING *`;
  return NextResponse.json({ program: rows[0] });
}
