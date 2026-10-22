"use client"
import { useState } from "react"
import Modal from "@/components/ui/Modal"
import { MTG_TYPE } from "@/components/admin/MeetingForm"

const TASK_TYPE: Record<string, string> = { call: "שיחה", meeting: "פגישה", materials: "חומרים", backoffice: "בק-אופיס" }

interface Sugg { title: string; details?: string; type: string; due_date: string; assignees: string; skip?: boolean; saved?: boolean; failed?: boolean }

interface Props {
  open: boolean
  coordinators: { id: number; name: string }[]
  /** Pre-selected coordinator (card page). */
  coordinatorId?: number
  onClose: () => void
  onSaved: () => void
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Meeting summary → reviewed task proposals → save.
 * Saving is two kinds of request (meeting, then each selected task), so
 * a partial failure is tracked per item: the meeting is never posted
 * twice, and "retry" re-sends only the tasks that did not save.
 */
export default function MeetingDialog({ open, coordinators, coordinatorId, onClose, onSaved }: Props) {
  const blank = () => ({ coordinator_id: coordinatorId ? String(coordinatorId) : "", date: today(), type: "regular", agenda: "", summary: "", next_meeting_date: "" })
  const [form, setForm] = useState(blank)
  const [sugg, setSugg] = useState<Sugg[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractNote, setExtractNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [meetingId, setMeetingId] = useState<number | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [notify, setNotify] = useState(true)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const coordName = coordinators.find(c => String(c.id) === form.coordinator_id)?.name || ""
  const dirty = !!(form.summary.trim() || form.agenda.trim() || form.next_meeting_date || sugg.length) && meetingId === null
  const set = (k: keyof ReturnType<typeof blank>, v: string) => setForm(f => ({ ...f, [k]: v }))

  function reset() { setForm(blank()); setSugg([]); setMeetingId(null); setResult(null); setExtractNote(""); setConfirmDiscard(false) }
  function requestClose() {
    if (saving) return
    if (dirty && !confirmDiscard) { setConfirmDiscard(true); return }
    reset(); onClose()
  }

  async function extract() {
    if (!form.summary.trim() || !form.coordinator_id) return
    setExtracting(true); setExtractNote("")
    try {
      const r = await fetch("/api/extract-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: form.summary, coordinator_name: coordName, date: form.date }) })
      const d = r.ok ? await r.json() : { tasks: [] }
      const list: Sugg[] = (d.tasks || []).map((t: any) => ({ title: t.title || "", details: t.details || "", type: t.type || "call", due_date: String(t.due_date || "").slice(0, 10), assignees: coordName }))
      setSugg(list)
      if (!list.length) setExtractNote("לא נמצאו הצעות למשימות בסיכום. אפשר לשמור את הפגישה בלבד.")
    } catch { setExtractNote("החילוץ לא הצליח כרגע. אפשר לשמור את הפגישה ולהוסיף משימות ידנית.") }
    finally { setExtracting(false) }
  }

  async function save() {
    if (!form.coordinator_id || !form.summary.trim()) return
    setSaving(true); setResult(null)
    let mid = meetingId
    try {
      if (mid === null) {
        const r = await fetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, coordinator_id: Number(form.coordinator_id) }) })
        if (!r.ok) throw new Error("meeting")
        const d = await r.json()
        mid = d.meeting?.id ?? -1
        setMeetingId(mid)
      }
    } catch {
      setSaving(false)
      setResult({ ok: false, text: "הפגישה לא נשמרה. הטיוטה נשארה בטופס — אפשר לנסות שוב." })
      return
    }
    const next = [...sugg]
    for (let i = 0; i < next.length; i++) {
      const t = next[i]
      if (t.skip || t.saved || !t.title.trim()) continue
      try {
        const assignees = t.assignees.split(",").map(s => s.trim()).filter(Boolean)
        const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          title: t.title.trim(), details: t.details || "", type: t.type, due_date: t.due_date || null, assignees,
          coordinator_id: Number(form.coordinator_id), status: "todo", notify,
          ...(mid && mid > 0 ? { meeting_id: mid } : {}),
        }) })
        next[i] = { ...t, saved: r.ok, failed: !r.ok }
      } catch { next[i] = { ...t, saved: false, failed: true } }
    }
    setSugg(next)
    setSaving(false)
    const failed = next.filter(t => t.failed && !t.skip).length
    const saved = next.filter(t => t.saved).length
    if (failed) { setResult({ ok: false, text: `הפגישה נשמרה. ${saved} משימות נשמרו ו־${failed} לא נשמרו — לחיצה על ״ניסיון חוזר״ תשלח רק את מה שחסר.` }); return }
    reset(); onSaved()
  }

  const kept = sugg.filter(t => !t.skip && !t.saved).length
  const label = meetingId !== null ? `ניסיון חוזר (${kept})` : kept ? `שמירת פגישה ו־${kept} משימות` : "שמירת פגישה"

  return (
    <Modal open={open} onClose={requestClose} title="סיכום פגישת ליווי" subtitle="מתעדים החלטות ובודקים משימות לפני שמירה" accent="#27634e" width="780px"
      footer={confirmDiscard ? (
        <div className="coord-dialog flex items-center gap-2 flex-wrap w-full">
          <span className="c-sub">יש טיוטה שלא נשמרה. לסגור ולוותר עליה?</span>
          <button className="c-secondary" onClick={() => { reset(); onClose() }}>ויתור וסגירה</button>
          <button className="c-primary" onClick={() => setConfirmDiscard(false)}>המשך עריכה</button>
        </div>
      ) : (
        <div className="coord-dialog flex items-center gap-2 flex-wrap">
          <button className="c-primary" onClick={save} disabled={saving || !form.coordinator_id || !form.summary.trim()}>{saving ? "שומר…" : label}</button>
          <button className="c-secondary" onClick={requestClose} disabled={saving}>{meetingId !== null ? "סגירה" : "ביטול"}</button>
        </div>
      )}>
      <div className="coord-dialog">
        <div className="c-formgrid">
          {!coordinatorId && (
            <label className="c-field">רכז *
              <select value={form.coordinator_id} onChange={e => set("coordinator_id", e.target.value)} disabled={meetingId !== null}>
                <option value="">בחירת רכז</option>
                {coordinators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="c-field">תאריך<input type="date" value={form.date} onChange={e => set("date", e.target.value)} disabled={meetingId !== null} /></label>
          <label className="c-field">סוג פגישה
            <select value={form.type} onChange={e => set("type", e.target.value)} disabled={meetingId !== null}>
              {Object.entries(MTG_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="c-field">פגישה הבאה<input type="date" value={form.next_meeting_date} onChange={e => set("next_meeting_date", e.target.value)} disabled={meetingId !== null} /></label>
          <label className="c-field c-full">נושאים<input value={form.agenda} onChange={e => set("agenda", e.target.value)} placeholder="התקדמות, שותפים וחסמים" disabled={meetingId !== null} /></label>
          <label className="c-field c-full">סיכום הפגישה *
            <textarea value={form.summary} onChange={e => set("summary", e.target.value)} placeholder="מה עלה בשיחה, מה סוכם ומה צריך לקדם?" disabled={meetingId !== null} />
            <small>הסיכום נדרש לפני הצעת משימות. ההצעות לא נשמרות עד שבוחרים ומאשרים.</small>
          </label>
        </div>

        {meetingId === null && (
          <button className="c-textbtn" type="button" onClick={extract} disabled={extracting || !form.summary.trim() || !form.coordinator_id}>
            {extracting ? "מחלץ הצעות…" : sugg.length ? "חילוץ מחדש מהסיכום" : "הצעת משימות מהסיכום (AI)"}
          </button>
        )}
        {extractNote && <p className="c-note">{extractNote}</p>}

        {sugg.length > 0 && (
          <div className="c-suggested">
            <h3>הצעות משימה · לבדיקה ולעריכה</h3>
            {sugg.map((t, i) => (
              <div key={i} className={`c-sugg ${t.skip ? "off" : ""}`}>
                <input type="checkbox" checked={!t.skip} disabled={t.saved} aria-label={`בחירת ${t.title}`} onChange={e => setSugg(s => s.map((x, j) => j === i ? { ...x, skip: !e.target.checked } : x))} />
                <div className="c-grow">
                  <input type="text" value={t.title} disabled={t.saved} aria-label="כותרת המשימה" onChange={e => setSugg(s => s.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                  <div className="row2">
                    <input type="text" value={t.assignees} disabled={t.saved} aria-label="עובדים משויכים (מופרדים בפסיק)" placeholder="עובדים משויכים" onChange={e => setSugg(s => s.map((x, j) => j === i ? { ...x, assignees: e.target.value } : x))} />
                    <select value={t.type} disabled={t.saved} aria-label="סוג" onChange={e => setSugg(s => s.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                      {Object.entries(TASK_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input type="date" value={t.due_date} disabled={t.saved} aria-label="מועד" onChange={e => setSugg(s => s.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} />
                  </div>
                  {t.details && <div className="c-note" style={{ margin: "6px 0 0" }}>{t.details}</div>}
                  {t.saved && <span className="c-badge" style={{ marginTop: 6 }}>נשמרה</span>}
                  {t.failed && !t.saved && <span className="c-badge red" style={{ marginTop: 6 }}>לא נשמרה</span>}
                </div>
              </div>
            ))}
            <label className="c-note" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> לשלוח התראה לעובדים המשויכים
            </label>
          </div>
        )}

        {result && <div className={`c-result ${result.ok ? "ok" : "bad"}`} role="status">{result.text}</div>}
      </div>
    </Modal>
  )
}
