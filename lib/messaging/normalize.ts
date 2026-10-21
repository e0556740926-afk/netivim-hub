// Pure helpers shared by the browser (import preview), API routes and the
// background worker. No "@/..." imports on purpose: the Netlify worker is
// bundled separately and must be able to import this file relatively.
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js"

export type Channel = "email" | "sms" | "whatsapp"
export const CHANNEL_LABEL: Record<Channel, string> = { email: "מייל", sms: "SMS", whatsapp: "WhatsApp" }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Email: trimmed and lower-cased (as the existing newsletter list already
 * does). Dots and +tags are kept — two different-looking addresses are
 * never merged on a guess.
 */
export function normalizeEmail(raw: unknown): { norm: string; valid: boolean } | null {
  const v = String(raw ?? "").trim().replace(/^mailto:/i, "").replace(/\s+/g, "")
  if (!v) return null
  const norm = v.toLowerCase()
  return { norm, valid: EMAIL_RE.test(norm) && norm.length <= 254 }
}

/**
 * Phone: E.164 for the given default country. Excel often stores
 * "0501234567" as the number 501234567 — the missing leading zero is
 * fine here because parsing is done against the country. Normalising
 * does not prove the number exists or uses WhatsApp.
 */
export function normalizePhone(raw: unknown, country = "IL"): { norm: string; valid: boolean } | null {
  let v = typeof raw === "number" ? String(Math.trunc(raw)) : String(raw ?? "").trim()
  if (!v) return null
  v = v.replace(/[\s\-().‎‏]/g, "")
  if (v.startsWith("00")) v = "+" + v.slice(2)
  const cc = (/^[A-Z]{2}$/.test(country.toUpperCase()) ? country.toUpperCase() : "IL") as CountryCode
  try {
    const p = parsePhoneNumberFromString(v, cc)
    if (p && p.isValid()) return { norm: p.number, valid: true }
  } catch {}
  const digits = v.replace(/[^\d+]/g, "")
  return { norm: digits || v, valid: false }
}

/** Countries named in Hebrew or English → ISO code (for a "מדינה" column). */
export function countryCode(raw: unknown, fallback = "IL"): string {
  const v = String(raw ?? "").trim()
  if (!v) return fallback
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase()
  const map: Record<string, string> = { "ישראל": "IL", "israel": "IL", "ארה\"ב": "US", "ארצות הברית": "US", "usa": "US", "united states": "US", "בריטניה": "GB", "אנגליה": "GB", "uk": "GB", "צרפת": "FR", "france": "FR", "קנדה": "CA", "canada": "CA", "בלגיה": "BE", "belgium": "BE" }
  return map[v.toLowerCase()] || fallback
}

export function splitTags(raw: unknown): string[] {
  return String(raw ?? "").split(/[,;|،]/).map(t => t.trim()).filter(Boolean).slice(0, 20)
}

/** Import target fields and the header names that usually mean them. */
export const IMPORT_FIELDS = [
  { key: "full_name", label: "שם מלא", hints: ["שם מלא", "שם", "name", "full name", "fullname"] },
  { key: "first_name", label: "שם פרטי", hints: ["שם פרטי", "first name", "firstname"] },
  { key: "last_name", label: "שם משפחה", hints: ["שם משפחה", "last name", "lastname", "surname"] },
  { key: "email", label: "מייל", hints: ["מייל", "דוא\"ל", "דוא״ל", "דואל", "אימייל", "email", "e-mail", "mail"] },
  { key: "phone", label: "טלפון", hints: ["טלפון", "נייד", "פלאפון", "סלולרי", "phone", "mobile", "tel", "cell"] },
  { key: "country", label: "מדינה", hints: ["מדינה", "country"] },
  { key: "city", label: "עיר", hints: ["עיר", "ישוב", "יישוב", "city", "town"] },
  { key: "org", label: "ארגון", hints: ["ארגון", "עמותה", "מוסד", "organization", "org", "company"] },
  { key: "tags", label: "תגיות", hints: ["תגיות", "תגית", "tags", "tag"] },
  { key: "list_source", label: "מקור רשימה", hints: ["מקור רשימה", "מקור", "source", "list source"] },
  { key: "consent_channel", label: "הרשאה — ערוץ", hints: ["ערוץ", "ערוץ הרשאה", "consent channel"] },
  { key: "consent_status", label: "הרשאה — מצב", hints: ["מצב", "מצב הרשאה", "הסכמה", "consent", "consent status"] },
  { key: "consent_source", label: "הרשאה — מקור האישור", hints: ["מקור האישור", "מקור הסכמה", "consent source"] },
  { key: "consent_date", label: "הרשאה — תאריך", hints: ["תאריך", "תאריך הסכמה", "תאריך אישור", "consent date"] },
] as const
export type ImportField = typeof IMPORT_FIELDS[number]["key"]

export function suggestMapping(headers: string[]): Record<string, ImportField | ""> {
  const used = new Set<string>()
  const out: Record<string, ImportField | ""> = {}
  const clean = (s: string) => s.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ")
  headers.forEach(h => {
    const ch = clean(h)
    const hit = IMPORT_FIELDS.find(f => !used.has(f.key) && f.hints.some(x => clean(x) === ch))
      || IMPORT_FIELDS.find(f => !used.has(f.key) && f.hints.some(x => ch.includes(clean(x)) && clean(x).length >= 3))
    out[h] = hit ? hit.key : ""
    if (hit) used.add(hit.key)
  })
  return out
}

export type NormalizedRow = {
  full_name: string
  email: string | null; email_raw: string; email_valid: boolean
  phone: string | null; phone_raw: string; phone_valid: boolean
  country: string; city: string; org: string; tags: string[]; list_source: string
  consent: { channel: Channel | "all"; status: "granted" | "revoked" | "unknown"; source: string; date: string } | null
}

/** Turns one mapped file row into the shape the server validates. */
export function normalizeRow(row: Record<string, unknown>, defaultCountry: string): NormalizedRow {
  const s = (k: string) => String(row[k] ?? "").trim()
  const country = countryCode(row.country, defaultCountry)
  const email = normalizeEmail(row.email)
  const phone = normalizePhone(row.phone, country)
  const full = s("full_name") || [s("first_name"), s("last_name")].filter(Boolean).join(" ")
  const cStatusRaw = s("consent_status").toLowerCase()
  const status = /^(granted|yes|true|1|כן|מאושר|אושר|הסכים|הסכמה)$/.test(cStatusRaw) ? "granted"
    : /^(revoked|no|false|0|לא|הוסר|סירב|הסרה)$/.test(cStatusRaw) ? "revoked" : "unknown"
  const chRaw = s("consent_channel").toLowerCase()
  const channel: Channel | "all" = /mail|מייל|דוא/.test(chRaw) ? "email" : /sms|מסרון/.test(chRaw) ? "sms" : /whats|וואטסאפ|ווטסאפ/.test(chRaw) ? "whatsapp" : "all"
  const consentDate = row.consent_date instanceof Date ? row.consent_date.toISOString().slice(0, 10) : s("consent_date")
  return {
    full_name: full.slice(0, 200),
    email: email?.norm ?? null, email_raw: s("email"), email_valid: !!email?.valid,
    phone: phone?.norm ?? null, phone_raw: typeof row.phone === "number" ? String(row.phone) : s("phone"), phone_valid: !!phone?.valid,
    country, city: s("city").slice(0, 120), org: s("org").slice(0, 200), tags: splitTags(row.tags), list_source: s("list_source").slice(0, 200),
    consent: cStatusRaw || s("consent_source") ? { channel, status, source: s("consent_source").slice(0, 300), date: consentDate.slice(0, 40) } : null,
  }
}

/** Text that a spreadsheet would execute as a formula is neutralised in CSV reports. */
export function csvSafe(v: unknown): string {
  let s = String(v ?? "")
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** SMS length estimate: GSM-7 vs UCS-2 (Hebrew forces UCS-2). Providers bill by their own rules. */
export function smsSegments(text: string): { chars: number; unicode: boolean; segments: number; perSegment: number } {
  const gsm = /^[\x0A\x0D\x20-\x5F\x61-\x7E£¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉÄÖÑÜ§¿äöñüà€]*$/
  const unicode = !gsm.test(text)
  const chars = Array.from(text).length
  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi)
  return { chars, unicode, segments, perSegment: segments > 1 ? multi : single }
}
