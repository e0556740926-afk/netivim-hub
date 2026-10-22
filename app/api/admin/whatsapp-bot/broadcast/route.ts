import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { normalizePhoneKey, sendWhatsApp } from "@/lib/whatsapp";
import { renderBroadcast, validateBroadcast } from "@/lib/whatsapp-bot/broadcast";

/**
 * POST { userId, message } — sends one personalised staff announcement.
 * The screen calls this once per recipient (with a pause between calls), so a
 * long list never hits the function timeout and the person sees live progress.
 * POST { done: true, message, sent, failed } — writes one audit entry at the end.
 * Admins only (also enforced by middleware for /api/admin).
 */
export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!me || !isAdmin(me)) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  const d = await req.json().catch(() => ({}));

  if (d.done) {
    logAudit({ entityType: "setting", entityId: 0, action: "update", actorId: me.id, actorName: me.name, actorEmail: me.email,
      summary: `הודעת וואטסאפ לצוות נשלחה ל-${Number(d.sent) || 0} (נכשלו ${Number(d.failed) || 0}): ${String(d.message || "").slice(0, 80)}` });
    return NextResponse.json({ ok: true });
  }

  const err = validateBroadcast(d.message);
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
  const [u] = await sql`SELECT u.id, u.name, COALESCE(NULLIF(c.phone,''), NULLIF(u.phone,'')) AS phone
    FROM users u LEFT JOIN coordinators c ON c.user_id = u.id
    WHERE u.id = ${Number(d.userId)} AND u.status = 'active'`;
  if (!u) return NextResponse.json({ ok: false, error: "המשתמש לא נמצא או לא פעיל" }, { status: 404 });
  const phoneKey = normalizePhoneKey(u.phone);
  if (!phoneKey) return NextResponse.json({ ok: false, error: "אין מספר טלפון תקין" }, { status: 400 });

  const text = renderBroadcast(d.message, { name: String(u.name || "") });
  const r = await sendWhatsApp(phoneKey, text);
  await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status, kind)
    VALUES (${phoneKey}, ${null}, 'out', ${text.slice(0, 2000)}, ${(r as any).id || null}, ${"הודעה לצוות · " + me.name}, ${r.ok ? "sent" : "failed"}, 'broadcast')`
    .catch(() => {});
  return NextResponse.json({ ok: !!r.ok, error: r.ok ? undefined : String((r as any).reason || "השליחה נכשלה").slice(0, 200) });
}
