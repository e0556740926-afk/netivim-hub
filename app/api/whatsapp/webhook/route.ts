import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizePhoneKey } from "@/lib/whatsapp";

/**
 * Green API calls this URL (configured on their side, in the instance
 * settings — that configuration step happens outside this codebase)
 * whenever a WhatsApp event happens on the connected number. We only
 * care about incoming text messages here; everything else is
 * acknowledged and ignored.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // Green API doesn't need a real error back
  }

  if (body?.typeWebhook !== "incomingMessageReceived") {
    return NextResponse.json({ ok: true });
  }

  const senderChatId: string | undefined = body?.senderData?.chatId || body?.senderData?.sender;
  const senderName: string | undefined = body?.senderData?.senderName;
  const text: string | undefined = body?.messageData?.textMessageData?.textMessage
    || body?.messageData?.extendedTextMessageData?.text;
  const waMessageId: string | undefined = body?.idMessage;

  if (!senderChatId || !text) return NextResponse.json({ ok: true });

  const phoneKey = normalizePhoneKey(senderChatId);
  if (!phoneKey) return NextResponse.json({ ok: true });

  // Resolve to a case by matching the normalized phone against leads —
  // best-effort; the message is still stored (by phone) even if no
  // matching case is found, so nothing is silently dropped.
  const leads = await sql`SELECT id, phone FROM leads WHERE deleted_at IS NULL`;
  const match = (leads as any[]).find(l => normalizePhoneKey(l.phone) === phoneKey);

  await sql`
    INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status)
    VALUES (${phoneKey}, ${match?.id || null}, 'in', ${text}, ${waMessageId || null}, ${senderName || null}, 'received')`;

  return NextResponse.json({ ok: true });
}
