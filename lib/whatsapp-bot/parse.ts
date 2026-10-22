/**
 * Rules-based parsing for the internal WhatsApp bot.
 * Pure functions, no I/O and no "@/" imports — unit-tested directly, and a
 * language model can later sit behind the same shapes without touching the
 * conversation logic in bot.ts.
 */

// ── text basics ───────────────────────────────────────────────────

/** Strips direction marks, emoji, variation selectors and extra spaces.
 *  "✅ שמור" and "שמור" normalize to the same thing — that is how a tapped
 *  button and a typed word end up on one code path. */
export function normalize(raw: string | null | undefined): string {
  return String(raw || "")
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[️‍⃣]/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** normalize() + strips leading/trailing punctuation, for exact word matches. */
export function keyOf(raw: string): string {
  return normalize(raw).replace(/^[\s.,!?:;\-–"'()\[\]]+|[\s.,!?:;\-–"'()\[\]]+$/g, "").toLowerCase()
}

const L = "\\p{L}" // a letter in any script (Hebrew included)
/** Word-boundary-safe regex for Hebrew (\b does not work with non-Latin letters). */
const word = (alts: string, flags = "u") => new RegExp(`(?<![${L}])(?:${alts})(?![${L}])`, flags)

// ── dates ─────────────────────────────────────────────────────────

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
const DAY_LETTERS: Record<string, number> = { "א": 0, "ב": 1, "ג": 2, "ד": 3, "ה": 4, "ו": 5, "ש": 6 }

/** Today's date in Israel as YYYY-MM-DD (server clocks run in UTC). */
export function todayIL(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekday(iso: string): number {
  return new Date(iso + "T12:00:00Z").getUTCDay()
}

/** Next occurrence of a weekday (0=Sunday). Today counts as "next week". */
export function nextWeekday(today: string, target: number): string {
  let diff = (target - weekday(today) + 7) % 7
  if (diff === 0) diff = 7
  return addDays(today, diff)
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim()

/**
 * Finds one date expression in free text. Returns the ISO date and the text
 * without it. Supported: היום, מחר, מחרתיים, יום א'/ראשון…, שבוע הבא,
 * סוף השבוע, בעוד N ימים / בעוד שבוע, dd.mm / dd/mm[/yy] — each optionally
 * after "עד" / "ל" / "ב".
 */
export function extractDate(text: string, today = todayIL()): { due: string | null; rest: string; found: boolean } {
  let t = " " + text + " "
  const pre = "(?:עד\\s+|עד\\s+ה|ל|ב|ב-|ל-)?"
  const tryRe = (re: RegExp, due: (m: RegExpMatchArray) => string | null) => {
    const m = t.match(re)
    if (!m) return null
    const d = due(m)
    if (!d) return null
    t = t.replace(m[0], " ")
    return { due: d, rest: squash(t), found: true }
  }
  return (
    tryRe(/\s(?:עד\s+|ב)?עוד\s+(\d{1,2})\s+ימים?(?=\s)/u, m => addDays(today, Number(m[1]))) ||
    tryRe(/\s(?:עד\s+|ב)?עוד\s+שבוע(?=\s)/u, () => addDays(today, 7)) ||
    tryRe(new RegExp(`\\s${pre}מחרתיים(?=\\s)`, "u"), () => addDays(today, 2)) ||
    tryRe(new RegExp(`\\s${pre}מחר(?=\\s)`, "u"), () => addDays(today, 1)) ||
    tryRe(new RegExp(`\\s${pre}היום(?=\\s)`, "u"), () => today) ||
    tryRe(new RegExp(`\\s${pre}(?:ב)?שבוע\\s+הבא(?=\\s)`, "u"), () => nextWeekday(today, 0)) ||
    tryRe(new RegExp(`\\s${pre}סוף\\s+(?:ה)?שבוע(?=\\s)`, "u"), () => {
      // Israeli work week ends Thursday; on Fri/Sat "end of week" is next Thursday.
      const wd = weekday(today)
      return wd <= 4 ? addDays(today, 4 - wd) : nextWeekday(today, 4)
    }) ||
    tryRe(new RegExp(`\\s${pre}יום\\s+(${DAYS.join("|")}|[אבגדהוש]['׳]?)(?=\\s)`, "u"), m => {
      const key = m[1].replace(/['׳]/g, "")
      const target = DAYS.includes(key) ? DAYS.indexOf(key) : DAY_LETTERS[key]
      return target === undefined ? null : nextWeekday(today, target)
    }) ||
    tryRe(/\s(?:עד\s+|ב-?|ל-?)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/u, m => {
      const day = Number(m[1]), month = Number(m[2])
      if (day < 1 || day > 31 || month < 1 || month > 12) return null
      let year = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : Number(today.slice(0, 4))
      let iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      if (!m[3] && iso < today) { year += 1; iso = `${year}-${iso.slice(5)}` }
      const valid = new Date(iso + "T12:00:00Z").toISOString().slice(0, 10) === iso
      return valid ? iso : null
    }) ||
    { due: null, rest: squash(text), found: false }
  )
}

const HEB_DAY = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
export function fmtDue(iso: string | null | undefined, today = todayIL()): string {
  if (!iso) return "ללא תאריך"
  const d = String(iso).slice(0, 10)
  if (d === today) return "היום"
  if (d === addDays(today, 1)) return "מחר"
  if (d === addDays(today, -1)) return "אתמול"
  const [, mm, dd] = d.split("-")
  return `יום ${HEB_DAY[weekday(d)]} ${Number(dd)}.${Number(mm)}`
}

// ── Israeli ID / phone ────────────────────────────────────────────

/** Israeli ID check digit (משרד הפנים). Accepts 5–9 digits, zero-padded to 9. */
export function isValidIsraeliId(raw: string): boolean {
  const id = String(raw || "").replace(/\D/g, "")
  if (id.length < 5 || id.length > 9) return false
  const p = id.padStart(9, "0")
  if (/^0+$/.test(p)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let n = Number(p[i]) * (i % 2 === 0 ? 1 : 2)
    if (n > 9) n -= 9
    sum += n
  }
  return sum % 10 === 0
}

export const padId = (raw: string) => String(raw || "").replace(/\D/g, "").padStart(9, "0")
export const maskId = (id: string) => (id ? "*****" + String(id).slice(-4) : "")

/** Masks 8–9 digit sequences that are valid Israeli IDs (for logs). Phones are untouched. */
export function maskIdsInText(text: string): string {
  return String(text || "").replace(/(?<!\d)\d{8,9}(?!\d)/g, m => (isValidIsraeliId(m) ? maskId(padId(m)) : m))
}

const MOBILE_RE = /(?:\+?972[-\s]?|0)5\d(?:[-\s]?\d){7}(?!\d)/
const LANDLINE_RE = /(?<!\d)0[2-9](?:[-\s]?\d){7}(?!\d)/

/** Israeli mobile → 05XXXXXXXX, or "" if none found. */
export function findPhone(text: string): { phone: string; rest: string; invalid: string } {
  const m = text.match(MOBILE_RE)
  if (m) {
    const digits = m[0].replace(/\D/g, "")
    const phone = digits.startsWith("972") ? "0" + digits.slice(3) : digits
    if (/^05\d{8}$/.test(phone)) return { phone, rest: text.replace(m[0], " "), invalid: "" }
  }
  const l = text.match(LANDLINE_RE)
  if (l) return { phone: "", rest: text.replace(l[0], " "), invalid: l[0] }
  return { phone: "", rest: text, invalid: "" }
}

// ── leads ─────────────────────────────────────────────────────────

export type LeadDraft = { name: string; idNumber: string; phone: string; age: number | null; city: string; notes: string }
export type LeadField = keyof LeadDraft
export const LEAD_LABELS: Record<LeadField, string> = { name: "שם", idNumber: "ת.ז", phone: "טלפון", age: "גיל", city: "עיר", notes: "הערות" }

export const emptyLead = (): LeadDraft => ({ name: "", idNumber: "", phone: "", age: null, city: "", notes: "" })

export const CITIES = ["ירושלים","בני ברק","בית שמש","אלעד","מודיעין עילית","ביתר עילית","אשדוד","צפת","טבריה","חיפה","נתניה","פתח תקווה","פתח תקוה","רכסים","קרית גת","ערד","אופקים","נתיבות","באר שבע","תל אביב","רמת גן","חולון","בת ים","ראשון לציון","רחובות","לוד","רמלה","טלזסטון","קרית ספר","עמנואל","חריש","קרית יערים","אור יהודה","קרית אתא","עפולה","דימונה","אשקלון","הרצליה","כפר סבא","רעננה","חדרה","כרמיאל","מגדל העמק","קרית שמונה","נהריה","עכו","גבעת שמואל","יבנה","גדרה","מעלה אדומים","אריאל","קדומים","בית אל","כוכב יעקב","גבעת זאב","קצרין","מודיעין","קרית מלאכי","שדרות","קרית ביאליק","קרית מוצקין","נוף הגליל","בית שאן","יקנעם","זכרון יעקב","אור עקיבא","קרית אונו","גבעתיים","הוד השרון","רמת השרון","נס ציונה","באר יעקב","קרית עקרון","מזכרת בתיה","כפר חב\"ד","כפר חבד","ביתר","קרית ארבע","חצור הגלילית","אלון שבות","נוף איילון","מבוא חורון","תפרח","יד בנימין","קוממיות","בני עי\"ש","זכרון מאיר"]

const LEAD_LABEL_RE: [LeadField, RegExp][] = [
  ["idNumber", /^(?:ת\.?\s?ז\.?|ת["״']ז|תז|תעודת זהות|מספר זהות)\s*[:\-–]?\s*(.*)$/u],
  ["phone", /^(?:טלפון|נייד|פלאפון|פלאפון נייד|טל)\s*[:\-–]\s*(.*)$/u],
  ["name", /^(?:שם(?: מלא)?)\s*[:\-–]\s*(.*)$/u],
  ["city", /^(?:עיר|יישוב|ישוב|מגורים)\s*[:\-–]\s*(.*)$/u],
  ["age", /^(?:גיל)\s*[:\-–]\s*(.*)$/u],
  ["notes", /^(?:הערה|הערות)\s*[:\-–]\s*([\s\S]*)$/u],
]

/** "שדה: ערך" on its own line/segment → the field it names, or null. */
export function matchLeadLabel(segment: string): { field: LeadField; value: string } | null {
  const s = normalize(segment)
  for (const [field, re] of LEAD_LABEL_RE) {
    const m = s.match(re)
    if (m) return { field, value: (m[1] || "").trim() }
  }
  return null
}

export type LeadParse = {
  lead: LeadDraft
  /** fields that came from an explicit "שדה: ערך" label (they override on merge) */
  labeled: LeadField[]
  /** raw values that were recognised as a field but failed validation */
  invalid: Partial<Record<"idNumber" | "phone" | "age", string>>
}

function cleanName(s: string): string {
  return squash(
    s.replace(/[,.;:|/\\()\[\]]+/g, " ")
      .split(" ")
      .filter(w => w && !/\d/.test(w) && new RegExp(`^[${L}'"״׳\\-]+$`, "u").test(w))
      .filter(w => !/^(ליד|חדש|חדשה|שם|הוא|בחור|נער)$/u.test(w))
      .join(" "),
  ).split(" ").slice(0, 4).join(" ")
}

function findCity(t: string, cities: string[]): { city: string; rest: string } {
  const sorted = [...new Set(cities)].filter(Boolean).sort((a, b) => b.length - a.length)
  for (const c of sorted) {
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`(?<![${L}])(?:מ|ב|מה|מ-|ב-|גר ב|גרה ב|מתגורר ב)?${esc}(?![${L}])`, "u")
    const m = t.match(re)
    if (m) return { city: c.replace("פתח תקוה", "פתח תקווה").replace("כפר חבד", "כפר חב\"ד"), rest: t.replace(m[0], " ") }
  }
  return { city: "", rest: t }
}

/**
 * Free text → lead fields. Order matters so numbers don't collide:
 * notes → labeled lines → phone (10 digits, 05) → ID (5–9 digits, checksum)
 * → age → city → whatever is left is the name.
 */
export function parseLead(raw: string, cities: string[] = CITIES): LeadParse {
  const lead = emptyLead()
  const labeled: LeadField[] = []
  const invalid: LeadParse["invalid"] = {}
  let text = String(raw || "").replace(/[‎‏‪-‮]/g, "")

  // leading "ליד:" / "ליד חדש -"
  text = text.replace(/^\s*ליד(?:\s+חדש)?\s*[:\-–]?\s*/u, "")

  // notes run to the end of the message
  const nm = text.match(/(?:^|\s)(?:הערה|הערות)\s*[:\-–]?\s*([\s\S]+)$/u)
  if (nm) { lead.notes = squash(nm[1]).slice(0, 500); labeled.push("notes"); text = text.slice(0, nm.index) }

  // labeled segments: one per line, or comma-separated "שם: ..., ת.ז: ..."
  const free: string[] = []
  for (const seg of text.split(/\n|,(?=\s*[\p{L}"״׳.]+\s*[:\-–])/u)) {
    const hit = matchLeadLabel(seg)
    if (hit && hit.field !== "notes") {
      if (hit.field === "idNumber") {
        const digits = hit.value.replace(/\D/g, "")
        if (digits && isValidIsraeliId(digits)) lead.idNumber = padId(digits)
        else if (digits) invalid.idNumber = digits
      } else if (hit.field === "phone") {
        const p = findPhone(hit.value)
        if (p.phone) lead.phone = p.phone
        else if (hit.value.replace(/\D/g, "")) invalid.phone = hit.value.trim()
      } else if (hit.field === "age") {
        const n = Number(hit.value.replace(/\D/g, ""))
        if (n >= 10 && n <= 99) lead.age = n
        else if (hit.value.trim()) invalid.age = hit.value.trim()
      } else if (hit.field === "city") lead.city = hit.value.slice(0, 60)
      else if (hit.field === "name") lead.name = cleanName(hit.value) || hit.value.slice(0, 60)
      labeled.push(hit.field)
    } else free.push(seg)
  }
  let t = " " + free.join(" ") + " "

  if (!lead.phone) {
    const p = findPhone(t)
    t = p.rest
    if (p.phone) lead.phone = p.phone
    else if (p.invalid && !invalid.phone) invalid.phone = p.invalid
  }

  if (!lead.idNumber && !invalid.idNumber) {
    const im = t.match(/(?<!\d)(\d{5,9})(?!\d)/)
    if (im) {
      if (isValidIsraeliId(im[1])) lead.idNumber = padId(im[1])
      else invalid.idNumber = im[1]
      t = t.replace(im[0], " ")
    }
  }

  if (lead.age === null && !invalid.age) {
    const am = t.match(/(?<![\p{L}])(?:בן|בת|בגיל|גיל)\s*[:\-]?\s*(\d{1,2})(?!\d)/u)
    if (am) {
      const n = Number(am[1])
      if (n >= 10 && n <= 99) lead.age = n
      t = t.replace(am[0], " ")
    } else {
      const bare = t.match(/(?<!\d)(1[4-9]|[23]\d|40)(?!\d)/) // a lone 2-digit number in a lead line is the age
      if (bare) { lead.age = Number(bare[1]); t = t.replace(bare[0], " ") }
    }
  }

  if (!lead.city) {
    const cm = t.match(/(?<![\p{L}])(?:גר ב|גרה ב|מתגורר ב|עיר)\s*[:\-]?\s*([\p{L}"'״ ]+?)(?=\s*(?:,|$|\d))/u)
    const c = findCity(t, cities)
    if (c.city) { lead.city = c.city; t = c.rest }
    else if (cm && cm[1].trim()) { lead.city = cm[1].trim().slice(0, 60); t = t.replace(cm[0], " ") }
  }

  if (!lead.name) lead.name = cleanName(t)
  return { lead, labeled, invalid }
}

/** Fills `base` from `patch`: labeled fields override, everything else only fills gaps. */
export function mergeLead(base: LeadDraft, patch: LeadParse): LeadDraft {
  const out = { ...base }
  for (const f of Object.keys(out) as LeadField[]) {
    const v = patch.lead[f]
    const has = v !== null && v !== ""
    const empty = out[f] === null || out[f] === ""
    if (has && (empty || patch.labeled.includes(f))) (out as any)[f] = v
  }
  return out
}

export function missingLeadFields(l: LeadDraft): ("name" | "phone" | "idNumber")[] {
  const m: ("name" | "phone" | "idNumber")[] = []
  if (!l.name || l.name.length < 2) m.push("name")
  if (!l.idNumber) m.push("idNumber")
  if (!l.phone) m.push("phone")
  return m
}

export function leadSummary(l: LeadDraft, opts: { maskId?: boolean } = {}): string {
  return [
    `👤 ${l.name || "— חסר שם —"}`,
    `🪪 ת.ז ${l.idNumber ? (opts.maskId ? maskId(l.idNumber) : l.idNumber) : "—"}`,
    `📞 ${l.phone || "— חסר טלפון —"}`,
    `📍 ${l.city || "—"}`,
    `🎂 ${l.age ? "גיל " + l.age : "—"}`,
    l.notes ? `📝 ${l.notes}` : "",
  ].filter(Boolean).join("\n")
}

// ── tasks ─────────────────────────────────────────────────────────

export type TaskStatus = "todo" | "inprogress" | "waiting" | "done"
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "לביצוע", inprogress: "בטיפול", waiting: "ממתין לתשובה", done: "בוצע" }

/** "@חיים" or "@חיים שפר" — the second word is a candidate surname, resolved against real users. */
export type TagToken = { first: string; second: string | null }

export type TaskParse = {
  title: string
  tags: TagToken[]
  /** names given via "תיוג: חיים, שלמה" — whole names, comma separated */
  tagNames: string[]
  due: string | null
  dueFound: boolean
  /** explicit "בלי תאריך" */
  noDate: boolean
  status: TaskStatus | null
  urgent: boolean
}

export function statusFromWord(w: string): TaskStatus | null {
  const k = keyOf(w)
  if (/^(לביצוע|פתוח|חדש)$/u.test(k)) return "todo"
  if (/^(בטיפול|בתהליך|התחלתי|בעבודה)$/u.test(k)) return "inprogress"
  if (/^(ממתין|ממתינה|מחכה|ממתין לתשובה|מחכה לתשובה)$/u.test(k)) return "waiting"
  if (/^(בוצע|בוצעה|הושלם|סיימתי)$/u.test(k)) return "done"
  return null
}

/**
 * Free text → task fields. `fullNames` (active users' names) lets "@חיים שפר"
 * consume the surname while "@חיים להתקשר" leaves "להתקשר" in the title.
 */
export function parseTask(raw: string, today = todayIL(), fullNames: string[] = []): TaskParse {
  let text = normalize(raw).replace(/^משימה(?:\s+חדשה)?\s*[:\-–]?\s*/u, "")
  const out: TaskParse = { title: "", tags: [], tagNames: [], due: null, dueFound: false, noDate: false, status: null, urgent: false }

  // labeled lines (multi-line messages arrive with newlines in raw)
  const lines = String(raw || "").split("\n").map(normalize).filter(Boolean)
  if (lines.length > 1 || /^(כותרת|תיוג|תאריך|יעד|סטטוס)\s*[:\-–]/u.test(text)) {
    const rest: string[] = []
    for (const ln of lines) {
      const m = ln.replace(/^משימה(?:\s+חדשה)?\s*[:\-–]?\s*/u, "").match(/^(כותרת|תיוג|מתויגים|תאריך|יעד|סטטוס)\s*[:\-–]\s*(.*)$/u)
      if (!m) { rest.push(ln.replace(/^משימה(?:\s+חדשה)?\s*[:\-–]?\s*/u, "")); continue }
      const [, k, v] = m
      if (k === "כותרת") rest.unshift(v)
      else if (k === "תיוג" || k === "מתויגים") out.tagNames.push(...v.split(/[,،]|\sו(?=[\p{L}])/u).map(s => s.replace(/^@/, "").trim()).filter(Boolean))
      else if (k === "תאריך" || k === "יעד") {
        if (/בלי|ללא/u.test(v)) out.noDate = true
        else { const d = extractDate(v, today); out.due = d.due; out.dueFound = d.found }
      } else if (k === "סטטוס") out.status = statusFromWord(v)
    }
    text = rest.join(" ")
  }

  // "תיוג: ..." inline at the end
  const inlineTag = text.match(/(?:^|\s)תיוג\s*[:\-–]\s*(.+)$/u)
  if (inlineTag) {
    out.tagNames.push(...inlineTag[1].split(/[,،]/).map(s => s.replace(/^@/, "").trim()).filter(Boolean))
    text = text.slice(0, inlineTag.index)
  }

  // @mentions
  const known = new Set(fullNames.map(n => foldName(n)))
  text = text.replace(/@\s?([\p{L}"'״׳\-]+)(?:(\s+)([\p{L}"'״׳\-]+))?/gu, (_m, a: string, sp?: string, b?: string) => {
    if (b && known.has(foldName(`${a} ${b}`))) { out.tags.push({ first: a, second: b }); return " " }
    out.tags.push({ first: a, second: null })
    return b ? ` ${b}` : " "
  })

  // urgency
  if (word("דחוף|דחופה|בדחיפות").test(text) || /!\s*$/.test(text)) out.urgent = true
  text = text.replace(word("דחוף|דחופה|בדחיפות", "gu"), " ").replace(/!+\s*$/, " ")

  // status: "סטטוס X" anywhere, or a status word as the last word
  const sm = text.match(/(?:^|\s)סטטוס\s*[:\-–]?\s*(\S+(?:\s+לתשובה)?)/u)
  if (sm && statusFromWord(sm[1])) { out.status = statusFromWord(sm[1]); text = text.replace(sm[0], " ") }
  else {
    const lm = text.match(/(?:^|\s)\(?(בטיפול|ממתין לתשובה|ממתין|מחכה לתשובה|לביצוע)\)?\s*$/u)
    if (lm) { out.status = statusFromWord(lm[1]); text = text.slice(0, lm.index) }
  }

  // explicit no date
  if (/(?:^|\s)(?:בלי|ללא)\s+תאריך(?:\s+יעד)?(?=\s|$)/u.test(text)) {
    out.noDate = true
    text = text.replace(/(?:^|\s)(?:בלי|ללא)\s+תאריך(?:\s+יעד)?(?=\s|$)/u, " ")
  }

  if (!out.dueFound && !out.noDate) {
    const d = extractDate(text, today)
    if (d.found) { out.due = d.due; out.dueFound = true; text = d.rest }
  }

  out.title = squash(text).replace(/(?:^|\s)(?:עד|ל|ב)$/u, "").replace(/^[\s,.:;\-–]+|[\s,.:;\-–]+$/g, "").slice(0, 200)
  return out
}

// ── people (tag resolution) ───────────────────────────────────────

export type Person = { id: number; name: string }

const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" }
/** Comparable form of a name: no punctuation, final letters folded, lower case. */
export function foldName(s: string): string {
  return normalize(s).replace(/["'״׳\-]/g, "").replace(/[ךםןףץ]/g, c => FINALS[c] || c).toLowerCase()
}
const fold = foldName

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}

export type TagResolution =
  | { kind: "match"; person: Person; usedSecond: boolean }
  | { kind: "ambiguous"; token: string; options: Person[]; usedSecond: boolean }
  | { kind: "suggest"; token: string; person: Person }
  | { kind: "none"; token: string }

/** Resolves a name (or @first [second]) against active users. */
export function resolvePerson(first: string, second: string | null, people: Person[]): TagResolution {
  const f = fold(first), s = second ? fold(second) : ""
  if (s) {
    const full = people.filter(p => fold(p.name) === `${f} ${s}`)
    if (full.length === 1) return { kind: "match", person: full[0], usedSecond: true }
  }
  const exact = people.filter(p => fold(p.name) === f)
  if (exact.length === 1) return { kind: "match", person: exact[0], usedSecond: false }
  const byFirst = people.filter(p => fold(p.name).split(" ")[0] === f || fold(p.name).split(" ").slice(-1)[0] === f)
  if (byFirst.length === 1) return { kind: "match", person: byFirst[0], usedSecond: false }
  if (byFirst.length > 1) {
    if (s) {
      const narrowed = byFirst.filter(p => fold(p.name).includes(s))
      if (narrowed.length === 1) return { kind: "match", person: narrowed[0], usedSecond: true }
    }
    return { kind: "ambiguous", token: first, options: byFirst, usedSecond: false }
  }
  const tol = f.length <= 4 ? 1 : 2
  let best: { p: Person; d: number } | null = null
  for (const p of people) {
    for (const part of [fold(p.name), ...fold(p.name).split(" ")]) {
      const dd = levenshtein(f, part)
      if (dd <= tol && (!best || dd < best.d)) best = { p, d: dd }
    }
  }
  return best ? { kind: "suggest", token: first, person: best.p } : { kind: "none", token: first }
}

/** Full-name strings from "תיוג: חיים שפר, שלמה" → same resolver. */
export function resolveName(name: string, people: Person[]): TagResolution {
  const parts = normalize(name).split(" ")
  return resolvePerson(parts[0] || "", parts.slice(1).join(" ") || null, people)
}

// ── commands ──────────────────────────────────────────────────────

export type Command =
  | "menu" | "help" | "actions" | "cancel" | "back" | "support" | "resume"
  | "save" | "edit" | "save_no_id"
  | "lead_new" | "task_new" | "my_tasks" | "lead_status" | "week"
  | "date_today" | "date_tomorrow" | "date_none"
  | "t_done" | "t_progress" | "t_waiting" | "t_postpone"
  | "pp_tomorrow" | "pp_sunday" | "pp_other"

/** Whole-message keywords → command. Context decides whether a command applies. */
export function commandOf(raw: string): Command | null {
  const k = keyOf(raw)
  if (!k) return null
  if (/^(תפריט|היי|הי|הני|הייי|שלום|שלומ|שלום לך|בוקר טוב|ערב טוב|צהריים טובים|מה נשמע|start|התחל|menu)$/u.test(k)) return "menu"
  if (/^(עזרה|help|\?|הסבר|איך|איך עושים|הוראות)$/u.test(k)) return "help"
  if (/^(פעולות|לפעולות|אפשרויות|מה אפשר|מה אפשר לעשות)$/u.test(k)) return "actions"
  if (/^(ביטול|בטל|לבטל|עזוב|יציאה|stop)$/u.test(k)) return "cancel"
  if (/^(חזור|חזרה|אחורה)$/u.test(k)) return "back"
  if (/^(תמיכה|נציג|דבר עם אלעזר|עזרה אנושית)$/u.test(k)) return "support"
  if (/^(המשך|להמשיך)$/u.test(k)) return "resume"
  if (/^(שמור|לשמור|כן|אישור|מאשר|מאשרת|ok|אוקיי|אוקי|יאללה|נכון|👍)$/u.test(k)) return "save"
  if (/^(תקן|לתקן|תיקון|עריכה|ערוך|לא נכון)$/u.test(k)) return "edit"
  if (/^(שמור בלי ת\.?ז|בלי ת\.?ז|אין ת\.?ז|ללא ת\.?ז|שמור בלי תז)$/u.test(k)) return "save_no_id"
  if (/^(לא)$/u.test(k)) return "cancel"
  if (/^(ליד חדש|ליד|להכניס ליד|ליד נוסף|ליד אחר)$/u.test(k)) return "lead_new"
  if (/^(משימה חדשה|משימה|להוסיף משימה|משימה נוספת)$/u.test(k)) return "task_new"
  if (/^(המשימות שלי|משימות|מה המשימות שלי|רשימה|המשימות)$/u.test(k)) return "my_tasks"
  if (/^(סטטוס ליד|סטטוס|בדיקת ליד|מה עם ליד|חיפוש ליד|חיפוש נוסף)$/u.test(k)) return "lead_status"
  if (/^(השבוע שלי|השבוע|יומן|לוז|לו"ז|מה יש לי|מה מתוכנן|מה יש לי השבוע)$/u.test(k)) return "week"
  if (/^(היום)$/u.test(k)) return "date_today"
  if (/^(מחר)$/u.test(k)) return "date_tomorrow"
  if (/^(בלי תאריך|ללא תאריך|אין תאריך)$/u.test(k)) return "date_none"
  if (/^(בוצע|בוצעה|סיימתי)$/u.test(k)) return "t_done"
  if (/^(בטיפול|בתהליך)$/u.test(k)) return "t_progress"
  if (/^(ממתין|מחכה)$/u.test(k)) return "t_waiting"
  if (/^(דחה|דחי|לדחות)$/u.test(k)) return "t_postpone"
  if (/^(יום ראשון|לראשון)$/u.test(k)) return "pp_sunday"
  if (/^(תאריך אחר)$/u.test(k)) return "pp_other"
  return null
}

/** Loose "what's on this week" phrasing ("מה יש לי בשבוע הקרוב?"). Only checked at menu level. */
export function looksLikeWeekQuery(raw: string): boolean {
  const k = keyOf(raw)
  return k.split(" ").length <= 7 && /(?:^|\s)(?:ב?שבוע|השבוע|ה?יומן|ביומן|לו"?ז)(?:\s|$)/u.test(k) && !/\d/.test(k)
}

/** "בוצע 1 3", "בטיפול 2", "ממתין 2", "דחה 2 ליום ראשון" — numbered shortcuts on the last task list. */
export type ListOp =
  | { op: "status"; status: TaskStatus; indexes: number[] }
  | { op: "postpone"; indexes: number[]; due: string }

export function listOpOf(raw: string, today = todayIL()): ListOp | null {
  const t = normalize(raw)
  let m = t.match(/^(בוצע|בוצעה|סיימתי|בטיפול|בתהליך|ממתין|מחכה)\s+((?:\d{1,2}[\s,]*)+)$/u)
  if (m) {
    const status = statusFromWord(m[1])!
    return { op: "status", status, indexes: m[2].split(/[\s,]+/).filter(Boolean).map(Number) }
  }
  m = t.match(/^(?:דחה|דחי|לדחות)\s+((?:\d{1,2}[\s,]*)+?)\s*(.*)$/u)
  if (m) {
    const d = extractDate(m[2] || "מחר", today)
    return { op: "postpone", indexes: m[1].split(/[\s,]+/).filter(Boolean).map(Number), due: d.due || addDays(today, 1) }
  }
  return null
}

/** "ליד: ..." / "משימה: ..." / "סטטוס ..." typed with content — skips the menu. */
export function shortcutOf(raw: string): { kind: "lead" | "task" | "lead_query"; body: string } | null {
  const t = String(raw || "").trim()
  let m = t.match(/^ליד(?:\s+חדש)?\s*[:\-–]?\s*([\s\S]+)$/u)
  if (m && /\d|[:\n]/.test(m[1])) return { kind: "lead", body: m[1] }
  m = t.match(/^משימה(?:\s+חדשה)?\s*[:\-–]\s*([\s\S]+)$/u) || t.match(/^משימה(?:\s+חדשה)?\s+([\s\S]{4,})$/u)
  if (m) return { kind: "task", body: m[1] }
  m = normalize(t).match(/^(?:סטטוס|מצב|בדוק|בדיקה|מה הסטטוס של|מה המצב של|מה קורה עם)\s*(?:של\s+)?(?:ליד|הליד)?\s*[:\-–]?\s*(.{2,})$/u)
  if (m) return { kind: "lead_query", body: m[1] }
  return null
}

export function parseLeadQuery(raw: string): { phone?: string; idNumber?: string; name?: string } {
  const t = normalize(raw)
  const p = findPhone(t)
  if (p.phone) return { phone: p.phone }
  const id = t.match(/(?<!\d)(\d{5,9})(?!\d)/)
  if (id) return { idNumber: padId(id[1]) }
  const name = t.replace(/[^\p{L}\p{N}"'״ ]/gu, "").trim()
  return name.length >= 2 && /\p{L}{2,}/u.test(name) ? { name } : {}
}
