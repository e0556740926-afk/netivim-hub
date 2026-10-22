"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Button from "@/components/ui/Button"
import Card from "@/components/ui/Card"
import Modal from "@/components/ui/Modal"
import EmptyState from "@/components/ui/EmptyState"
import ErrorState from "@/components/ui/ErrorState"
import { SkeletonCard } from "@/components/ui/Skeleton"
import { useToast } from "@/components/ui/Toast"
import { fd } from "@/lib/utils"

// ─── labels ────────────────────────────────────────────────────────────
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
const DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]
const FREQ: Record<string, string> = { daily: "יומי", weekly: "שבועי", monthly: "חודשי" }
const LINKED: Record<string, string> = { weekly_report: "דיווח שבועי", meeting: "פגישה" }
const STATUS: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  planned:   { label: "מתוכנן", bg: "#edf1e9", fg: "#63756b", dot: "#94A3B8" },
  done:      { label: "בוצע",   bg: "#eaf1e7", fg: "#28634e", dot: "#16A34A" },
  missed:    { label: "חסר",    bg: "#faeeed", fg: "#a74450", dot: "#DC2626" },
  postponed: { label: "נדחה",   bg: "#faf1e3", fg: "#946014", dot: "#F59E0B" },
}
const TASK_TYPE: Record<string, string> = { call: "שיחה", meeting: "פגישה", materials: "חומרים", backoffice: "בק-אופיס" }

const EMPTY_ROUTINE = { name: "", description: "", frequency: "weekly", weekday: 2, day_of_month: 1, time: "10:00", participants: [] as number[], agenda_template: "", requires_doc: true, linked_type: "" }

// ─── date helpers (local calendar, Sunday-first week) ──────────────────
function ymd(d: Date) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${dd}` }
function startOfWeek(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }

type Occ = any

export default function RoutinesPage() {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [occ, setOcc] = useState<Occ[]>([])
  const [routines, setRoutines] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [history, setHistory] = useState<Occ[]>([])
  const [histFilter, setHistFilter] = useState<number | "">("")
  const [view, setView] = useState<"week" | "routines" | "history">("week")

  // documentation panel
  const [docOcc, setDocOcc] = useState<Occ | null>(null)
  // routine form
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_ROUTINE })
  const [saving, setSaving] = useState(false)

  const today = ymd(new Date())
  const weekEnd = addDays(weekStart, 6)

  const load = useCallback(async () => {
    setError(false)
    try {
      const [o, r, h] = await Promise.all([
        fetch(`/api/routines/occurrences?from=${ymd(weekStart)}&to=${ymd(weekEnd)}`),
        fetch("/api/routines"),
        fetch(`/api/routines/occurrences?from=${ymd(addDays(startOfWeek(new Date()), -56))}&to=${ymd(addDays(new Date(), -1))}`),
      ])
      if (!o.ok || !r.ok) throw new Error()
      const od = await o.json(); const rd = await r.json(); const hd = h.ok ? await h.json() : { occurrences: [] }
      setOcc(od.occurrences || []); setCoords(od.coordinators || rd.coordinators || [])
      setRoutines(rd.routines || [])
      setHistory((hd.occurrences || []).slice().reverse())
    } catch { setError(true) } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])
  useEffect(() => { setLoading(true); load() }, [load])

  const coordName = (id: number) => coords.find(c => c.id === id)?.name || `#${id}`
  const participantsOf = (o: Occ): any[] => (o.participants?.length ? coords.filter(c => o.participants.includes(c.id)) : coords)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekStats = useMemo(() => {
    const s = { total: occ.length, done: 0, missed: 0, planned: 0 }
    occ.forEach(o => { if (o.status === "done") s.done++; else if (o.status === "missed") s.missed++; else if (o.status === "planned") s.planned++ })
    return s
  }, [occ])

  // ── routine form ──
  function openNew() { setEditId(null); setForm({ ...EMPTY_ROUTINE }); setShowForm(true) }
  function openEdit(r: any) {
    setEditId(r.id)
    setForm({ name: r.name, description: r.description || "", frequency: r.frequency, weekday: r.weekday ?? 0, day_of_month: r.day_of_month ?? 1, time: r.time || "", participants: r.participants || [], agenda_template: r.agenda_template || "", requires_doc: !!r.requires_doc, linked_type: r.linked_type || "" })
    setShowForm(true)
  }
  async function saveRoutine() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const body = { ...form, linked_type: form.linked_type || null, id: editId ?? undefined }
      const res = await fetch("/api/routines", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error()
      success(editId ? "השגרה עודכנה" : "השגרה נוצרה")
      setShowForm(false); await load()
    } catch { toastError("השמירה נכשלה") } finally { setSaving(false) }
  }
  async function toggleActive(r: any) {
    await fetch("/api/routines", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, active: !r.active }) })
    await load()
  }

  if (error) return <div className="p-6"><ErrorState retry={load} /></div>

  return (
    <div className="ui-page fade-up">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#193d33]">שגרות</h1>
          <div className="text-sm text-[#63756b] mt-1">הריטואלים הקבועים שלך עם הרכזים — מה מתוכנן, מה בוצע, ומה תועד</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#edf1e9] rounded-[10px] p-1">
            {([["week", "השבוע"], ["routines", "ניהול שגרות"], ["history", "היסטוריה"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={`px-3.5 py-1.5 text-sm font-semibold rounded-[8px] transition-colors ${view === k ? "bg-white text-[#193d33] shadow-sm" : "text-[#63756b] hover:text-[#193d33]"}`}>{l}</button>
            ))}
          </div>
          <Button onClick={openNew}>+ שגרה חדשה</Button>
        </div>
      </div>

      {loading ? <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} rows={3} />)}</div> : (
        <>
          {view === "week" && (
            <>
              {/* week nav + stats */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setWeekStart(w => addDays(w, -7))} className="w-9 h-9 rounded-[9px] border border-[#e1e8df] bg-white hover:bg-[#f7f9f5] text-[#193d33] font-bold">›</button>
                  <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="px-3 h-9 rounded-[9px] border border-[#e1e8df] bg-white hover:bg-[#f7f9f5] text-sm font-semibold text-[#193d33]">השבוע</button>
                  <button onClick={() => setWeekStart(w => addDays(w, 7))} className="w-9 h-9 rounded-[9px] border border-[#e1e8df] bg-white hover:bg-[#f7f9f5] text-[#193d33] font-bold">‹</button>
                  <div className="text-sm font-bold text-[#193d33] mr-2">{fd(ymd(weekStart))} – {fd(ymd(weekEnd))}</div>
                </div>
                <div className="flex gap-2 text-xs font-semibold">
                  <span className="px-2.5 py-1 rounded-full bg-[#eaf1e7] text-[#28634e]">בוצע {weekStats.done}</span>
                  <span className="px-2.5 py-1 rounded-full bg-[#faeeed] text-[#a74450]">חסר {weekStats.missed}</span>
                  <span className="px-2.5 py-1 rounded-full bg-[#edf1e9] text-[#63756b]">מתוכנן {weekStats.planned}</span>
                </div>
              </div>

              {/* 7-column week */}
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {days.map((d, i) => {
                  const key = ymd(d); const isToday = key === today; const isPast = key < today
                  const items = occ.filter(o => o.due_date === key)
                  return (
                    <div key={key} className={`rounded-[14px] border min-h-[140px] flex flex-col ${isToday ? "border-[#28634e] bg-[#edf4eb]" : "border-[#e1e8df] bg-white"} ${isPast && !isToday ? "opacity-90" : ""}`}>
                      <div className={`px-3 py-2 border-b flex items-center justify-between ${isToday ? "border-[#c8dac7]" : "border-[#edf1e9]"}`}>
                        <div className="text-xs font-bold text-[#193d33]">{DAYS[i]}</div>
                        <div className={`text-xs font-semibold ${isToday ? "text-[#28634e]" : "text-[#94A3B8]"}`}>{d.getDate()}.{d.getMonth() + 1}</div>
                      </div>
                      <div className="p-2 flex flex-col gap-2 flex-1">
                        {items.map(o => <OccCard key={o.id} o={o} onOpen={() => setDocOcc(o)} participants={participantsOf(o)} />)}
                        {!items.length && <div className="text-[11px] text-[#c6d2c7] text-center mt-4">—</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {view === "routines" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {routines.map(r => (
                <Card key={r.id} className={!r.active ? "opacity-60" : ""}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-bold text-[#193d33]">{r.name}</div>
                        <div className="text-xs text-[#63756b] mt-0.5">
                          {FREQ[r.frequency]}{r.frequency === "weekly" && ` · יום ${DAYS[r.weekday ?? 0]}`}{r.frequency === "monthly" && ` · ${r.day_of_month} בחודש`}{r.time && ` · ${r.time}`}
                          {r.linked_type && <span className="mr-2 px-1.5 py-0.5 rounded bg-[#EDE9FE] text-[#5B21B6] font-semibold">{LINKED[r.linked_type]}</span>}
                          {r.requires_doc && <span className="mr-1.5 px-1.5 py-0.5 rounded bg-[#faf1e3] text-[#946014] font-semibold">דורש תיעוד</span>}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>עריכה</Button>
                        <Button size="sm" variant={r.active ? "danger" : "success"} onClick={() => toggleActive(r)}>{r.active ? "השבת" : "הפעל"}</Button>
                      </div>
                    </div>
                    {r.description && <div className="text-sm text-[#63756b] mt-2">{r.description}</div>}
                    <div className="flex flex-wrap gap-3 text-xs text-[#63756b] mt-3">
                      <span>משתתפים: <b className="text-[#193d33]">{r.participants?.length ? r.participants.map((id: number) => coordName(id)).join(", ") : "כל הרכזים"}</b></span>
                      {r.next_due && <span>הבא: <b className="text-[#193d33]">{fd(String(r.next_due).slice(0, 10))}</b></span>}
                      <span>בוצע <b className="text-[#28634e]">{r.done_count}</b> · חסר <b className="text-[#a74450]">{r.missed_count}</b></span>
                    </div>
                  </div>
                </Card>
              ))}
              {!routines.length && <EmptyState icon="🔁" title="אין עדיין שגרות" hint="צור את השגרה הראשונה שלך" />}
            </div>
          )}

          {view === "history" && (
            <Card>
              <div className="p-3 border-b border-[#e1e8df] flex items-center gap-3">
                <div className="text-sm font-bold text-[#193d33]">8 השבועות האחרונים</div>
                <select value={histFilter} onChange={e => setHistFilter(e.target.value ? +e.target.value : "")} className="px-3 py-1.5 border border-[#c6d2c7] rounded-[9px] text-sm bg-white">
                  <option value="">כל השגרות</option>
                  {routines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="divide-y divide-[#edf1e9]">
                {history.filter(o => !histFilter || o.routine_id === histFilter).map(o => {
                  const st = STATUS[o.status] || STATUS.planned
                  return (
                    <div key={o.id} onClick={() => setDocOcc(o)} className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[#f7f9f5]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: st.dot }} />
                      <div className="w-24 text-xs text-[#63756b]">{fd(o.due_date)} · {DAYS_SHORT[new Date(o.due_date + "T00:00:00").getDay()]}</div>
                      <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-[#193d33]">{o.name}</div>{o.notes && <div className="text-xs text-[#63756b] truncate">{o.notes}</div>}</div>
                      {o.linked_type === "weekly_report" && o.report && <div className="text-xs text-[#63756b]">{o.report.submitted.length}/{o.report.submitted.length + o.report.missing.length} הגישו</div>}
                      {o.tasks_created?.length > 0 && <div className="text-xs text-[#63756b]">{o.tasks_created.length} משימות</div>}
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                    </div>
                  )
                })}
                {!history.length && <div className="p-8"><EmptyState icon="🗓️" title="אין עדיין היסטוריה" hint="מופעי שגרות שעברו יופיעו כאן" /></div>}
              </div>
            </Card>
          )}
        </>
      )}

      {/* documentation side panel */}
      {docOcc && (
        <DocPanel o={docOcc} coords={coords} participants={participantsOf(docOcc)} onClose={() => setDocOcc(null)}
          onSaved={async () => { setDocOcc(null); await load() }} router={router} />
      )}

      {/* routine form */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? "עריכת שגרה" : "שגרה חדשה"} width="600px"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>ביטול</Button><Button onClick={saveRoutine} disabled={saving || !form.name.trim()}>{saving ? "שומר..." : "שמור"}</Button></>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="text-xs font-semibold block mb-1">שם</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} placeholder="למשל: שיחת 1:1 חודשית" /></div>
          <div className="sm:col-span-2"><label className="text-xs font-semibold block mb-1">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={INPUT} /></div>
          <div><label className="text-xs font-semibold block mb-1">תדירות</label>
            <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className={INPUT}>
              {Object.entries(FREQ).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          {form.frequency === "weekly" && <div><label className="text-xs font-semibold block mb-1">יום בשבוע</label>
            <select value={form.weekday} onChange={e => setForm(f => ({ ...f, weekday: +e.target.value }))} className={INPUT}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select></div>}
          {form.frequency === "monthly" && <div><label className="text-xs font-semibold block mb-1">יום בחודש</label>
            <input type="number" min={1} max={31} value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: +e.target.value }))} className={INPUT} /></div>}
          {form.frequency === "daily" && <div className="text-xs text-[#63756b] self-end pb-2">ימים א׳–ה׳</div>}
          <div><label className="text-xs font-semibold block mb-1">שעה</label>
            <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className={INPUT} /></div>
          <div><label className="text-xs font-semibold block mb-1">מקושר ל־</label>
            <select value={form.linked_type} onChange={e => setForm(f => ({ ...f, linked_type: e.target.value }))} className={INPUT}>
              <option value="">ללא</option>
              <option value="meeting">פגישה (סיכום + משימות)</option>
              <option value="weekly_report">דיווח שבועי (סטטוס אוטומטי)</option>
            </select></div>
          <div className="sm:col-span-2"><label className="text-xs font-semibold block mb-1">משתתפים <span className="text-[#94A3B8] font-normal">(ריק = כל הרכזים)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {coords.map(c => {
                const on = form.participants.includes(c.id)
                return <button key={c.id} type="button" onClick={() => setForm(f => ({ ...f, participants: on ? f.participants.filter(x => x !== c.id) : [...f.participants, c.id] }))}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-[#28634e] text-white border-[#28634e]" : "bg-white text-[#63756b] border-[#c6d2c7] hover:border-[#28634e]"}`}>{c.name}</button>
              })}
            </div></div>
          <div className="sm:col-span-2"><label className="text-xs font-semibold block mb-1">תבנית סדר יום</label>
            <textarea value={form.agenda_template} onChange={e => setForm(f => ({ ...f, agenda_template: e.target.value }))} rows={4} className={INPUT} placeholder={"1. עדכונים\n2. לידים ויעדים\n3. אירועים קרובים"} /></div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.requires_doc} onChange={e => setForm(f => ({ ...f, requires_doc: e.target.checked }))} />
            דורש תיעוד (תזכורת למחרת אם לא תועד)
          </label>
        </div>
      </Modal>
    </div>
  )
}

const INPUT = "w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#28634e]"

// ─── occurrence card (week view) ───────────────────────────────────────
function OccCard({ o, onOpen, participants }: { o: Occ; onOpen: () => void; participants: any[] }) {
  const st = STATUS[o.status] || STATUS.planned
  const rep = o.report
  return (
    <div onClick={onOpen} className="rounded-[10px] border border-[#e1e8df] bg-white p-2.5 cursor-pointer hover:border-[#28634e] hover:shadow-sm transition-all" style={{ borderRightWidth: 3, borderRightColor: st.dot }}>
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="text-xs font-bold text-[#193d33] leading-tight truncate">{o.name}</div>
        {o.time && <div className="text-[10px] text-[#94A3B8] flex-shrink-0">{o.time}</div>}
      </div>
      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
      {rep && <div className="text-[10px] text-[#63756b] mt-1">{rep.submitted.length}/{rep.submitted.length + rep.missing.length} הגישו</div>}
      {!rep && (
        <div className="flex items-center mt-1.5 -space-x-1 space-x-reverse">
          {participants.slice(0, 4).map(c => <span key={c.id} title={c.name} className="w-5 h-5 rounded-full bg-[#eaf1e7] text-[#28634e] text-[9px] font-bold flex items-center justify-center border border-white">{c.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}</span>)}
          {participants.length > 4 && <span className="text-[10px] text-[#94A3B8] mr-1.5">+{participants.length - 4}</span>}
        </div>
      )}
      {o.status === "planned" && !rep && <div className="text-[10px] text-[#28634e] font-semibold mt-1.5">תעד ←</div>}
    </div>
  )
}

// ─── documentation panel ───────────────────────────────────────────────
function DocPanel({ o, coords, participants, onClose, onSaved, router }: { o: Occ; coords: any[]; participants: any[]; onClose: () => void; onSaved: () => Promise<void>; router: any }) {
  const { success, error: toastError } = useToast()
  const isReport = o.linked_type === "weekly_report"
  const isMeeting = o.linked_type === "meeting"
  const [status, setStatus] = useState<string>(o.status === "planned" && !isReport ? "done" : o.status)
  const [notes, setNotes] = useState<string>(o.notes || "")
  const [attendees, setAttendees] = useState<number[]>(o.attendees?.length ? o.attendees : participants.map(p => p.id))
  const [agenda, setAgenda] = useState<string>(o.agenda_template || "")
  const [createMeeting, setCreateMeeting] = useState<boolean>(isMeeting && !o.meeting_id)
  const [extracting, setExtracting] = useState(false)
  const [tasks, setTasks] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const st = STATUS[status] || STATUS.planned
  const dayName = DAYS[new Date(o.due_date + "T00:00:00").getDay()]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function extract() {
    if (!notes.trim()) return
    setExtracting(true)
    try {
      const names = coords.filter(c => attendees.includes(c.id)).map(c => c.name).join(", ")
      const res = await fetch("/api/extract-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: notes, coordinator_name: names || "הצוות", date: o.due_date }) })
      const d = await res.json()
      setTasks((d.tasks || []).map((t: any) => ({ ...t, coordinator_id: attendees.length === 1 ? attendees[0] : "", due_date: "", _skip: false })))
      if (!(d.tasks || []).length) toastError("לא נמצאו משימות ברורות בסיכום")
    } finally { setExtracting(false) }
  }
  function addManualTask() { setTasks(t => [...t, { title: "", type: "backoffice", details: "", coordinator_id: "", due_date: "", _skip: false }]) }

  async function save() {
    setSaving(true)
    try {
      const body: any = { id: o.id, status, notes, attendees }
      if (isMeeting && createMeeting) body.create_meeting = { agenda, summary: notes }
      const toCreate = tasks.filter(t => !t._skip && t.title?.trim()).map(t => ({ title: t.title, type: t.type, details: t.details, coordinator_id: t.coordinator_id || null, due_date: t.due_date || null }))
      if (toCreate.length) body.tasks = toCreate
      const res = await fetch("/api/routines/occurrences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error()
      success(toCreate.length ? `תועד · נוצרו ${toCreate.length} משימות` : "תועד")
      await onSaved()
    } catch { toastError("השמירה נכשלה") } finally { setSaving(false) }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-[#193d33]/40 z-[90]" />
      <div dir="rtl" className="fixed top-0 bottom-0 right-0 w-[520px] max-w-[94vw] bg-white z-[91] shadow-2xl flex flex-col" style={{ animation: "routine-slide .18s ease-out" }}>
        <div className="px-5 py-4 border-b border-[#e1e8df] flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-[#63756b]">{dayName} · {fd(o.due_date)}{o.time && ` · ${o.time}`}</div>
            <div className="text-lg font-extrabold text-[#193d33] mt-0.5">{o.name}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-[8px] bg-[#edf1e9] hover:bg-[#e1e8df] text-[#63756b] text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isReport ? (
            <div>
              <div className="text-xs font-bold text-[#63756b] mb-2">דיווח שבועי · שבוע שמתחיל {fd(o.report?.week_start)}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[10px] bg-[#eaf1e7] p-3">
                  <div className="text-xs font-bold text-[#28634e] mb-1.5">הגישו ({o.report?.submitted.length || 0})</div>
                  {(o.report?.submitted || []).map((c: any) => <div key={c.id} className="text-sm text-[#28634e]">✓ {c.name}</div>)}
                  {!o.report?.submitted.length && <div className="text-xs text-[#28634e]/70">עדיין אף אחד</div>}
                </div>
                <div className="rounded-[10px] bg-[#faeeed] p-3">
                  <div className="text-xs font-bold text-[#a74450] mb-1.5">חסרים ({o.report?.missing.length || 0})</div>
                  {(o.report?.missing || []).map((c: any) => <div key={c.id} className="text-sm text-[#a74450]">• {c.name}</div>)}
                  {!o.report?.missing.length && <div className="text-xs text-[#a74450]/70">כולם הגישו 🎉</div>}
                </div>
              </div>
              <div className="text-xs text-[#63756b] mt-2">הסטטוס נגזר אוטומטית מהדיווחים שהוגשו במערכת. <span onClick={() => router.push("/admin/reports?tab=reports")} className="text-[#28634e] font-semibold cursor-pointer">לדיווחים ←</span></div>
            </div>
          ) : (
            <div>
              <div className="text-xs font-bold text-[#63756b] mb-2">סטטוס</div>
              <div className="flex gap-1.5">
                {(["done", "postponed", "missed", "planned"] as const).map(s => {
                  const x = STATUS[s]; const on = status === s
                  return <button key={s} onClick={() => setStatus(s)} className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors" style={{ background: on ? x.bg : "#fff", color: on ? x.fg : "#63756b", borderColor: on ? x.dot : "#e1e8df" }}>{x.label}</button>
                })}
              </div>
            </div>
          )}

          {!isReport && (
            <div>
              <div className="text-xs font-bold text-[#63756b] mb-2">מי השתתף</div>
              <div className="flex flex-wrap gap-1.5">
                {participants.map(c => {
                  const on = attendees.includes(c.id)
                  return <button key={c.id} onClick={() => setAttendees(a => on ? a.filter(x => x !== c.id) : [...a, c.id])} className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-[#193d33] text-white border-[#193d33]" : "bg-white text-[#63756b] border-[#c6d2c7] line-through"}`}>{c.name}</button>
                })}
              </div>
            </div>
          )}

          {isMeeting && (
            <div>
              <div className="text-xs font-bold text-[#63756b] mb-2">סדר יום</div>
              <textarea value={agenda} onChange={e => setAgenda(e.target.value)} rows={4} className={INPUT} />
            </div>
          )}

          {!isReport && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-[#63756b]">{isMeeting ? "סיכום הפגישה" : "תיעוד"}</div>
                {isMeeting && <Button size="sm" variant="secondary" onClick={extract} disabled={extracting || !notes.trim()}>{extracting ? "מחלץ..." : "✨ חלץ משימות מהסיכום"}</Button>}
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6} className={INPUT} placeholder={isMeeting ? "מה סוכם, מי לוקח מה, חסמים..." : "מה נעשה"} />
              {isMeeting && !o.meeting_id && (
                <label className="flex items-center gap-2 text-xs text-[#63756b] mt-2 cursor-pointer">
                  <input type="checkbox" checked={createMeeting} onChange={e => setCreateMeeting(e.target.checked)} />
                  לרשום גם כסיכום פגישה בכרטיס של כל רכז שהשתתף
                </label>
              )}
              {o.meeting_id && <div className="text-xs text-[#28634e] mt-2">✓ נרשם כסיכום פגישה בכרטיסי הרכזים</div>}
            </div>
          )}

          {!isReport && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-[#63756b]">משימות להמשך {tasks.length > 0 && `(${tasks.filter(t => !t._skip && t.title).length})`}</div>
                <button onClick={addManualTask} className="text-xs text-[#28634e] font-semibold">+ משימה</button>
              </div>
              <div className="space-y-2">
                {tasks.map((t, i) => (
                  <div key={i} className={`rounded-[10px] border p-2.5 ${t._skip ? "opacity-40 border-[#e1e8df]" : "border-[#c8dac7] bg-[#F8FBFF]"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <input type="checkbox" checked={!t._skip} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, _skip: !e.target.checked } : x))} />
                      <input value={t.title} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="כותרת המשימה" className="flex-1 px-2 py-1 border border-[#c6d2c7] rounded-[7px] text-sm bg-white" />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <select value={t.type} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} className="px-2 py-1 border border-[#c6d2c7] rounded-[7px] text-xs bg-white">
                        {Object.entries(TASK_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <select value={t.coordinator_id} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, coordinator_id: e.target.value } : x))} className="px-2 py-1 border border-[#c6d2c7] rounded-[7px] text-xs bg-white">
                        <option value="">אני</option>
                        {coords.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="date" value={t.due_date} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} className="px-2 py-1 border border-[#c6d2c7] rounded-[7px] text-xs bg-white" />
                    </div>
                  </div>
                ))}
                {!tasks.length && <div className="text-xs text-[#94A3B8]">{isMeeting ? "כתוב סיכום ולחץ \"חלץ משימות\", או הוסף ידנית" : "אין משימות"}</div>}
              </div>
              {o.tasks_created?.length > 0 && <div className="text-xs text-[#63756b] mt-2">כבר נוצרו {o.tasks_created.length} משימות ממופע זה · <span onClick={() => router.push("/admin/tasks")} className="text-[#28634e] font-semibold cursor-pointer">למשימות ←</span></div>}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#e1e8df] flex items-center justify-between gap-2 bg-[#f7f9f5]">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>סגור</Button>
            {!isReport && <Button onClick={save} disabled={saving}>{saving ? "שומר..." : "שמור תיעוד"}</Button>}
          </div>
        </div>
      </div>
      <style>{`@keyframes routine-slide { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </>
  )
}
