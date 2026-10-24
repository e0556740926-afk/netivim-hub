import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { forgetBlockedCache } from "@/lib/user-status";

/**
 * Deleting a user is a soft delete: status = 'deleted' + deleted_at. A hard
 * DELETE would either fail (tasks, knowledge items and reports_to point at
 * users) or, through coordinators ON DELETE CASCADE, silently wipe the
 * person's weekly reports, meetings and monthly targets. A deleted user can't
 * sign in, drops out of every list and every notification (all of them filter
 * status = 'active'), and can be restored with everything intact.
 */
let ensured = false;
async function ensureDeletedAt() {
  if (ensured) return;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz`;
  ensured = true;
}

export async function GET() {
  await ensureDeletedAt();
  const rows = await sql`SELECT id,name,email,role,status,phone,area,team,reports_to,created_at,deleted_at FROM users ORDER BY id`;
  return NextResponse.json({
    users: rows.filter((u: any) => u.status !== "deleted"),
    deleted: rows.filter((u: any) => u.status === "deleted"),
  });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const existing = await sql`SELECT id, status FROM users WHERE lower(email)=lower(${d.email}) LIMIT 1`;
  if (existing.length) {
    const msg = existing[0].status === "deleted"
      ? "משתמש עם הדואל הזה נמחק בעבר — אפשר לשחזר אותו מ'משתמשים שנמחקו' בתחתית העמוד"
      : "דואל כבר קיים במערכת";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const pw = d.password ? await hashPassword(d.password) : '';
  const rows = await sql`
    INSERT INTO users (name,email,password,role,status,phone,area,team,reports_to)
    VALUES (${d.name},${d.email},${pw},${d.role||'coordinator'},${d.status||'active'},${d.phone||''},${d.area||''},${d.team||null},${d.reports_to?Number(d.reports_to):null})
    RETURNING id,name,email,role,status,phone,area,team,reports_to`;
  const u = rows[0];
  let coordinatorSlug: string | null = null;
  let coordinatorId: number | null = null;
  if (d.role === 'coordinator') {
    // ASCII-only slug derived from the email's local part — same fix
    // already applied to the manager personal-slug generator. The
    // previous approach stripped every non-ASCII character, which for
    // an all-Hebrew-name organisation meant every newly created
    // coordinator (through this form, not the original seed data)
    // got a slug of just "-<id>": technically unique, but not a
    // usable public link.
    const local = d.email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
    coordinatorSlug = (local || 'coord') + '-' + u.id;
    const cRows = await sql`INSERT INTO coordinators (user_id,name,role,area,email,phone,slug) VALUES (${u.id},${d.name},'רכז שטח',${d.area||''},${d.email},${d.phone||''},${coordinatorSlug}) RETURNING id`;
    coordinatorId = cRows[0].id;
    // Every coordinator is automatically a selectable lead source too —
    // this is the list managed at /admin/leaderboard/sources.
    await sql`INSERT INTO lead_sources (label, coordinator_id, slug) VALUES (${d.name}, ${coordinatorId}, ${'src-coord-' + coordinatorId}) ON CONFLICT (label) DO NOTHING`;
  }
  return NextResponse.json({ user: u, coordinatorSlug, coordinatorId });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (d.action === "restore") {
    await ensureDeletedAt();
    const me = await currentUser(req);
    const [u] = await sql`UPDATE users SET status='active', deleted_at=NULL WHERE id=${Number(d.id)} AND status='deleted' RETURNING id, name`;
    if (!u) return NextResponse.json({ error: "המשתמש לא נמצא ברשימת הנמחקים" }, { status: 404 });
    forgetBlockedCache();
    logAudit({ entityType: "user", entityId: u.id, action: "restore", actorId: me?.id, actorName: me?.name, actorEmail: me?.email, summary: `שוחזר המשתמש ${u.name}` });
    return NextResponse.json({ ok: true });
  }
  const newPw = d.password ? await hashPassword(d.password) : null;
  const reportsTo = d.reports_to ? Number(d.reports_to) : null;
  if (newPw) {
    await sql`UPDATE users SET name=${d.name},email=${d.email},role=${d.role},status=${d.status},phone=${d.phone||''},area=${d.area||''},team=${d.team||null},reports_to=${reportsTo},password=${newPw} WHERE id=${d.id}`;
  } else {
    await sql`UPDATE users SET name=${d.name},email=${d.email},role=${d.role},status=${d.status},phone=${d.phone||''},area=${d.area||''},team=${d.team||null},reports_to=${reportsTo} WHERE id=${d.id}`;
  }
  await sql`UPDATE coordinators SET name=${d.name},area=${d.area||''},email=${d.email},phone=${d.phone||''} WHERE user_id=${d.id}`;
  forgetBlockedCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await ensureDeletedAt();
  const me = await currentUser(req);
  const { id: rawId } = await req.json().catch(() => ({}));
  const id = Number(rawId);
  if (!id) return NextResponse.json({ error: "חסר מזהה משתמש" }, { status: 400 });
  if (me && me.id === id) return NextResponse.json({ error: "לא ניתן למחוק את עצמך" }, { status: 400 });
  const [u] = await sql`SELECT id, name, role, status FROM users WHERE id=${id}`;
  if (!u || u.status === "deleted") return NextResponse.json({ error: "המשתמש לא נמצא" }, { status: 404 });
  if (u.role === "admin") {
    const [{ c }] = await sql`SELECT count(*)::int AS c FROM users WHERE role='admin' AND status='active' AND id <> ${id}`;
    if (!c) return NextResponse.json({ error: "זה מנהל המערכת הפעיל האחרון — אי אפשר למחוק אותו" }, { status: 400 });
  }
  // calendar_token cleared so the personal calendar feed stops working too.
  await sql`UPDATE users SET status='deleted', deleted_at=now(), calendar_token=NULL WHERE id=${id}`;
  await sql`UPDATE users SET reports_to=NULL WHERE reports_to=${id}`;
  forgetBlockedCache();
  logAudit({ entityType: "user", entityId: id, action: "delete", actorId: me?.id, actorName: me?.name, actorEmail: me?.email, summary: `נמחק המשתמש ${u.name}` });
  return NextResponse.json({ ok: true });
}
