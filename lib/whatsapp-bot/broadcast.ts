/**
 * Staff announcements over WhatsApp ("שימו לב לפיצ'ר חדש…"), one personal
 * message per person. Pure helpers — no I/O — so the placeholder rules are tested.
 */

export const PLACEHOLDERS = [
  { key: "{שם}", label: "שם פרטי" },
  { key: "{שם_מלא}", label: "שם מלא" },
] as const;

export const MAX_BROADCAST_LENGTH = 3000;

/** Replaces {שם} with the first name and {שם_מלא} with the full name. */
export function renderBroadcast(template: string, person: { name: string }): string {
  const full = String(person.name || "").trim();
  const first = full.split(/\s+/)[0] || full;
  return String(template || "")
    .replace(/\{\s*שם[_ ]מלא\s*\}/g, full)
    .replace(/\{\s*שם\s*\}/g, first)
    .trim();
}

export function validateBroadcast(template: string): string | null {
  const t = String(template || "").trim();
  if (!t) return "ההודעה ריקה";
  if (t.length > MAX_BROADCAST_LENGTH) return `ההודעה ארוכה מדי (עד ${MAX_BROADCAST_LENGTH} תווים)`;
  return null;
}

export const DEFAULT_BROADCAST = "שלום {שם} 👋\n\n";
