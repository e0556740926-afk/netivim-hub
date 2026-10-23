import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { validateScheduled } from "@/lib/whatsapp-bot/group-utils";
import { ensureScheduledTable, sendScheduledNow } from "@/lib/whatsapp-bot/scheduled";

/**
 * Scheduled WhatsApp messages — admins only.
 * GET                       → upcoming + the last 30 sent/failed/cancelled
 * POST {chatId, targetType, targetName, body, sendAt, repeat}
 * PATCH {id, action: "cancel" | "send_now"}
 * Sending itself happens in netlify/functions/wa-scheduled.mts (every 5 minutes).
 */
async function guard(req: NextRequest) {
  const me = await currentUser(req);
  return me && isAdmin(me) ? me : null;
}

export async function GET(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  await ensureScheduledTable();
  const [upcoming, history] = await Promise.all([
    sql`SELECT * FROM whatsapp_scheduled WHERE status IN ('scheduled','sending') ORDER BY send_at LIMIT 100`,
    sql`SELECT * FROM whatsapp_scheduled WHERE status IN ('sent','failed','cancelled') ORDER BY updated_at DESC LIMIT 30`,
  ]);
  return NextResponse.json({ upcoming, history });
}

export async function POST(req: NextRequest) {
  const me = await guard(req);
  if (!me) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  await ensureScheduledTable();
  const d = await req.json().catch(() => ({}));
  const err = validateScheduled(d);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const targetType = String(d.chatId).endsWith("@g.us") ? "group" : "person";
  const [row] = await sql`INSERT INTO whatsapp_scheduled (chat_id, target_type, target_name, body, send_at, repeat, created_by, created_by_name)
    VALUES (${d.chatId}, ${targetType}, ${String(d.targetName || "").slice(0, 120)}, ${String(d.body).trim()}, ${new Date(d.sendAt).toISOString()},
            ${d.repeat || "none"}, ${me.id}, ${me.name}) RETURNING *`;
  logAudit({ entityType: "setting", entityId: Number(row.id), action: "create", actorId: me.id, actorName: me.name, actorEmail: me.email,
    summary: `הודעת וואטסאפ מתוזמנת ל${row.target_name || row.chat_id}` });
  return NextResponse.json({ item: row });
}

export async function PATCH(req: NextRequest) {
  const me = await guard(req);
  if (!me) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  await ensureScheduledTable();
  const d = await req.json().catch(() => ({}));
  const id = Number(d.id);
  if (d.action === "cancel") {
    const rows = await sql`UPDATE whatsapp_scheduled SET status = 'cancelled', updated_at = now() WHERE id = ${id} AND status IN ('scheduled','failed') RETURNING id`;
    if (!rows.length) return NextResponse.json({ error: "ההודעה כבר נשלחה או בתהליך שליחה" }, { status: 409 });
    logAudit({ entityType: "setting", entityId: id, action: "update", actorId: me.id, actorName: me.name, actorEmail: me.email, summary: "הודעת וואטסאפ מתוזמנת בוטלה" });
    return NextResponse.json({ ok: true });
  }
  if (d.action === "send_now") {
    // claim it so the 5-minute job can't send the same row in parallel
    const [row] = await sql`UPDATE whatsapp_scheduled SET status = 'sending', updated_at = now() WHERE id = ${id} AND status IN ('scheduled','failed') RETURNING *`;
    if (!row) return NextResponse.json({ error: "ההודעה כבר נשלחה או בתהליך שליחה" }, { status: 409 });
    const r = await sendScheduledNow(row, { manual: true });
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
