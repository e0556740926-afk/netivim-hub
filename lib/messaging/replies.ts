// Reply menu for SMS campaigns ("השב 1 / השב 2"). Pure — no "@/..." imports,
// so the worker and the webhook can both use it.

export type ReplyOption = {
  key: string          // what the recipient types: "1", "2", "כן"…
  label: string        // internal label shown in reports: "ביקש שיחה"
  callback: boolean    // add to "לידים מקמפיינים"
  reply_text: string   // automatic answer (empty = none)
}

export const DEFAULT_REPLIES: ReplyOption[] = [
  { key: "1", label: "ביקש שיחה חוזרת", callback: true, reply_text: "תודה! נציג מנתיבים יחזור אליך בהקדם." },
  { key: "2", label: "ביקש פרטים נוספים", callback: false, reply_text: "" },
]

/** Words that always mean "stop sending me" regardless of the menu. */
const STOP = ["הסר", "הסרה", "הסירו", "להסרה", "הסר אותי", "stop", "remove", "unsubscribe"]

/** Normalises a reply for matching: trims, drops punctuation/RTL marks, lowercases, Hebrew-neutral. */
export function normReply(body: string): string {
  return String(body || "")
    .replace(/[‎‏‪-‮"'״׳.,!?()\-_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export function isStop(body: string): boolean {
  const b = normReply(body)
  return STOP.includes(b)
}

/**
 * Finds which menu option a reply chose. Exact match first ("1"), then a
 * reply that starts with the key followed by a space ("1 תודה").
 * Returns null when nothing matched — the reply goes to "תשובות לטיפול".
 */
export function matchReply(body: string, options: ReplyOption[] | undefined | null): ReplyOption | null {
  const b = normReply(body)
  if (!b || !options?.length) return null
  const opts = options.filter(o => normReply(o.key))
  const exact = opts.find(o => normReply(o.key) === b)
  if (exact) return exact
  return opts.find(o => b.startsWith(normReply(o.key) + " ")) || null
}

/** Validation for the editor and for approval. */
export function replyProblems(options: ReplyOption[] | undefined | null): string[] {
  const out: string[] = []
  const keys = new Set<string>()
  for (const o of options || []) {
    const k = normReply(o.key)
    if (!k) { out.push("יש מקש בתפריט התשובות בלי ערך"); continue }
    if (STOP.includes(k)) out.push(`המקש "${o.key}" שמור להסרה`)
    if (keys.has(k)) out.push(`המקש "${o.key}" מופיע פעמיים בתפריט`)
    keys.add(k)
    if (!o.callback && !String(o.reply_text || "").trim()) out.push(`למקש "${o.key}" אין פעולה — סמנו "לחזור אליו" או כתבו תשובה אוטומטית`)
  }
  return out
}
