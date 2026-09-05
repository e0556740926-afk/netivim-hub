import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { generatePortalToken } from "@/lib/portal-token";
import { hashPassword } from "@/lib/password";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const rows = await sql`SELECT id, name, email, phone, role, invited_at, last_login_at, access_token, migrated_at FROM institution_users WHERE organization_id=${Number(orgId)} ORDER BY id`;
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

/**
 * { action: "migrate_to_account", user_id, email, password } — upgrades a
 * token-only contact to a real login (spec §5). The old access_token
 * keeps working alongside it — this is additive, not a replacement — so
 * an institution that hasn't been individually notified yet isn't locked
 * out. Sending the generated password to the institution is a manual step
 * outside the system (per spec: "הודעה למוסדות" is a comms task, not code).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const d = await req.json();
  if (d.action !== "migrate_to_account") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (!d.user_id || !d.email || !d.password) return NextResponse.json({ error: "missing user_id/email/password" }, { status: 400 });

  const hash = await hashPassword(d.password);
  await sql`
    UPDATE institution_users SET email=${d.email}, password_hash=${hash}, migrated_at=now()
    WHERE id=${d.user_id} AND organization_id=${Number(orgId)}`;
  const me = await currentUser(req);
  logAudit({ entityType: "organization", entityId: Number(orgId), action: "update", actorName: me?.name, actorEmail: me?.email, summary: `שודרג לחשבון פורטל (מטוקן): user_id ${d.user_id}` });
  return NextResponse.json({ ok: true });
}
