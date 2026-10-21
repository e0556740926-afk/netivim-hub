"use client"
import "@/components/leads/leads.css"
import "./messaging.css"

export async function api<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response
  try { res = await fetch(url, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined }) }
  catch { throw Object.assign(new Error("אין חיבור לשרת. אפשר לנסות שוב."), { network: true }) }
  let d: any = {}
  try { d = await res.json() } catch {}
  if (!res.ok) throw Object.assign(new Error(d.error || "הפעולה לא הושלמה. אפשר לנסות שוב."), { status: res.status, data: d })
  return d as T
}

export const CH_LABEL: Record<string, string> = { email: "מייל", sms: "SMS", whatsapp: "WhatsApp" }
export const STATUS_LABEL: Record<string, [string, string]> = {
  draft: ["טיוטה", ""], scheduled: ["מתוזמן", "blue"], queued: ["בתור", "navy"], sending: ["בשליחה", "navy"],
  sent: ["נשלח", "green"], partial: ["נשלח חלקית", "amber"], stopped: ["נעצר", "amber"], failed: ["נכשל", "red"],
}
export function StatusPill({ status }: { status: string }) {
  const [label, tone] = STATUS_LABEL[status] || [status, ""]
  return <span className={`mc-pill ${tone}`}>{label}</span>
}
export const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleString("he-IL", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }) : "—"
export const n = (v: unknown) => Number(v || 0).toLocaleString("he-IL")

export function SetupNotice({ error }: { error: any }) {
  if (error?.data?.setup) return <div className="mc-note"><b>מרכז הדיוורים עוד לא הופעל.</b> צריך להריץ את עדכון מסד הנתונים <span className="mc-ltr">supabase/migration-messaging.sql</span>. הניוזלטר הקיים ממשיך לעבוד כרגיל.</div>
  return <div className="mc-note red" role="alert">{error?.message || "הטעינה נכשלה"}</div>
}
