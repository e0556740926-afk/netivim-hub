import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { generatePortalToken } from "@/lib/portal-token";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const rows = await sql`SELECT id, name, email, phone, role, invited_at, last_login_at, access_token FROM institution_users WHERE organization_id=${Number(orgId)} ORDER BY id`;
  return NextResponse.json({ portal_users: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const d = await req.json();
  if (!d.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const token = generatePortalToken();
  const rows = await sql`
    INSERT INTO institution_users (organization_id, name, email, phone, role, invited_at, access_token)
    VALUES (${Number(orgId)}, ${d.name}, ${d.email || null}, ${d.phone || null}, ${d.role || null}, now(), ${token})
    RETURNING *`;
  const me = await currentUser(req);
  logAudit({ entityType: "organization", entityId: Number(orgId), action: "create", actorName: me?.name, actorEmail: me?.email, summary: `נוצר חשבון פורטל למוסד: ${d.name}` });
  return NextResponse.json({ portal_user: rows[0] });
}
