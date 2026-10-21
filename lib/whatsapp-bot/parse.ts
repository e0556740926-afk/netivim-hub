/**
 * Rules-based parsing for the internal WhatsApp bot (phase 1).
 * Pure functions, no I/O — so the conversation logic can be tested and,
 * later, a language model can be slotted in behind the same Intent shape.
 */

export type Intent =
  | { kind: "help" }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "my_tasks" }
  | { kind: "done"; index: number }
  | { kind: "postpone"; index: number; due: string }
  | { kind: "new_task"; title: string; due: string | null; urgent: boolean; missingTitle: boolean }
  | { kind: "unknown" }

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
const DAY_LETTERS: Record<string, number> = { "א": 0, "ב": 1, "ג": 2, "ד": 3, "ה": 4, "ו": 5, "ש": 6 }

/** Today's date in Israel as YYYY-MM-DD (server clocks run in UTC). */
export function todayIL(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function weekday(iso: string): number {
  return new Date(iso + "T12:00:00Z").getUTCDay()
}

const clean = (s: string) => s.replace(/[‎‏‪-‮]/g, "").replace(/\s+/g, " ").trim()

/**
 * Finds a date expression in free text. Returns the ISO date and the text
 * with the expression removed. Supported: היום, מחר, מחרתיים, יום א'/ראשון…,
 * בעוד N ימים, dd.mm / dd/mm (next occurrence; this year or next).
 */
export function extractDate(text: string, today = todayIL()): { due: string | null; rest: string } {
  let t = " " + text + " "
  const take = (re: RegExp, due: string) => { t = t.replace(re, " "); return { due, rest: clean(t) } }

  let m: RegExpMatchArray | null
  if ((m = t.match(/\sבעוד\s+(\d{1,2})\s+ימים?\s/))) return take(/\sבעוד\s+\d{1,2}\s+ימים?\s/, addDays(today, Number(m[1])))
  if (/\s(ל)?מחרתיים\s/.test(t)) return take(/\s(ל)?מחרתיים\s/, addDays(today, 2))
  if (/\s(ל)?מחר\s/.test(t)) return take(/\s(ל)?מחר\s/, addDays(today, 1))
  if (/\s(ל)?היום\s/.test(t)) return take(/\s(ל)?היום\s/, today)

  const dayRe = new RegExp(`\\s(?:ב|ל)?יום\\s+(${DAYS.join("|")}|[אבגדהוש]['׳]?)\\s`)
  if ((m = t.match(dayRe))) {
    const key = m[1].replace(/['׳]/g, "")
    const target = DAYS.includes(key) ? DAYS.indexOf(key) : DAY_LETTERS[key]
    let diff = (target - weekday(today) + 7) % 7
    if (diff === 0) diff = 7 // "יום שלישי" on a Tuesday means next week
    return take(dayRe, addDays(today, diff))
  }

  if ((m = t.match(/\s(?:ב-?|ל-?|עד\s)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s/))) {
    const day = Number(m[1]), month = Number(m[2])
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : Number(today.slice(0, 4))
      let iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      if (!m[3] && iso < today) { year += 1; iso = `${year}-${iso.slice(5)}` }
      const valid = new Date(iso + "T12:00:00Z").toISOString().slice(0, 10) === iso
      if (valid) return take(/\s(?:ב-?|ל-?|עד\s)?\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s/, iso)
    }
  }
  return { due: null, rest: clean(text) }
}

export function parse(raw: string, today = todayIL()): Intent {
  const text = clean(raw || "")
  if (!text) return { kind: "unknown" }
  const lower = text.toLowerCase()

  if (/^(עזרה|תפריט|help|\?|היי|שלום|הי)$/.test(lower)) return { kind: "help" }
  if (/^(כן|אישור|שמור|מאשר|מאשרת|ok|אוקיי|👍)[.!]?$/.test(lower)) return { kind: "yes" }
  if (/^(לא|ביטול|בטל|עזוב)[.!]?$/.test(lower)) return { kind: "no" }
  if (/^(המשימות שלי|משימות|מה המשימות שלי|רשימה)[?.!]?$/.test(text)) return { kind: "my_tasks" }

  let m: RegExpMatchArray | null
  if ((m = text.match(/^(?:בוצע|סיימתי|בוצעה)\s*(\d{1,2})$/))) return { kind: "done", index: Number(m[1]) }
  if ((m = text.match(/^(?:דחה|דחי|לדחות)\s*(\d{1,2})\s*(.*)$/))) {
    const { due } = extractDate(m[2] || "מחר", today)
    return { kind: "postpone", index: Number(m[1]), due: due || addDays(today, 1) }
  }

  if ((m = text.match(/^משימה(?:\s+חדשה)?\s*[:\-–]?\s*(.*)$/))) {
    let body = m[1] || ""
    const urgent = /(^|\s)דחוף(\s|$|!)/.test(body)
    body = clean(body.replace(/(^|\s)דחוף!?(?=\s|$)/g, " "))
    const { due, rest } = extractDate(body, today)
    return { kind: "new_task", title: rest.slice(0, 200), due, urgent, missingTitle: !rest }
  }
  return { kind: "unknown" }
}

const HEB_DAY = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
export function fmtDue(iso: string | null, today = todayIL()): string {
  if (!iso) return "ללא תאריך"
  if (iso === today) return "היום"
  if (iso === addDays(today, 1)) return "מחר"
  const [, mm, dd] = iso.split("-")
  return `יום ${HEB_DAY[weekday(iso)]} ${Number(dd)}.${Number(mm)}`
}

export const HELP_TEXT = [
  "*בוט נתיבים* 🤖",
  "",
  "אפשר לכתוב לי:",
  "• *משימה: להתקשר לאבי מחר* — משימה חדשה (אפשר להוסיף *דחוף*)",
  "• *המשימות שלי* — המשימות הפתוחות",
  "• *בוצע 2* — סימון משימה מהרשימה כבוצעה",
  "• *דחה 2 ליום ראשון* — דחיית משימה",
  "",
  "תאריכים: היום, מחר, מחרתיים, יום ראשון, 25.11, בעוד 3 ימים",
].join("\n")
