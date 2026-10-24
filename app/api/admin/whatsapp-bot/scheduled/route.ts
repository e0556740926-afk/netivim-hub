import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "node:crypto";
import { israelLocalToUtc, validateScheduled } from "@/lib/whatsapp-bot/group-utils";
import { getMedia } from "@/lib/whatsapp-bot/media";
import { ensureScheduledTable, sendScheduledNow } from "@/lib/whatsapp-bot/scheduled";

/**
 * Scheduled WhatsApp messages — admins only.
 * GET                       → upcoming + the last 30 sent/failed/cancelled
 * POST batch (see below)
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

/**
 * POST — schedules one or more messages to one or more targets in one go:
 *   { targets: [{chatId, name}], messages: [{body, date: "YYYY-MM-DD", time: "HH:MM", repeat, mediaId?}] }
 * Dates and times are Israel time. Every target × message becomes its own row
 * (sharing a batch_id), so each can be cancelled or retried on its own.
 * The old single shape {chatId, targetName, body, sendAt, repeat} still works.
 */
export async function POST(req: NextRequest) {
  const me = await guard(req);
  if (!me) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  await ensureScheduledTable();
  const d = await req.json().catch(() => ({}));
  const targets: { chatId: string; name: string }[] = Array.isArray(d.targets) ? d.targets : d.chatId ? [{ chatId: d.chatId, name: d.targetName || "" }] : [];
  const messages: any[] = Array.isArray(d.messages) ? d.messages : d.chatId ? [{ body: d.body, sendAt: d.sendAt, repeat: d.repeat, mediaId: d.mediaId }] : [];
  if (!targets.length) return NextResponse.json({ error: "בחרו לפחות קבוצה או מספר אחד" }, { status: 400 });
  if (!messages.length) return NextResponse.json({ error: "אין הודעות לתזמון" }, { status: 400 });
  if (targets.length > 30 || messages.length > 30 || targets.length * messages.length > 200) return NextResponse.json({ error: "יותר מדי בבת אחת (עד 200 שליחות)" }, { status: 400 });

  // Resolve and check every message before writing anything.
  const prepared: { body: string; sendAt: string; repeat: string; media: any | null }[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const sendAt = m.sendAt || israelLocalToUtc(m.date, m.time);
    if (!sendAt) return NextResponse.json({ error: `הודעה ${i + 1}: תאריך או שעה לא תקינים` }, { status: 400 });
    let media = null;
    if (m.mediaId) {
      media = await getMedia(String(m.mediaId));
      if (!media || !media.ready) return NextResponse.json({ error: `הודעה ${i + 1}: הקובץ המצורף לא הועלה עד הסוף` }, { status: 400 });
    }
    for (const t of targets) {
      const err = validateScheduled({ chatId: t.chatId, body: m.body, sendAt, repeat: m.repeat, mediaId: m.mediaId || null });
      if (err) return NextResponse.json({ error: messages.length > 1 ? `הודעה ${i + 1}: ${err}` : err }, { status: 400 });
    }
    prepared.push({ body: String(m.body || "").trim(), sendAt: new Date(sendAt).toISOString(), repeat: m.repeat || "none", media });
  }

  const batchId = randomUUID();
  const items: any[] = [];
  for (const m of prepared) {
    for (const t of targets) {
      const targetType = String(t.chatId).endsWith("@g.us") ? "group" : "person";
      const [row] = await sql`INSERT INTO whatsapp_scheduled (chat_id, target_type, target_name, body, send_at, repeat, created_by, created_by_name, media_id, media_name, media_mime, batch_id)
        VALUES (${t.chatId}, ${targetType}, ${String(t.name || "").slice(0, 120)}, ${m.body}, ${m.sendAt}, ${m.repeat}, ${me.id}, ${me.name},
                ${m.media?.id || null}, ${m.media?.name || null}, ${m.media?.mime || null}, ${batchId}::uuid) RETURNING *`;
      items.push(row);
    }
  }
  logAudit({ entityType: "setting", entityId: Number(items[0].id), action: "create", actorId: me.id, actorName: me.name, actorEmail: me.email,
    summary: `תוזמנו ${items.length} הודעות וואטסאפ (${prepared.length} הודעות × ${targets.length} יעדים)` });
  return NextResponse.json({ items, count: items.length });
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
