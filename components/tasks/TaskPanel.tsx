"use client"
import useTaskDialog from "./useTaskDialog"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { STATUS, TYPE_LABEL, PRIORITY_LABEL, RECURRENCE_LABEL, initials, avatarColor, relDay } from "./task-model"

export type Person = { id: number; name: string; _isManager?: boolean }

export interface TaskForm {
  title: string; type: string; assignees: string[]; due_date: string; status: string
  event_id: string; contact_id: string; details: string; recurrence: string; priority: string
}
export const EMPTY_FORM: TaskForm = { title: "", type: "call", assignees: [], due_date: "", status: "todo", event_id: "", contact_id: "", details: "", recurrence: "", priority: "normal" }

export function formFromTask(t: any): TaskForm {
  return {
    title: t.title || "", type: t.type || "call", assignees: t.assignees || [],
    due_date: t.due_date ? String(t.due_date).slice(0, 10) : "", status: t.status || "todo",
    event_id: t.event_id ? String(t.event_id) : "", contact_id: t.contact_id ? String(t.contact_id) : "",
    details: t.details || "", recurrence: t.recurrence || "", priority: t.priority || "normal",
  }
}

interface Props {
  mode: "admin" | "coord"
  task: any | null                 // null = creating
  form: TaskForm
  setForm: (f: TaskForm | ((f: TaskForm) => TaskForm)) => void
  people: Person[]
  contacts: any[]
  events: any[]
  today: string
  saving: boolean
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
  /** admin: show the delivery log of notifications sent for this task. */
  showNotifyLog?: boolean
  /** Base path of the entity pages: contacts/events live under /admin or /coord. */
  base: "/admin" | "/coord"
}

const FIELD = "w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#28634e] transition-colors"
const LABEL = "text-[11px] font-bold tracking-wide text-[#63756b] block mb-1"

export default function TaskPanel({ mode, task, form, setForm, people, contacts, events, today, saving, onSave, onDelete, onClose, showNotifyLog, base }: Props) {
  const dialogRef = useTaskDialog(onClose)
  const router = useRouter()
  const titleRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Checklist + comments need a real id — loaded only when editing.
  const [checklist, setChecklist] = useState<any[]>([])
  const [newItem, setNewItem] = useState("")
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState("")
  const [extrasLoading, setExtrasLoading] = useState(false)

  useEffect(() => {
    if (!task?.id) { setChecklist([]); setComments([]); setTimeout(() => titleRef.current?.focus(), 30); return }
    let alive = true
    setExtrasLoading(true)
    Promise.all([fetch(`/api/tasks/${task.id}/checklist`), fetch(`/api/tasks/${task.id}/comments`)])
      .then(async ([a, b]) => {
        const { items } = await a.json(); const { comments } = await b.json()
        if (alive) { setChecklist(items || []); setComments(comments || []) }
      })
      .catch(() => {})
      .finally(() => alive && setExtrasLoading(false))
    return () => { alive = false }
  }, [task?.id])

  // Escape closes; Cmd/Ctrl+Enter saves. onClose via ref so the effect never re-binds.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current()
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSave()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSave])

  async function addItem() {
    if (!newItem.trim() || !task?.id) return
    const r = await fetch(`/api/tasks/${task.id}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: newItem.trim() }) })
    const { item } = await r.json()
    if (item) setChecklist(c => [...c, item]); setNewItem("")
  }
  async function toggleItem(id: number, done: boolean) {
    setChecklist(c => c.map(x => x.id === id ? { ...x, done } : x))
    await fetch(`/api/tasks/${task.id}/checklist`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, done }) })
  }
  async function removeItem(id: number) {
    setChecklist(c => c.filter(x => x.id !== id))
    await fetch(`/api/tasks/${task.id}/checklist`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
  }
  async function addComment() {
    if (!newComment.trim() || !task?.id) return
    const r = await fetch(`/api/tasks/${task.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: newComment.trim() }) })
    const { comment } = await r.json()
    if (comment) setComments(c => [...c, comment]); setNewComment("")
  }

  function toggleAssignee(name: string) {
    setForm(f => ({ ...f, assignees: f.assignees.includes(name) ? f.assignees.filter(x => x !== name) : [...f.assignees, name] }))
  }

  const doneItems = checklist.filter(c => c.done).length
  const notifyLog: any[] = Array.isArray(task?.notify_log) ? task.notify_log.slice(-5).reverse() : []
  const contact = form.contact_id ? contacts.find(c => String(c.id) === form.contact_id) : null
  const event = form.event_id ? events.find(e => String(e.id) === form.event_id) : null

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside ref={dialogRef} tabIndex={-1} className="panel" role="dialog" aria-modal="true" aria-label={task ? "פרטי משימה ועריכה" : "משימה חדשה"} dir="rtl">
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#EEF2F6]">
          <div className="text-xs font-bold text-[#63756b]">{task ? `פרטי משימה · #${task.id}` : "יצירת משימה חדשה"}</div>
          <div className="flex items-center gap-1">
            {task && onDelete && (
              <button onClick={onDelete} className="press px-2.5 py-1.5 rounded-[8px] text-xs font-semibold text-[#63756b] hover:text-[#a74450] hover:bg-[#FFF1F1]">מחיקה</button>
            )}
            <button onClick={onClose} aria-label="סגור" className="press w-8 h-8 rounded-[8px] text-[#63756b] hover:bg-[#edf1e9] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
            </button>
          </div>
        </header>

        <div className="tw-panel-body flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <input ref={titleRef} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="מה צריך לעשות?" aria-label="כותרת"
            className="w-full text-lg font-bold text-[#193d33] placeholder:text-[#B6C2D1] placeholder:font-semibold bg-transparent border-0 border-b border-[#e1e8df] focus:outline-none focus:border-[#28634e] py-1.5 transition-colors" />

          {/* Status as a segmented control — the most-changed field, so it gets the most room. */}
          <div className="tw-panel-status">
            <span className={LABEL}>סטטוס</span>
            <div className="grid grid-cols-4 gap-1 bg-[#edf1e9] p-1 rounded-[10px]">
              {STATUS.map(s => {
                const on = form.status === s.key
                return (
                  <button key={s.key} type="button" aria-pressed={on} onClick={() => setForm(f => ({ ...f, status: s.key }))}
                    className="press rounded-[8px] py-1.5 text-[12px] font-bold"
                    style={{ background: on ? "#fff" : "transparent", color: on ? s.fg : "#63756b", boxShadow: on ? "0 1px 2px rgba(13,39,68,.12)" : "none" }}>
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>תאריך יעד</label>
              <input aria-label="תאריך יעד" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={FIELD} />
              <div className="flex gap-1 mt-1.5">
                {[["היום", today], ["מחר", shift(today, 1)], ["שבוע", shift(today, 7)]].map(([l, v]) => (
                  <button key={l} type="button" onClick={() => setForm(f => ({ ...f, due_date: v }))}
                    className={`press text-[11px] px-2 py-0.5 rounded-full border ${form.due_date === v ? "bg-[#193d33] text-white border-[#193d33]" : "bg-white text-[#63756b] border-[#e1e8df] hover:border-[#94A3B8]"}`}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={LABEL}>דחיפות</label>
              <select aria-label="דחיפות" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={FIELD}>
                {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>סוג</label>
              <select aria-label="סוג משימה" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={FIELD}>
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>חזרה</label>
              <select aria-label="חזרה" value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))} className={FIELD}>
                <option value="">חד-פעמית</option>
                {Object.entries(RECURRENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="tw-panel-assignees">
            <span className={LABEL}>{mode === "admin" ? "משויכים" : "שותפים למשימה"}</span>
            <p>אפשר לשייך את המשימה למספר עובדים. נבחרו {form.assignees.length}.</p>
            <div className="flex flex-wrap gap-1.5">
              {people.map(p => {
                const on = form.assignees.includes(p.name)
                const col = avatarColor(p.name)
                return (
                  <button key={`${p.id}-${p._isManager ? "m" : "c"}`} type="button" aria-pressed={on} onClick={() => toggleAssignee(p.name)}
                    className={`press inline-flex items-center gap-1.5 text-xs rounded-full pl-2.5 pr-1 py-1 border ${on ? "bg-[#193d33] border-[#193d33] text-white" : "bg-white border-[#e1e8df] text-[#334155] hover:border-[#94A3B8]"}`}>
                    <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: on ? "rgba(255,255,255,.18)" : col.bg, color: on ? "#fff" : col.fg }}>{initials(p.name)}</span>
                    <span>{p.name.replace(/\s*👑\s*/g, "")}</span>
                    {p._isManager && <span className="text-[10px] opacity-70">מנהל</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="tw-panel-relations grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>איש קשר</label>
              <select aria-label="איש קשר" value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))} className={FIELD}>
                <option value="">— ללא —</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.org ? ` · ${c.org}` : ""}</option>)}
              </select>
              {contact && <button type="button" onClick={() => router.push(`${base}/contacts?open=${contact.id}`)} className="text-[11px] text-[#28634e] font-semibold mt-1 hover:underline">פתח את {contact.name} ←</button>}
            </div>
            <div>
              <label className={LABEL}>אירוע</label>
              <select aria-label="אירוע" value={form.event_id} onChange={e => setForm(f => ({ ...f, event_id: e.target.value }))} className={FIELD}>
                <option value="">— ללא —</option>
                {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {event && <button type="button" onClick={() => router.push(`${base}/events`)} className="text-[11px] text-[#28634e] font-semibold mt-1 hover:underline">לאירועים ←</button>}
            </div>
          </div>

          <div className="tw-panel-notes">
            <label className={LABEL}>פרטים</label>
            <textarea aria-label="פרטי המשימה" value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} rows={3} className={FIELD + " resize-y leading-relaxed"} placeholder="הקשר, מה כבר נעשה, מה חסר…" />
          </div>

          {task?.id && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <span className={LABEL + " mb-0"}>רשימת משנה</span>
                {checklist.length > 0 && <span className="text-[11px] text-[#63756b]">{doneItems}/{checklist.length}</span>}
              </div>
              {checklist.length > 0 && (
                <div className="h-1 rounded-full bg-[#EEF2F6] mb-2 overflow-hidden">
                  <div className="h-full bg-[#28634e] rounded-full transition-[width] duration-300" style={{ width: `${Math.round(doneItems / checklist.length * 100)}%` }} />
                </div>
              )}
              <ul className="space-y-1">
                {checklist.map(c => (
                  <li key={c.id} className="group flex items-center gap-2 py-1">
                    <button type="button" onClick={() => toggleItem(c.id, !c.done)} className={`check ${c.done ? "on" : ""}`} aria-label={c.done ? "בטל סימון" : "סמן כבוצע"} style={{ width: 18, height: 18 }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2.2 2.2L8 3" /></svg>
                    </button>
                    <span className={`title flex-1 text-sm ${c.done ? "done" : "text-[#193d33]"}`}>{c.text}</span>
                    <button type="button" onClick={() => removeItem(c.id)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#94A3B8] hover:text-[#a74450] text-xs px-1 transition-opacity" aria-label="הסר">✕</button>
                  </li>
                ))}
                {extrasLoading && checklist.length === 0 && <li className="text-xs text-[#94A3B8]">טוען…</li>}
              </ul>
              <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem() } }}
                placeholder="פריט חדש לרשימת המשנה" aria-label="פריט חדש לרשימת המשנה" className="w-full mt-1 px-2 py-1.5 text-sm bg-transparent border-b border-dashed border-[#c6d2c7] focus:outline-none focus:border-[#28634e] transition-colors" />
              <button className="tw-add-check" disabled={!newItem.trim()} onClick={addItem}>הוסף פריט</button>
            </section>
          )}

          {task?.id && (
            <section>
              <span className={LABEL}>תגובות</span>
              <ul className="space-y-2">
                {comments.map(c => (
                  <li key={c.id} className="rounded-[10px] bg-[#f7f9f5] px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] text-[#63756b] mb-0.5">
                      <span className="font-bold text-[#193d33]">{c.author_name}</span>
                      <span>{relDay(c.created_at, today)}</span>
                    </div>
                    <div className="text-sm text-[#193d33] leading-relaxed whitespace-pre-wrap">{c.body}</div>
                  </li>
                ))}
                {!comments.length && !extrasLoading && <li className="text-xs text-[#94A3B8]">עדיין אין תגובות</li>}
              </ul>
              <div className="flex gap-2 mt-2">
                <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addComment() } }}
                  placeholder="כתוב תגובה…" className={FIELD} />
                <button type="button" onClick={addComment} disabled={!newComment.trim()} className="press px-3 rounded-[9px] bg-[#193d33] text-white text-sm font-bold disabled:opacity-40">שלח</button>
              </div>
            </section>
          )}

          {showNotifyLog && notifyLog.length > 0 && (
            <section>
              <span className={LABEL}>התראות שנשלחו</span>
              <ul className="space-y-1">
                {notifyLog.map((n: any, i: number) => (
                  <li key={i} className="flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-[8px] bg-[#f7f9f5]">
                    <span className="text-[#334155]">{n.channel === "email" ? "מייל" : n.channel === "push" ? "פוש" : "וואטסאפ"} · {n.to}</span>
                    <span className={`font-bold ${n.ok ? "text-[#28634e]" : "text-[#a74450]"}`}>{n.ok ? "נשלח" : "נכשל"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-[#EEF2F6] flex items-center gap-2 bg-white">
          <button onClick={onSave} disabled={saving || !form.title.trim()} className="press flex-1 py-2.5 rounded-[10px] bg-[#28634e] text-white text-sm font-bold disabled:opacity-40 hover:bg-[#1d4e3d]">
            {saving ? "שומר…" : task ? "שמור שינויים" : "צור משימה"}
          </button>
          <button onClick={onClose} className="press px-4 py-2.5 rounded-[10px] border border-[#e1e8df] text-sm font-semibold text-[#334155] hover:bg-[#f7f9f5]">ביטול</button>
          <span className="hidden sm:block text-[10px] text-[#94A3B8] mr-auto">⌘↵ לשמירה</span>
        </footer>
      </aside>
    </>
  )
}

function shift(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n)
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}

