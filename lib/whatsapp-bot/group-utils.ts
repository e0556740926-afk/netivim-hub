/**
 * Pure helpers for WhatsApp groups and scheduled messages — no I/O, unit-tested.
 */

export type GroupMember = { phone: string | null; isAdmin: boolean; lid: string | null };

/** "972521234567@c.us" / "972521234567" → "972521234567"; anything else (an @lid id, empty) → null. */
export function phoneFromWid(v: unknown): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  if (s.endsWith("@lid") || s.endsWith("@g.us")) return null;
  const digits = s.replace(/@c\.us$/, "").replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

/** Green API getGroupData participants → one row per person, phone when WhatsApp shares it. */
export function normalizeParticipants(participants: any[]): GroupMember[] {
  const seen = new Set<string>();
  const out: GroupMember[] = [];
  for (const p of participants || []) {
    const phone = phoneFromWid(p?.phoneNumber) || phoneFromWid(p?.id);
    const lid = p?.lid ? String(p.lid) : (String(p?.id || "").endsWith("@lid") ? String(p.id) : null);
    const key = phone || lid || JSON.stringify(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ phone, isAdmin: !!(p?.isAdmin || p?.isSuperAdmin), lid });
  }
  // admins first, then people with a visible phone, then hidden numbers
  return out.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || Number(!a.phone) - Number(!b.phone) || String(a.phone || "").localeCompare(String(b.phone || "")));
}

/** 972521234567 → 052-1234567 (Israeli mobiles), otherwise +<digits>. */
export function displayPhone(p: string | null): string {
  if (!p) return "";
  if (/^9725\d{8}$/.test(p)) return `0${p.slice(3, 5)}-${p.slice(5)}`;
  if (/^972\d{8,9}$/.test(p)) return `0${p.slice(3)}`;
  return `+${p}`;
}

/** CSV with a BOM so Excel opens Hebrew correctly; values quoted, formula-injection safe. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: any) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s) && !/^\+?\d[\d\- ]*$/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n");
}

// ── scheduled messages ────────────────────────────────────────────

export type Repeat = "none" | "daily" | "weekly";
export const REPEAT_LABEL: Record<Repeat, string> = { none: "פעם אחת", daily: "כל יום", weekly: "כל שבוע" };

/** Next send time for a repeating message: the first slot strictly after `now`. null for one-off. */
export function nextRun(sendAt: Date, repeat: Repeat, now: Date): Date | null {
  if (repeat === "none") return null;
  const step = (repeat === "daily" ? 1 : 7) * 864e5;
  let t = sendAt.getTime() + step;
  if (t <= now.getTime()) t += Math.ceil((now.getTime() - t + 1) / step) * step;
  return new Date(t);
}

export const MAX_SCHEDULED_LENGTH = 3000;

export function validateScheduled(d: { chatId?: string; body?: string; sendAt?: string; repeat?: string }, now = new Date()): string | null {
  if (!d.chatId || !/^\d{9,15}@(c|g)\.us$|^[\d-]+@g\.us$/.test(d.chatId)) return "בחרו קבוצה או מספר טלפון תקין";
  const body = String(d.body || "").trim();
  if (!body) return "ההודעה ריקה";
  if (body.length > MAX_SCHEDULED_LENGTH) return `ההודעה ארוכה מדי (עד ${MAX_SCHEDULED_LENGTH} תווים)`;
  const t = Date.parse(String(d.sendAt || ""));
  if (!Number.isFinite(t)) return "בחרו תאריך ושעה";
  if (t < now.getTime() - 60_000) return "המועד שבחרתם כבר עבר";
  if (t > now.getTime() + 366 * 864e5) return "אפשר לתזמן עד שנה קדימה";
  if (d.repeat && !["none", "daily", "weekly"].includes(d.repeat)) return "סוג חזרה לא תקין";
  return null;
}

/** "0521234567" / "+972 52…" → "972521234567@c.us", else null. */
export function chatIdFromPhone(raw: string): string | null {
  let p = String(raw || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (p.startsWith("0")) p = "972" + p.slice(1);
  return /^\d{11,15}$/.test(p) ? `${p}@c.us` : null;
}
