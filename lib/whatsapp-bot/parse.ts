/**
 * Rules-based parsing for the internal WhatsApp bot (phase 1).
 * Pure functions, no I/O — so the conversation logic can be tested and,
 * later, a language model can be slotted in behind the same Intent shape.
 */

export type Intent =
  | { kind: "menu" }
  | { kind: "help" }
  | { kind: "digit"; n: number }
  | { kind: "events" }
  | { kind: "lead_status"; query: string }
  | { kind: "task_status"; index: number; status: "inprogress" | "waiting" | "todo" }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "my_tasks" }
  | { kind: "done"; index: number }
  | { kind: "postpone"; index: number; due: string }
  | { kind: "new_task"; title: string; due: string | null; urgent: boolean; missingTitle: boolean }
  | { kind: "new_lead"; lead: LeadDraft }
  | { kind: "fix"; field: keyof LeadDraft; value: string }
  | { kind: "unknown" }

export type LeadDraft = { name: string; phone: string; age: number | null; city: string; notes: string }

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

  if (/^(תפריט|היי|שלום|הי|שלום לך|בוקר טוב|ערב טוב|start|התחל)[!.]?$/.test(lower)) return { kind: "menu" }
  if (/^(עזרה|help|\?|הסבר|איך|איך עושים)[?!.]?$/.test(lower)) return { kind: "help" }
  if (/^[1-9]$/.test(text)) return { kind: "digit", n: Number(text) }
  if (/^(אירועים|האירועים שלי|אירועים קרובים|יומן|ביומן|לו"ז|לוז|השבוע|השבוע שלי|מה יש לי|מה יש לי השבוע|מה יש לי ביומן|מה יש ביומן|יומן לשבוע|מה מתוכנן)[?!.]?$/.test(text)) return { kind: "events" }
  if (/^(כן|אישור|שמור|מאשר|מאשרת|ok|אוקיי|👍)[.!]?$/.test(lower)) return { kind: "yes" }
  if (/^(לא|ביטול|בטל|עזוב)[.!]?$/.test(lower)) return { kind: "no" }
  if (/^(המשימות שלי|משימות|מה המשימות שלי|רשימה)[?.!]?$/.test(text)) return { kind: "my_tasks" }

  let m: RegExpMatchArray | null
  if ((m = text.match(/^(?:סטטוס|מצב|בדיקה|בדוק|מה הסטטוס של|מה המצב של|מה קורה עם)\s*(?:של\s+)?(?:ליד|הליד)?\s*[:\-–]?\s*(.+)$/))) return { kind: "lead_status", query: m[1].trim() }
  if ((m = text.match(/^(?:בטיפול|בתהליך|התחלתי)\s*(\d{1,2})$/))) return { kind: "task_status", index: Number(m[1]), status: "inprogress" }
  if ((m = text.match(/^(?:ממתין|מחכה|ממתינה)\s*(\d{1,2})$/))) return { kind: "task_status", index: Number(m[1]), status: "waiting" }
  if ((m = text.match(/^(?:בוצע|סיימתי|בוצעה)\s*(\d{1,2})$/))) return { kind: "done", index: Number(m[1]) }
  if ((m = text.match(/^(?:דחה|דחי|לדחות)\s*(\d{1,2})\s*(.*)$/))) {
    const { due } = extractDate(m[2] || "מחר", today)
    return { kind: "postpone", index: Number(m[1]), due: due || addDays(today, 1) }
  }

  if ((m = text.match(/^ליד(?:\s+חדש)?\s*[:\-–]?\s*([\s\S]*)$/))) return { kind: "new_lead", lead: parseLead(m[1] || "") }

  if ((m = text.match(/^(שם|טלפון|נייד|גיל|עיר|הערה|הערות)\s*[:\-–]\s*(.+)$/))) {
    const map: Record<string, keyof LeadDraft> = { "שם": "name", "טלפון": "phone", "נייד": "phone", "גיל": "age", "עיר": "city", "הערה": "notes", "הערות": "notes" }
    return { kind: "fix", field: map[m[1]], value: m[2].trim() }
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

export const CAPABILITIES = [
  "📥 להכניס ליד חדש",
  "🔎 לבדוק סטטוס של ליד",
  "📝 להוסיף משימה",
  "✅ לעדכן או לדחות משימות",
  "📅 לראות מה יש לך בשבוע הקרוב",
]

export function welcomeText(firstName: string) {
  return [
    `שלום ${firstName} 👋`,
    "אני הבוט של *נתיבים*. אפשר לכתוב לי ישירות, ואני יודע:",
    "",
    ...CAPABILITIES.map(c => "• " + c),
    "",
    "רוצה שאסביר איך עושים כל אחד?",
    "*1* — כן, תסביר  ·  *2* — לא, אני מסתדר",
  ].join("\n")
}

export const HELP_TEXT = [
  "*איך עושים* 👇",
  "",
  "*📥 ליד חדש*",
  "ליד: משה כהן 0521234567 בן 19 מבני ברק",
  "_אפשר להוסיף \"הערה: ...\". לפני השמירה אשאל לאישור._",
  "",
  "*🔎 סטטוס ליד*",
  "סטטוס 0521234567  ·  או  ·  סטטוס משה כהן",
  "",
  "*📝 משימה חדשה*",
  "משימה: להתקשר לישיבת מאור מחר דחוף",
  "_תאריכים: היום, מחר, יום ראשון, 25.11, בעוד 3 ימים_",
  "",
  "*✅ עדכון משימות*",
  "המשימות שלי — רשימה ממוספרת, ואז:",
  "בוצע 2  ·  בטיפול 2  ·  ממתין 2  ·  דחה 2 ליום ראשון",
  "",
  "*📅 השבוע הקרוב*",
  "יומן  ·  או  ·  מה יש לי השבוע",
  "",
  "בכל רגע: *תפריט* — חזרה לכאן",
].join("\n")

export const SHORT_HINT = "כתבו *תפריט* לרשימת האפשרויות, או *עזרה* לדוגמאות."

// ── leads ───────────────────────────────────────────────────────
export const CITIES = ["ירושלים","בני ברק","בית שמש","אלעד","מודיעין עילית","ביתר עילית","אשדוד","צפת","טבריה","חיפה","נתניה","פתח תקווה","פתח תקוה","רכסים","קרית גת","ערד","אופקים","נתיבות","באר שבע","תל אביב","רמת גן","חולון","בת ים","ראשון לציון","רחובות","לוד","רמלה","טלזסטון","קרית ספר","עמנואל","חריש","קרית יערים","אור יהודה","קרית אתא","עפולה","דימונה","אשקלון","הרצליה","כפר סבא","רעננה","חדרה","כרמיאל","מגדל העמק","קרית שמונה","נהריה","עכו","גבעת שמואל","יבנה","גדרה","מעלה אדומים","אריאל","קדומים","בית אל","כוכב יעקב","גבעת זאב","קצרין","מודיעין","קרית מלאכי","שדרות","קרית ביאליק","קרית מוצקין","נוף הגליל","בית שאן","יקנעם","זכרון יעקב","אור עקיבא","קרית אונו","גבעתיים","הוד השרון","רמת השרון","נס ציונה","באר יעקב","קרית עקרון","מזכרת בתיה","כפר חב\"ד","כפר חבד","ביתר","קרית יערים"]

/** Israeli mobile → 05XXXXXXXX, or "" if none found. */
export function findPhone(text: string): { phone: string; rest: string } {
  const m = text.match(/(?:\+?972[-\s]?|0)5\d(?:[-\s]?\d){7}/)
  if (!m) return { phone: "", rest: text }
  const digits = m[0].replace(/\D/g, "")
  const phone = digits.startsWith("972") ? "0" + digits.slice(3) : digits
  return { phone: /^05\d{8}$/.test(phone) ? phone : "", rest: text.replace(m[0], " ") }
}

export function parseLead(raw: string): LeadDraft {
  let t = " " + clean(raw) + " "
  let notes = ""
  const nm = t.match(/\s(?:הערה|הערות)\s*[:\-–]?\s*(.+)$/)
  if (nm) { notes = nm[1].trim(); t = t.slice(0, nm.index) + " " }

  const ph = findPhone(t); t = ph.rest

  let age: number | null = null
  const am = t.match(/\s(?:בן|בגיל|גיל)\s*[:\-]?\s*(\d{1,2})(?=\s)/)
  if (am) { age = Number(am[1]); t = t.replace(am[0], " ") }
  else {
    const bare = t.match(/\s(1[2-9]|[23]\d)(?=\s)/) // a lone number in a lead line is almost always the age
    if (bare) { age = Number(bare[1]); t = t.replace(bare[0], " ") }
  }

  let city = ""
  const cm = t.match(/\s(?:עיר|גר ב|גרה ב|מתגורר ב)\s*[:\-]?\s*([^,]+?)(?=\s*(?:,|$))/)
  if (cm) { city = cm[1].trim(); t = t.replace(cm[0], " ") }
  else {
    const sorted = [...CITIES].sort((a, b) => b.length - a.length)
    for (const c of sorted) {
      const re = new RegExp(`\\s(?:מ|ב|מה|מ-|ב-)?${c.replace(/"/g, '\\"')}(?=[\\s,.]|$)`)
      const mm = t.match(re)
      if (mm) { city = c.replace("פתח תקוה", "פתח תקווה").replace("כפר חבד", "כפר חב\"ד"); t = t.replace(mm[0], " "); break }
    }
  }

  const name = clean(t.replace(/[,.;:]+/g, " ")).split(" ").slice(0, 4).join(" ")
  return { name, phone: ph.phone, age: age && age >= 10 && age <= 99 ? age : null, city, notes: notes.slice(0, 500) }
}

export function leadSummary(l: LeadDraft): string {
  return [
    `👤 ${l.name || "— חסר שם —"}`,
    `📞 ${l.phone || "— חסר טלפון —"}`,
    `🎂 ${l.age ? "גיל " + l.age : "גיל לא צוין"}`,
    `📍 ${l.city || "עיר לא צוינה"}`,
    l.notes ? `📝 ${l.notes}` : "",
  ].filter(Boolean).join("\n")
}
