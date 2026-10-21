import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizePhoneKey, sendWhatsApp } from "@/lib/whatsapp";
import { findUserByPhone, handleMessage } from "@/lib/whatsapp-bot/bot";

/**
 * Green API calls this URL (set in the instance settings, outside this
 * codebase) for every WhatsApp event on the connected number.
 *
 * - Authenticated by WHATSAPP_WEBHOOK_TOKEN: Green API's "webhookUrlToken"
 *   arrives as `Authorization: Bearer <token>`; `?token=` also works.
 * - Private chats only (groups are ignored).
 * - Registered staff (phone in users / coordinators) talk to the bot when
 *   WHATSAPP_BOT_ENABLED=true.
 * - A message from a lead is logged against the lead, as before.
 * - Anything else is ignored and NOT stored — the connected number may be
 *   someone's personal phone.
 * Always answers 200 so Green API doesn't retry; duplicates are dropped
 * by idMessage.
 */
const ok = () => NextResponse.json({ ok: true });

function authorized(req: NextRequest): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const given = header.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token") || "";
  return given.length === expected.length && given === expected;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return ok(); }
  const chatId: string | undefined = body?.senderData?.chatId;
  if (!chatId || !chatId.endsWith("@c.us")) return ok(); // private chats only

  // Normal case: someone writes to the connected number. Special case: the
  // owner of the connected number writes in WhatsApp's "message yourself"
  // chat — Green API reports that as outgoingMessageReceived with the chat
  // being the instance's own number. Bot replies are sent through the API
  // (outgoingAPIMessageReceived), so they never loop back here.
  const ownWid: string | undefined = body?.instanceData?.wid;
  const selfChat = body?.typeWebhook === "outgoingMessageReceived" && !!ownWid && chatId === ownWid;
  if (body?.typeWebhook !== "incomingMessageReceived" && !selfChat) return ok();
  const text: string | undefined = body?.messageData?.textMessageData?.textMessage
    || body?.messageData?.extendedTextMessageData?.text;
  const waMessageId: string | undefined = body?.idMessage;
  const phoneKey = normalizePhoneKey(chatId.replace("@c.us", ""));
  if (!phoneKey || !text) return ok();

  try {
    if (waMessageId) {
      const seen = await sql`SELECT 1 FROM whatsapp_messages WHERE wa_message_id = ${waMessageId} LIMIT 1`;
      if (seen.length) return ok();
    }

    const user = await findUserByPhone(phoneKey);
    if (user) {
      await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status)
        VALUES (${phoneKey}, ${null}, 'in', ${text.slice(0, 2000)}, ${waMessageId || null}, ${user.name}, 'bot')`;
      if (process.env.WHATSAPP_BOT_ENABLED !== "true") return ok();
      const [hasSessions] = await sql`SELECT to_regclass('whatsapp_sessions') IS NOT NULL AS ok`;
      if (!hasSessions?.ok) return ok();
      let reply: string;
      try { reply = await handleMessage(user, phoneKey, text); }
      catch (e) { console.error("[wa-bot] handler failed", e); reply = "משהו השתבש אצלי 😕 נסו שוב בעוד רגע."; }
      const sent: any = await sendWhatsApp(phoneKey, reply).catch(() => null);
      await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status)
        VALUES (${phoneKey}, ${null}, 'out', ${reply.slice(0, 2000)}, ${sent?.id || null}, ${"בוט"}, ${sent?.ok ? "sent" : "failed"})`.catch(() => {});
      return ok();
    }

    // Not staff: keep the existing behaviour for leads only.
    const leads = await sql`SELECT id, phone FROM leads WHERE deleted_at IS NULL AND COALESCE(phone,'') <> ''`;
    const match = (leads as any[]).find(l => normalizePhoneKey(l.phone) === phoneKey);
    if (match) {
      await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status)
        VALUES (${phoneKey}, ${match.id}, 'in', ${text.slice(0, 2000)}, ${waMessageId || null}, ${body?.senderData?.senderName || null}, 'received')`;
    }
  } catch (e) {
    console.error("[wa-webhook]", e);
  }
  return ok();
}
