/** A reply button. `id` is what the bot acts on; `label` is what the person sees (≤ 25 chars). */
export type Button = { id: string; label: string };

/**
 * One outgoing bot message. The conversation logic only builds these; the
 * send layer decides whether the buttons are rendered as WhatsApp buttons or
 * as a numbered text fallback.
 */
export type BotReply = {
  text: string;
  buttons?: Button[];
  /** Body already lists the choices with numbers (the actions menu) — the
   *  text fallback must not append its own numbered row. */
  numbered?: boolean;
  /** Optional footer line under the buttons. Defaults to "אפשר גם לכתוב: …". */
  footer?: string;
};

export const MAX_BUTTONS = 3;
export const MAX_LABEL = 25;
