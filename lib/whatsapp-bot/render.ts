import { normalize } from "./parse";
import { MAX_BUTTONS, MAX_LABEL, type BotReply } from "./types";

/** Pure rendering helpers for the send layer — no I/O, unit-tested. */

export function buttonsValid(r: BotReply): boolean {
  const b = r.buttons || [];
  return b.length > 0 && b.length <= MAX_BUTTONS && b.every(x => x.id && x.label && [...x.label].length <= MAX_LABEL);
}

/** Text-only version: the body plus "*1* שמור · *2* תקן · *3* בטל" (digits map to the same choices). */
export function renderAsText(r: BotReply): string {
  const b = r.buttons || [];
  if (!b.length || r.numbered) return r.text;
  return `${r.text}\n\n${b.map((x, i) => `*${i + 1}* ${normalize(x.label)}`).join("  ·  ")}`;
}

export function defaultFooter(r: BotReply): string {
  if (r.footer !== undefined) return r.footer;
  const words = (r.buttons || []).map(x => normalize(x.label)).filter(Boolean);
  const f = `אפשר גם לכתוב: ${words.join(" / ")}`;
  return f.length <= 60 ? f : "";
}

/** Body for Green API sendInteractiveButtonsReply. */
export function buttonsPayload(chatId: string, r: BotReply) {
  const footer = defaultFooter(r);
  return {
    chatId,
    body: r.text,
    ...(footer ? { footer } : {}),
    buttons: (r.buttons || []).map(x => ({ buttonId: x.id, buttonText: x.label })),
  };
}
