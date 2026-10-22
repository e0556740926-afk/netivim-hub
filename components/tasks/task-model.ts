// Shared vocabulary for the tasks workspace (admin + coordinator).
// Pure data + helpers, no React — so both pages and any future
// dashboard widget read the same labels and the same due buckets.

export const STATUS = [
  { key: "todo",       label: "לביצוע",       dot: "#94A3B8", bg: "#f7f9f5", fg: "#334155" },
  { key: "inprogress", label: "בתהליך",       dot: "#356990", bg: "#eaf0f4", fg: "#356990" },
  { key: "waiting",    label: "ממתין לתשובה", dot: "#946014", bg: "#FFF8E8", fg: "#946014" },
  { key: "done",       label: "בוצע",         dot: "#28634e", bg: "#EEF8F0", fg: "#28634e" },
] as const
export type StatusKey = typeof STATUS[number]["key"]
export const STATUS_BY_KEY = Object.fromEntries(STATUS.map(s => [s.key, s])) as Record<string, typeof STATUS[number]>

export const TYPE_LABEL: Record<string, string> = { call: "שיחה", meeting: "פגישה", materials: "חומרים", backoffice: "בק-אופיס" }
export const PRIORITY_LABEL: Record<string, string> = { urgent: "דחוף", normal: "רגיל", low: "נמוך" }
export const PRIORITY_STYLE: Record<string, { bg: string; fg: string }> = {
  urgent: { bg: "#FDECEC", fg: "#9F1239" },
  normal: { bg: "#F1F5F9", fg: "#475569" },
  low:    { bg: "#F1F5F9", fg: "#64748B" },
}
export const RECURRENCE_LABEL: Record<string, string> = { daily: "כל יום", weekly: "כל שבוע", monthly: "כל חודש" }

/** Days a task may sit in inprogress/waiting before it's flagged as stuck. */
export const STUCK_DAYS = 3

export type DueBucket = "overdue" | "today" | "week" | "later" | "none"
export const BUCKETS: { key: DueBucket; label: string; tone: string }[] = [
  { key: "overdue", label: "באיחור",     tone: "#a74450" },
  { key: "today",   label: "היום",       tone: "#28634e" },
  { key: "week",    label: "השבוע",      tone: "#193d33" },
  { key: "later",   label: "מאוחר יותר", tone: "#475569" },
  { key: "none",    label: "ללא תאריך",  tone: "#64748B" },
]

export function isoDay(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

export function bucketOf(t: any, today: string): DueBucket {
  const due = t.due_date ? String(t.due_date).slice(0, 10) : ""
  if (!due) return "none"
  if (due < today) return t.status === "done" ? "later" : "overdue"
  if (due === today) return "today"
  if (due <= addDays(today, 6)) return "week"
  return "later"
}

export function isLate(t: any, today: string): boolean {
  return !!t.due_date && String(t.due_date).slice(0, 10) < today && t.status !== "done"
}

export type DueFilter = "" | "open" | "overdue" | "today" | "week" | "none" | "done" | "future" | "doneweek"
export function matchesDue(t: any, filter: DueFilter, today: string, view = "list"): boolean {
  const due = t.due_date ? String(t.due_date).slice(0, 10) : ""
  const completed = t.status === "done"
  if (view === "board" && (filter === "open" || filter === "done")) return true
  switch (filter) {
    case "open": return !completed
    case "today": return !completed && due === today
    case "future": return !completed && !!due && due > today
    case "overdue": return !completed && !!due && due < today
    case "week": return !completed && !!due && due <= addDays(today, 6)
    case "none": return !completed && !due
    case "done": return completed
    case "doneweek": {
      const changed = String(t.status_changed_at || t.updated_at || t.created_at || "").slice(0, 10)
      return completed && !!changed && changed >= addDays(today, -6) && changed <= today
    }
    default: return true
  }
}

/** Short Hebrew relative date: היום / מחר / אתמול / dd.mm */
export function relDay(due: string | null | undefined, today: string): string {
  if (!due) return ""
  const d = String(due).slice(0, 10)
  if (d === today) return "היום"
  if (d === addDays(today, 1)) return "מחר"
  if (d === addDays(today, -1)) return "אתמול"
  const [y, m, day] = d.split("-")
  return `${day}.${m}${y !== today.slice(0, 4) ? "." + y.slice(2) : ""}`
}

export function initials(name: string): string {
  return name.replace(/\s*👑\s*/g, "").trim().split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("")
}

/** Stable pastel for a person's avatar, derived from their name. */
export function avatarColor(name: string): { bg: string; fg: string } {
  const palette = [
    { bg: "#DBEAFE", fg: "#1E3A8A" }, { bg: "#DCFCE7", fg: "#14532D" }, { bg: "#FEF3C7", fg: "#78350F" },
    { bg: "#EDE9FE", fg: "#4C1D95" }, { bg: "#FCE7F3", fg: "#831843" }, { bg: "#CFFAFE", fg: "#164E63" },
  ]
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}

