import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import sql from "@/lib/db";
import { normalizePhoneKey, sendWhatsApp } from "@/lib/whatsapp";
import { handleMessage } from "@/lib/whatsapp-bot/bot";
import { findUserByPhone, makeBotDeps } from "@/lib/whatsapp-bot/bot-db";
import { maskIdsInText } from "@/lib/whatsapp-bot/parse";
import { sendBotReply } from "@/lib/whatsapp-bot/send";
import { getBotSettings } from "@/lib/whatsapp-bot/settings";
import { renderAsText } from "@/lib/whatsapp-bot/render";
import { extractInput } from "@/lib/whatsapp-bot/extract";

/**
 * Green API calls this URL (set in the instance settings, outside this
 * codebase) for every WhatsApp event on the connected number.
 *
 * - Authenticated by WHATSAPP_WEBHOOK_TOKEN: Green API's "webhookUrlToken"
 *   arrives as `Authorization: Bearer <token>`; `?token=` also works.
 * - Private chats only (groups are ignored).
 * - Registered staff (phone in users / coordinators) talk to the bot when
 *   WHATSAPP_BOT_ENABLED=true and the bot is enabled in its settings screen.
 * - A message from a lead is logged against the lead, as before.
 * - Anything else is ignored and NOT stored — the connected number may be
 *   someone's personal phone.
 * Always answers 200 so Green API doesn't retry; duplicates are dropped
 * by idMessage.
 */
const ok = () => NextResponse.json({ ok: true });
const RATE_LIMIT_PER_MIN = 30;

function authorized(req: NextRequest): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const given = header.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token") || "";
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function logMessage(phone: string, dir: "in" | "out", body: string, waId: string | null, sender: string, status: string, kind = "text", meta: any = null) {
  try {
    await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status, kind, meta)
      VALUES (${phone}, ${null}, ${dir}, ${maskIdsInText(body).slice(0, 2000)}, ${waId}, ${sender}, ${status}, ${kind}, ${meta ? JSON.stringify(meta) : null}::jsonb)`;
  } catch {
    // kind/meta columns not there yet — log without them
    await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status)
      VALUES (${phone}, ${null}, ${dir}, ${maskIdsInText(body).slice(0, 2000)}, ${waId}, ${sender}, ${status})`.catch(() => {});
  }
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
  const input = extractInput(body?.messageData);
  const waMessageId: string | undefined = body?.idMessage;
  const phoneKey = normalizePhoneKey(chatId.replace("@c.us", ""));
  if (!phoneKey) return ok();

  try {
    if (waMessageId) {
      const seen = await sql`SELECT 1 FROM whatsapp_messages WHERE wa_message_id = ${waMessageId} LIMIT 1`;
      if (seen.length) return ok();
    }

    const user = await findUserByPhone(phoneKey);
    if (user) {
      if (!input || (!input.text && !input.buttonId)) {
        // An unknown message type from staff (sticker, voice, a new button shape) —
        // keep the raw shape for debugging, then point them at text.
        await logMessage(phoneKey, "in", `[${body?.messageData?.typeMessage || "unknown"}]`, waMessageId || null, user.name, "bot", "other", { messageData: body?.messageData });
        const settings0 = await getBotSettings();
        if (process.env.WHATSAPP_BOT_ENABLED === "true" && settings0.enabled && body?.messageData?.typeMessage !== "reactionMessage") {
          await sendWhatsApp(phoneKey, "אני מבין רק טקסט וכפתורים 🙂 כתבו *תפריט* כדי להתחיל.");
        }
        return ok();
      }

      await logMessage(phoneKey, "in", input.text || `[${input.buttonId}]`, waMessageId || null, user.name, "bot", input.kind,
        input.kind === "button" ? { buttonId: input.buttonId, stanzaId: input.stanzaId } : null);

      const settings = await getBotSettings();
      if (process.env.WHATSAPP_BOT_ENABLED !== "true" || !settings.enabled) return ok();
      const [hasSessions] = await sql`SELECT to_regclass('whatsapp_sessions') IS NOT NULL AS ok`;
      if (!hasSessions?.ok) return ok();

      const [rate] = await sql`SELECT count(*)::int AS n FROM whatsapp_messages WHERE phone = ${phoneKey} AND direction = 'in' AND created_at > now() - interval '1 minute'`;
      if (Number(rate?.n) > RATE_LIMIT_PER_MIN) { console.warn("[wa-bot] rate limited", phoneKey); return ok(); }

      const deps = makeBotDeps({ userPhone: phoneKey, instancePhone: ownWid ? ownWid.replace("@c.us", "") : null });
      let replies;
      try {
        replies = await handleMessage(deps, user, phoneKey, input);
      } catch (e) {
        const ref = Math.random().toString(36).slice(2, 8);
        console.error(`[wa-bot] handler failed ref=${ref}`, e);
        replies = [{ text: `משהו השתבש אצלי 😕 הטיוטה שמורה — נסו שוב בעוד רגע.\n_קוד תקלה: ${ref}_` }];
      }
      for (const r of replies) {
        const sent = await sendBotReply(phoneKey, r, settings);
        await logMessage(phoneKey, "out", sent.mode === "buttons" ? r.text + (r.buttons?.length ? `\n[${r.buttons.map(b => b.label).join(" | ")}]` : "") : renderAsText(r),
          sent.id || null, "בוט", sent.ok ? "sent" : "failed", sent.mode === "buttons" ? "button" : "text", sent.error ? { error: String(sent.error).slice(0, 300) } : null);
        if (sent.disabledButtons) {
          const to = settings.support_phone || process.env.BOT_SUPPORT_PHONE || (ownWid ? ownWid.replace("@c.us", "") : "");
          if (to) await sendWhatsApp(to, "⚠️ *בוט נתיבים:* כפתורי הוואטסאפ נכשלו 3 פעמים ברצף וכובו אוטומטית. הבוט ממשיך לעבוד עם טקסט ממוספר. אפשר להדליק אותם שוב במסך ההגדרות.");
        }
      }
      return ok();
    }

    // Not staff: keep the existing behaviour for leads only.
    if (!input?.text) return ok();
    const leads = await sql`SELECT id, phone FROM leads WHERE deleted_at IS NULL AND COALESCE(phone,'') <> ''`;
    const match = (leads as any[]).find(l => normalizePhoneKey(l.phone) === phoneKey);
    if (match) {
      await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status)
        VALUES (${phoneKey}, ${match.id}, 'in', ${input.text.slice(0, 2000)}, ${waMessageId || null}, ${body?.senderData?.senderName || null}, 'received')`;
    }
  } catch (e) {
    console.error("[wa-webhook]", e);
  }
  return ok();
}
