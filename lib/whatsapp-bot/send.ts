import { greenApi, sendWhatsApp, toChatId } from "@/lib/whatsapp";
import { buttonsPayload, buttonsValid, renderAsText } from "./render";
import { recordButtonResult, type BotSettings } from "./settings";
import type { BotReply } from "./types";

export type SendResult = { ok: boolean; id?: string; mode: "buttons" | "text"; error?: string; disabledButtons?: boolean };

/**
 * Sends one bot reply. Buttons go through sendInteractiveButtonsReply (beta
 * on Green API); any failure — HTTP error, timeout, invalid buttons, buttons
 * switched off — falls back to the same content as numbered text, so the
 * person always gets an answer. Three button failures in ten minutes switch
 * buttons off automatically (see settings.recordButtonResult).
 */
export async function sendBotReply(phone: string, reply: BotReply, settings: BotSettings): Promise<SendResult> {
  const chatId = toChatId(phone);
  if (!chatId) return { ok: false, mode: "text", error: "bad_phone" };

  if (settings.buttons_enabled && buttonsValid(reply)) {
    const res = await greenApi("sendInteractiveButtonsReply", buttonsPayload(chatId, reply));
    const id = res.data?.idMessage as string | undefined;
    if (res.ok && id) {
      await recordButtonResult(true, settings);
      return { ok: true, id, mode: "buttons" };
    }
    console.error("[wa-bot] buttons failed, falling back to text:", res.status, res.error);
    const disabledButtons = await recordButtonResult(false, settings);
    const fb = await sendWhatsApp(phone, renderAsText(reply));
    return { ok: !!fb.ok, id: (fb as any).id, mode: "text", error: res.error, disabledButtons };
  }

  const r = await sendWhatsApp(phone, renderAsText(reply));
  return { ok: !!r.ok, id: (r as any).id, mode: "text", error: r.ok ? undefined : String((r as any).reason || "") };
}
