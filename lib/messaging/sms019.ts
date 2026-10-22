// 019 SMS adapter (https://docs.019sms.co.il). Pure fetch + helpers, no
// "@/..." imports — the Netlify worker bundles this file on its own.
// Every call is no-throw: it returns { ok:false, … } instead.

type Env = Record<string, string | undefined>

export function sms019Config(env: Env) {
  return {
    token: env.SMS019_TOKEN || "",
    username: env.SMS019_USERNAME || "",
    source: (env.SMS019_SOURCE || "").replace(/\D/g, ""),
    // SMS019_TEST=true → 019's /api/test endpoint: validates, never sends.
    url: env.SMS019_TEST === "true" ? "https://019sms.co.il/api/test" : (env.SMS019_API_URL || "https://019sms.co.il/api"),
  }
}

export function sms019Missing(env: Env): string[] {
  const c = sms019Config(env)
  const out: string[] = []
  if (!c.token) out.push("טוקן API של 019 (SMS019_TOKEN)")
  if (!c.username) out.push("שם משתמש ב-019 (SMS019_USERNAME)")
  if (!c.source) out.push("מספר שולח / מספר וירטואלי להשבה (SMS019_SOURCE)")
  return out
}

/** "+972501234567" → "0501234567". Non-Israeli numbers → null (019 needs a flag + other pricing). */
export function toLocalIL(e164: string): string | null {
  const d = String(e164 || "").replace(/[^\d+]/g, "")
  if (d.startsWith("+972")) return "0" + d.slice(4)
  if (d.startsWith("972")) return "0" + d.slice(3)
  if (/^0\d{8,9}$/.test(d)) return d
  return null
}

/** Any Israeli form ("0501234567", "501234567", "972501234567") → "+972501234567". */
export function toE164IL(raw: string): string | null {
  let d = String(raw || "").replace(/\D/g, "")
  if (!d) return null
  if (d.startsWith("972")) d = d.slice(3)
  if (d.startsWith("0")) d = d.slice(1)
  return /^\d{8,9}$/.test(d) ? "+972" + d : null
}

export type SendResult = { ok: boolean; status: number | null; message: string; shipment_id: string | null; http: number | null; timeout: boolean }

async function post(env: Env, body: unknown, timeoutMs = 15000): Promise<SendResult> {
  const c = sms019Config(env)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(c.url, {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    })
    clearTimeout(timer)
    let j: any = null
    const text = await res.text()
    try { j = JSON.parse(text) } catch {}
    const status = j && j.status !== undefined ? Number(j.status) : null
    return { ok: res.ok && status === 0, status, message: String(j?.message ?? text ?? "").slice(0, 300), shipment_id: j?.shipment_id != null ? String(j.shipment_id) : null, http: res.status, timeout: false }
  } catch (e: any) {
    clearTimeout(timer)
    return { ok: false, status: null, message: String(e?.name || e).slice(0, 200), shipment_id: null, http: null, timeout: true }
  }
}

export type SmsItem = { id: string; phone: string; text: string }

/**
 * Sends a batch. Identical texts go as one "sms" request with many
 * destinations; personalised texts go as one "bulk" request (≤2500).
 * `id` is our external id — 019 echoes it back in delivery reports.
 */
export async function send019(env: Env, items: SmsItem[], campaignName = ""): Promise<SendResult> {
  const c = sms019Config(env)
  if (!items.length) return { ok: true, status: 0, message: "empty", shipment_id: null, http: null, timeout: false }
  const user = { username: c.username }
  const dest = (it: SmsItem) => ({ $: { id: it.id }, _: it.phone })
  const name = campaignName.slice(0, 50)
  const same = items.every(i => i.text === items[0].text)
  if (same) {
    return post(env, { sms: { user, source: c.source, destinations: { phone: items.map(dest) }, message: items[0].text, ...(name ? { campaign_name: name } : {}) } })
  }
  return post(env, { bulk: { user, messages: { sms: items.map(it => ({ source: c.source, destinations: { phone: [dest(it)] }, message: it.text })) }, ...(name ? { campaign_name: name } : {}) } })
}

/** 019 delivery-report status → our delivery state. */
export function dlrState(code: unknown): "delivered" | "failed" | "pending" {
  const n = Number(code)
  if (n === 0 || n === 102) return "delivered"
  if (n === -1 || n === 108 || n === 15) return "pending"
  return "failed"
}

const DLR_LABEL: Record<number, string> = {
  1: "נכשל", 2: "פג זמן", 3: "נכשל", 4: "נכשל ברשת הסלולרית", 5: "נכשל", 6: "נכשל", 7: "אין יתרה",
  14: "נכשל ברשת הסלולרית", 16: "אין הרשאה לשעת שליחה זו", 17: "חסום מהודעות פרסומיות", 18: "הודעה לא תקינה",
  101: "לא נמסר", 103: "פג תוקף", 104: "נמחק", 105: "לא נמסר", 106: "לא נמסר", 107: "לא נמסר",
  201: "חסום לבקשת המנוי", 747: "המנוי מחוץ לכיסוי", 998: "אין הרשאה", 999: "שגיאה לא ידועה",
}
export function dlrLabel(code: unknown): string {
  const n = Number(code)
  return DLR_LABEL[n] || (n >= 109 && n <= 132 ? "לא נמסר" : `סטטוס ${code}`)
}

const ERR_LABEL: Record<number, string> = {
  3: "טוקן או שם משתמש שגויים", 4: "אין יתרה מספיקה", 5: "שליחה אסורה בשעה זו", 8: "כל המספרים חסומים",
  9: "מספר יעד באורך שגוי", 10: "הטוקן פג תוקף — יש להפיק טוקן חדש ב-019", 11: "הטוקן לא תואם לשם המשתמש",
  12: "אין יתרה מספיקה", 515: "מספר/שם השולח אינו מאומת ב-019", 990: "הכמות חורגת מהיתרה",
}
export function errLabel(r: SendResult): string {
  if (r.timeout) return "אין תשובה מ-019"
  if (r.status != null && ERR_LABEL[r.status]) return `019: ${ERR_LABEL[r.status]}`
  return `019 (${r.status ?? r.http}): ${r.message}`.slice(0, 200)
}
