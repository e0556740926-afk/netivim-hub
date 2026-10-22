import { MONTH_HE } from "@/lib/utils"

/* Client-side helpers for ניהול רכזים. Calculation rules stay on the server
   (lib/coordinator-metrics.ts); this file only labels and explains them. */

export const MONTH_FULL = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"]

export function ym(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` }
export function ymLabel(s: string) { const [y, m] = s.split("-"); return `${MONTH_FULL[Number(m) - 1]} ${y}` }
export function shiftYm(s: string, by: number) { const [y, m] = s.split("-").map(Number); return ym(new Date(y, m - 1 + by, 1)) }
/** The last 12 months, newest first — the selectable result periods. */
export function monthOptions(n = 12) { const out: string[] = []; let c = ym(); for (let i = 0; i < n; i++) { out.push(c); c = shiftYm(c, -1) } return out }

export function day(d?: string | Date | null) {
  if (!d) return ""
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d
  return `${x.getDate()}.${x.getMonth() + 1}`
}
export function dayFull(d?: string | Date | null) {
  if (!d) return ""
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d
  return `${x.getDate()}.${x.getMonth() + 1}.${x.getFullYear()}`
}
export function ymd(d?: string | Date | null) { if (!d) return ""; return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10) }

/** "12–18 באוקטובר" for a Monday-start report week. */
export function weekLabel(weekStart?: string | null) {
  if (!weekStart) return ""
  const s = new Date(weekStart.slice(0, 10) + "T00:00:00")
  const e = new Date(s); e.setDate(s.getDate() + 6)
  return s.getMonth() === e.getMonth()
    ? `\u2066${s.getDate()}–${e.getDate()}\u2069 ב${MONTH_FULL[e.getMonth()]}`
    : `${s.getDate()} ב${MONTH_FULL[s.getMonth()]} – ${e.getDate()} ב${MONTH_FULL[e.getMonth()]}`
}

export function ago(d?: string | null) {
  if (!d) return "אין רישום"
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  return days <= 0 ? "היום" : days === 1 ? "אתמול" : `לפני ${days} ימים`
}

export function initials(name = "") { return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("") }

export const LIGHT_UI: Record<string, { label: string; tone: "green" | "yellow" | "red" }> = {
  green: { label: "מעורבות פעילה", tone: "green" },
  yellow: { label: "מעורבות חלקית", tone: "yellow" },
  red: { label: "דורש תשומת לב", tone: "red" },
}

/** Plain-language reason behind the (unchanged) traffic-light rule. */
export function lightReason(c: { logins_7d: number; actions_7d: number; tasks_open: number; tasks_overdue: number; overdue_ratio: number }) {
  const parts: string[] = []
  parts.push(c.logins_7d === 0 ? "לא תועדה כניסה ב־7 ימים" : c.logins_7d === 1 ? "כניסה אחת ב־7 ימים" : `${c.logins_7d} כניסות`)
  if (c.logins_7d > 0) parts.push(`${c.actions_7d} פעולות`)
  if (c.tasks_open === 0) parts.push("ללא משימות פתוחות")
  else if (c.tasks_overdue === 0) parts.push("ללא משימות באיחור")
  else parts.push(c.overdue_ratio >= 0.5 ? `מחצית ומעלה מהמשימות באיחור (${c.tasks_overdue} מתוך ${c.tasks_open})` : `${c.tasks_overdue} מתוך ${c.tasks_open} משימות באיחור`)
  return parts.join(" · ")
}

/** Secondary columns kept available through the column picker. */
export const EXTRA_COLS: { key: string; label: string; period: string; fmt?: (r: any) => string }[] = [
  { key: "leads_via_link_month", label: "לידים דרך הקישור", period: "חודש נבחר" },
  { key: "tasks_done_month", label: "משימות שנסגרו", period: "חודש נבחר" },
  { key: "avg_close_days", label: "זמן סגירה ממוצע", period: "עד 90 יום", fmt: r => r.avg_close_days == null ? "אין נתון" : `${r.avg_close_days} ימים` },
  { key: "interactions_month", label: "תיעודי קשר", period: "חודש נבחר" },
  { key: "events_month", label: "אירועים", period: "חודש נבחר" },
  { key: "reports_month", label: "דיווחים שהוגשו", period: "חודש נבחר" },
  { key: "meetings_month", label: "פגישות ליווי", period: "חודש נבחר" },
  { key: "logins_7d", label: "כניסות", period: "7 ימים" },
  { key: "actions_7d", label: "פעולות מתועדות", period: "7 ימים" },
  { key: "last_active_at", label: "פעילות אחרונה", period: "מתועד", fmt: r => ago(r.last_active_at || r.last_login_at) },
]

export const TASK_STATUS: Record<string, string> = { todo: "לביצוע", inprogress: "בתהליך", waiting: "ממתין לתשובה", done: "בוצע" }
export const LEAD_STATUS: Record<string, string> = { new: "חדש", contacted: "יצרתי קשר", advanced: "עבר לשלב", irrelevant: "לא רלוונטי" }
export const EV_STATUS: Record<string, string> = { planning: "תכנון", pending_approval: "ממתין לאישור", approved: "מאושר", marketing: "בפרסום", done: "בוצע", cancelled: "בוטל" }
export const ENTITY: Record<string, string> = { lead: "ליד", task: "משימה", event: "אירוע", contact: "איש קשר", user: "חשבון", custom_field: "שדה", setting: "הגדרה", organization: "ארגון", report: "דיווח", meeting: "פגישה" }
export const ACTION: Record<string, string> = { create: "נוצר", update: "עודכן", delete: "נמחק", restore: "שוחזר", view: "נצפה", login: "כניסה למערכת" }

export { MONTH_HE }
