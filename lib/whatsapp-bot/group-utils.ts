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

/** Effectively no limit — WhatsApp's own ceiling for one message is ~65k characters. */
export const MAX_SCHEDULED_LENGTH = 60000;
/**
 * WhatsApp cuts captions under a photo/video at about 1,024 characters. Longer
 * text is not refused: the file goes out without a caption and the text follows
 * right after it as its own message (see splitCaption).
 */
export const MAX_CAPTION_LENGTH = 1024;

/** With an attachment: does the text fit as the caption, or go as a separate message after the file? */
export function splitCaption(body: string | null | undefined): { caption: string; followUp: string } {
  const text = String(body || "");
  return text.length > MAX_CAPTION_LENGTH ? { caption: "", followUp: text } : { caption: text, followUp: "" };
}

export function validateScheduled(d: { chatId?: string; body?: string; sendAt?: string; repeat?: string; mediaId?: string | null }, now = new Date()): string | null {
  if (!d.chatId || !/^\d{9,15}@(c|g)\.us$|^[\d-]+@g\.us$/.test(d.chatId)) return "בחרו קבוצה או מספר טלפון תקין";
  const body = String(d.body || "").trim();
  if (!body && !d.mediaId) return "ההודעה ריקה — כתבו טקסט או צרפו תמונה/סרטון";
  if (body.length > MAX_SCHEDULED_LENGTH) return `ההודעה ארוכה מדי (עד ${MAX_SCHEDULED_LENGTH.toLocaleString("he-IL")} תווים)`;
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

/**
 * "2026-10-25" + "09:30" in Israel time → UTC ISO string, DST-correct whatever
 * the server's or browser's time zone. null if the date/time is malformed.
 */
export function israelLocalToUtc(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "")), tm = /^(\d{1,2}):(\d{2})$/.exec(String(time || ""));
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])], [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Israel's offset at that moment: format the instant in Asia/Jerusalem and compare.
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - t;
  };
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t); // second pass settles the DST edge
  const check = new Date(t + offsetAt(t));
  if (check.getUTCDate() !== d || check.getUTCMonth() !== mo - 1) return null; // e.g. 31.2
  return new Date(t).toISOString();
}

// ── media for scheduled messages ──────────────────────────────────

export const MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime", pdf: "application/pdf",
};
/** WhatsApp delivers photos and videos up to ~16MB as media. */
export const MAX_MEDIA_SIZE = 16 * 1024 * 1024;
export const MEDIA_CHUNK = 2 * 1024 * 1024;

export function mediaSpec(name: string, size: number): { name: string; mime: string; size: number; parts: number } | string {
  const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
  const mime = MEDIA_TYPES[ext];
  if (!mime) return "אפשר לצרף תמונה (JPG, PNG, WEBP), סרטון (MP4, MOV) או PDF";
  if (!Number.isSafeInteger(size) || size <= 0) return "קובץ ריק";
  if (size > MAX_MEDIA_SIZE) return "הקובץ גדול מ-16MB — וואטסאפ לא ישלח אותו כמדיה";
  return { name: String(name).replace(/[\r\n/\\]/g, "_").slice(0, 120), mime, size, parts: Math.ceil(size / MEDIA_CHUNK) };
}
