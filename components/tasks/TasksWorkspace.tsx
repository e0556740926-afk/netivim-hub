"use client"
import "./tasks.css"
import "./premium.css"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/components/ui/Toast"
import { useUrlState } from "@/lib/use-url-state"
import { useQuickAction } from "@/lib/quick-action"
import ErrorState from "@/components/ui/ErrorState"
import { SkeletonCard } from "@/components/ui/Skeleton"
import { ds } from "@/lib/utils"
import {
  STATUS, STATUS_BY_KEY, TYPE_LABEL, PRIORITY_LABEL, PRIORITY_STYLE, RECURRENCE_LABEL, STUCK_DAYS,
  BUCKETS, bucketOf, isLate, relDay, isoDay, addDays, initials, avatarColor, type DueBucket, matchesDue, type DueFilter,
} from "./task-model"
import TaskPanel, { EMPTY_FORM, formFromTask, type Person, type TaskForm } from "./TaskPanel"
import AdminExtras from "./AdminExtras"

interface Props { mode: "admin" | "coord" }


/**
 * One tasks workspace for both sides of the system. The coordinator
 * sees only their own tasks (server-scoped), mobile-first; the manager
 * sees everything with assignee load, bulk actions, templates and
 * recurring series. Same rows, same board, same editor.
 */
export default function TasksWorkspace({ mode }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const { success, error: toastError, undoable } = useToast()
  const base = mode === "admin" ? "/admin" : "/coord"
  const today = isoDay(new Date())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tasks, setTasks] = useState<any[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])

  // Filters live in the URL: reload-safe, shareable ("show me Chaim's overdue").
  const [view, setView] = useUrlState("view", mode === "admin" ? "list" : "list")
  const [q, setQ] = useUrlState("q")
  const [fAssignee, setFAssignee] = useUrlState("who")
  const [fPriority, setFPriority] = useUrlState("priority")
  const [fType, setFType] = useUrlState("type")
  const [fStatus, setFStatus] = useUrlState("status")
  const [fDueRaw, setFDue] = useUrlState("due", "open")
  const fDue = fDueRaw as DueFilter

  // Editor / panels
  const [panel, setPanel] = useState<null | { kind: "task"; task: any | null } | { kind: "templates" } | { kind: "series" }>(null)
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [quick, setQuick] = useState("")
  const [quickSaving, setQuickSaving] = useState(false)
  const [leaving, setLeaving] = useState<Set<number>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expandedLate, setExpandedLate] = useState(false)
  const [menuFor, setMenuFor] = useState<number | null>(null)

  // Bulk (admin)
  const [bulk, setBulk] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulking, setBulking] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!user) return
    if (!silent) { setLoading(true); setError(false) }
    try {
      const taskUrl = mode === "admin" ? "/api/tasks" : `/api/tasks?name=${encodeURIComponent(user.name)}&full=1`
      const peopleUrl = mode === "admin" ? "/api/users/all" : "/api/users/assignees"
      const [tr, cr, er, pr] = await Promise.all([fetch(taskUrl), fetch("/api/contacts"), fetch("/api/events"), fetch(peopleUrl)])
      const { tasks } = await tr.json()
      const { contacts } = await cr.json()
      const { events } = await er.json()
      const p = await pr.json()
      let list: Person[]
      if (mode === "admin") {
        const coords = (p.coordinators || []).map((c: any) => ({ id: c.id, name: c.name, _isManager: false }))
        const admins = (p.admins || []).filter((a: any) => !coords.find((c: Person) => c.name === a.name)).map((a: any) => ({ id: a.id, name: a.name, _isManager: true }))
        list = [...coords, ...admins]
      } else {
        list = [
          ...(p.coordinators || []).map((c: any) => ({ id: c.id, name: c.name, _isManager: false })),
          ...(p.managers || []).map((m: any) => ({ id: m.id, name: m.name + " 👑", _isManager: true })),
        ]
      }
      setTasks(tasks || []); setContacts(contacts || []); setEvents(events || []); setPeople(list)
    } catch (e) { console.error(e); if (!silent) setError(true) }
    finally { if (!silent) setLoading(false) }
  }, [user, mode])
  useEffect(() => { load() }, [load])

  // Close the status menu on outside click / Escape.
  useEffect(() => {
    if (menuFor === null) return
    const off = () => setMenuFor(null)
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuFor(null) }
    window.addEventListener("click", off); window.addEventListener("keydown", key)
    return () => { window.removeEventListener("click", off); window.removeEventListener("keydown", key) }
  }, [menuFor])

  // "n" opens a new task when nothing is focused — a small shortcut for a screen used many times a day.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || (e.target as HTMLElement)?.isContentEditable) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || panel) return
      if (e.key === "n" || e.key === "N") { e.preventDefault(); openNew() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel])

  // ── derived ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const open = tasks.filter(t => t.status !== "done")
    return {
      open: open.length,
      future: open.filter(t => t.due_date && String(t.due_date).slice(0,10) > today).length,
      today: open.filter(t => t.due_date && String(t.due_date).slice(0, 10) === today).length,
      overdue: open.filter(t => isLate(t, today)).length,
      doneWeek: tasks.filter(t => matchesDue(t,"doneweek",today)).length,
    }
  }, [tasks, today])

  const loadByAssignee = useMemo(() => {
    if (mode !== "admin") return []
    return people.map(p => {
      const mine = tasks.filter(t => t.assignees?.includes(p.name))
      const open = mine.filter(t => t.status !== "done")
      return { name: p.name, isManager: !!p._isManager, open: open.length, overdue: open.filter(t => isLate(t, today)).length }
    }).filter(x => x.open > 0).sort((a, b) => b.overdue - a.overdue || b.open - a.open)
  }, [tasks, people, mode, today])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tasks.filter(t => {
      if (fAssignee && !t.assignees?.includes(fAssignee)) return false
      if (fPriority && (t.priority || "normal") !== fPriority) return false
      if (fType && t.type !== fType) return false
      if (fStatus && t.status !== fStatus) return false
      if (needle && !(`${t.title} ${t.details || ""} ${(t.assignees || []).join(" ")}`.toLowerCase().includes(needle))) return false
      return matchesDue(t,fDue,today,view)
    })
  }, [tasks, q, fAssignee, fPriority, fType, fStatus, fDue, today, view])

  const grouped = useMemo(() => {
    const g: Record<DueBucket, any[]> = { overdue: [], today: [], week: [], later: [], none: [] }
    for (const t of filtered) g[bucketOf(t, today)].push(t)
    const byPrio = (a: any, b: any) => prioRank(a) - prioRank(b) || String(a.due_date || "9").localeCompare(String(b.due_date || "9"))
    for (const k of Object.keys(g) as DueBucket[]) g[k].sort(byPrio)
    return g
  }, [filtered, today])

  const hasFilter = !!(q || fAssignee || fPriority || fType || fStatus || (fDue && fDue !== "open"))
  function clearFilters() { router.replace(`${base}/tasks${view === "board" ? "?view=board" : ""}`, { scroll: false }) }

  // ── actions ────────────────────────────────────────────────
  function openNew(preset: Partial<TaskForm> = {}) {
    setForm({ ...EMPTY_FORM, assignees: mode === "coord" && user ? [user.name] : [], ...preset })
    setPanel({ kind: "task", task: null })
  }
  function openTask(t: any) {
    setForm(formFromTask(t))
    setPanel({ kind: "task", task: t })
  }
  const closePanel = useCallback(() => setPanel(null), [])

  // "+ הוספה" → משימה חדשה opens this same editor (no separate form).
  useQuickAction(["task"], () => openNew(), !loading)
  // ?open=<id> from the home screen opens that task's details in place.
  useEffect(() => {
    if (loading) return
    const url = new URL(window.location.href)
    const id = Number(url.searchParams.get("open"))
    if (!id) return
    url.searchParams.delete("open")
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    const t = tasks.find(x => Number(x.id) === id)
    if (t) openTask(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const save = useCallback(async () => {
    if (!form.title.trim() || panel?.kind !== "task") return
    setSaving(true)
    try {
      const body = { ...form, title: form.title.trim(), event_id: form.event_id || null, contact_id: form.contact_id || null, assigned_by: user?.name }
      const editing = panel.task
      const r = await fetch("/api/tasks", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...body, id: editing.id } : body),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); toastError(d.error || "השמירה נכשלה"); return }
      success(editing ? "המשימה עודכנה" : "המשימה נוצרה")
      setPanel(null); load(true)
    } finally { setSaving(false) }
  }, [form, panel, user, load, success, toastError])

  async function quickAdd() {
    const title = quick.trim()
    if (!title || !user) return
    setQuickSaving(true)
    try {
      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        title, type: "call", assignees: [user.name], due_date: today, status: "todo", priority: "normal", assigned_by: user.name, notify: false,
      }) })
      setQuick(""); load(true)
    } finally { setQuickSaving(false) }
  }

  async function setStatus(t: any, status: string) {
    if (t.status === status) return
    setMenuFor(null)
    const prev = t.status
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, status, status_changed_at: new Date().toISOString() } : x))
    const r = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, status, status_only: true }) })
    if (!r.ok) { setTasks(ts => ts.map(x => x.id === t.id ? { ...x, status: prev } : x)); toastError("העדכון נכשל"); return }
    if (status === "done" && fDue !== "" && fDue !== "done") {
      // Let the row leave visibly, then offer an undo — a finished task vanishing from "open" should feel earned, not lost.
      setLeaving(s => new Set(s).add(t.id))
      setTimeout(() => setLeaving(s => { const n = new Set(s); n.delete(t.id); return n }), 420)
      undoable(`"${t.title}" הושלמה`, () => setStatus({ ...t, status: "done" }, prev))
    }
  }

  async function snooze(t: any, days: number) {
    const due = addDays(today, days)
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, due_date: due } : x))
    await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, due_date: due, due_date_only: true }) })
    setMenuFor(null)
  }

  async function remove(t: any) {
    if (!confirm(`למחוק את "${t.title}"?`)) return
    await fetch("/api/tasks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id }) })
    setTasks(ts => ts.filter(x => x.id !== t.id)); setPanel(null); success("המשימה נמחקה")
  }

  // Bulk
  function toggleSelect(id: number) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function bulkAct(payload: any, msg: string) {
    if (!selected.size) return
    setBulking(true)
    await fetch("/api/tasks/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selected], ...payload }) })
    setBulking(false); success(msg.replace("{n}", String(selected.size))); setSelected(new Set()); load(true)
  }

  // Board drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )
  const [dragging, setDragging] = useState<any>(null)
  function onDragStart(e: DragStartEvent) { setDragging(tasks.find(t => t.id === e.active.id) || null) }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const col = e.over?.id as string | undefined
    const t = tasks.find(x => x.id === e.active.id)
    if (col && t && t.status !== col) setStatus(t, col)
  }

  // ── render ─────────────────────────────────────────────────
  if (error) return <div className="p-6"><ErrorState retry={() => load()} /></div>
  if (loading) return <div className={`tasks-ws ${mode === "admin" ? "p-4 md:p-6 lg:p-8" : "p-4"} space-y-3`}>{[1, 2, 3].map(i => <SkeletonCard key={i} rows={3} />)}</div>

  const isAdmin = mode === "admin"
  const wrap = isAdmin ? "p-4 md:p-6 lg:p-8" : "p-4 pb-24 max-w-2xl mx-auto"

  return (
    <div className={`tasks-ws fade-up ${wrap}`}>
      <header className="tw-heading">
        <div><div className="tw-eyebrow">סביבת העבודה / ניהול משימות</div><h1>{isAdmin ? "משימות" : "המשימות שלי"}</h1><p>מתכננים יחד. מתקדמים בכל יום.</p></div>
        <div className="tw-heading-actions">
          {isAdmin && <details className="tw-tools" onClick={e=>{ if ((e.target as HTMLElement).tagName === "BUTTON") (e.currentTarget as HTMLDetailsElement).open = false }}><summary aria-label="כלי ניהול משימות">כלי ניהול <span>⌄</span></summary><div>
            <button onClick={()=>setPanel({kind:"templates"})}>תבניות משימות</button>
            <button onClick={()=>setPanel({kind:"series"})}>סדרות חוזרות</button>
            <button onClick={()=>{setBulk(b=>!b);setSelected(new Set())}}>{bulk?"סיום בחירה מרובה":"בחירה ופעולות מרובות"}</button>
          </div></details>}
          <button className="tw-create" onClick={()=>openNew()}><span aria-hidden="true">＋</span> משימה חדשה</button>
        </div>
      </header>
      <div className="tw-overview" aria-label="תמונת מצב משימות">{([
        ["today","להיום",stats.today,"בדיוק מה שתוכנן להיום","◷"],
        ["overdue","באיחור",stats.overdue,"משימות שתאריך היעד שלהן עבר","!"],
        ["future","בהמשך",stats.future,"משימות עם תאריך עתידי","↗"],
        ["open","כל הפתוחות",stats.open,"מבט על כל העבודה שבדרך","☷"],
      ] as [DueFilter,string,number,string,string][]).map(([key,label,count,hint,icon])=><button key={key} className={"tw-stat tw-stat-"+key} aria-pressed={fDue===key} onClick={()=>setFDue(key)}><span className="tw-stat-label">{label}<span className="tw-stat-icon" aria-hidden="true">{icon}</span></span><strong>{count}</strong><small>{hint}</small></button>)}</div>
      <div className="tw-workbar"><div className="tw-workbar-title"><h2>מרחב המשימות</h2><span>{filtered.length} תוצאות</span></div><div className="tw-workbar-controls"><button className="tw-done-filter" aria-pressed={fDue==="doneweek"} onClick={()=>setFDue(fDue==="doneweek"?"open":"doneweek")}>✓ {stats.doneWeek} הושלמו ב־7 הימים האחרונים</button><Segmented value={view} onChange={setView} options={[["list","רשימה"],["board","לוח"]]}/></div></div>

      {/* Per-person load (admin) */}
      {isAdmin && loadByAssignee.length > 0 && (
        <details className="tw-team"><summary>עומס משימות בצוות <span>{loadByAssignee.length} עובדים עם משימות פתוחות</span></summary><div className="tw-team-members">
          {loadByAssignee.map(a => {
            const on = fAssignee === a.name; const col = avatarColor(a.name)
            return (
              <button key={a.name} onClick={() => setFAssignee(on ? "" : a.name)}
                className={`press flex-shrink-0 inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full border text-xs ${on ? "bg-[#0D2744] border-[#0D2744] text-white" : "bg-white border-[#E2E8F0] text-[#334155] hover:border-[#94A3B8]"}`}>
                <span className="w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: on ? "rgba(255,255,255,.18)" : col.bg, color: on ? "#fff" : col.fg }}>{initials(a.name)}</span>
                <span className="font-semibold">{a.name.split(" ")[0]}</span>
                <span className={on ? "opacity-80" : "text-[#64748B]"}>{a.open}</span>
                {a.overdue > 0 && <span className={`font-bold ${on ? "text-[#FCA5A5]" : "text-[#960010]"}`}>· {a.overdue} באיחור</span>}
              </button>
            )
          })}
        </div></details>
      )}

      {/* Filter bar */}
      <div className="tw-filterbar">
        <div className={`relative flex-1 ${isAdmin ? "min-w-[160px]" : "min-w-[150px] flex-shrink-0"}`}>
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="6" cy="6" r="4.2" /><path d="M9.3 9.3L12.5 12.5" strokeLinecap="round" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש במשימות…" className="w-full pr-9 pl-3 py-2 border border-[#E2E8F0] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#00488D] transition-colors" />
        </div>
        <button className="tw-filter-toggle" onClick={()=>setFiltersOpen(v=>!v)} aria-expanded={filtersOpen} aria-controls="task-advanced-filters">מסננים {hasFilter?"●":""} <span aria-hidden="true">☷</span></button>
        <div id="task-advanced-filters" className={"tw-advanced-filters "+(filtersOpen?"is-open":"")}>
        {isAdmin && (
          <Select value={fAssignee} onChange={setFAssignee} placeholder="כל המשויכים">
            <optgroup label="רכזים">{people.filter(p => !p._isManager).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</optgroup>
            <optgroup label="מנהלים">{people.filter(p => p._isManager).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</optgroup>
          </Select>
        )}
        <Select value={fPriority} onChange={setFPriority} placeholder="כל הדחיפויות">{Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Select value={fType} onChange={setFType} placeholder="כל הסוגים">{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        {view === "list" && <Select value={fStatus} onChange={setFStatus} placeholder="כל הסטטוסים">{STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>}
        <Select value={fDue} onChange={v => setFDue(v)} placeholder="הכל">
          <option value="open">פתוחות</option><option value="today">היום בלבד</option><option value="future">בעתיד</option><option value="doneweek">הושלמו ב־7 ימים</option><option value="week">7 ימים ואיחורים</option>
          <option value="overdue">באיחור</option><option value="none">ללא תאריך</option><option value="done">הושלמו</option>
        </Select>
        {hasFilter && <button onClick={clearFilters} className="press text-xs font-semibold text-[#00488D] px-2 py-1 rounded-[7px] hover:bg-[#EEF4FB]">נקה</button>}
        </div>
      </div>
      {hasFilter && <div className="tw-filter-summary" role="status">{filtered.length} משימות בהתאם לסינון{fAssignee && <span> · {fAssignee}</span>}{fPriority && <span> · {PRIORITY_LABEL[fPriority]}</span>}{fType && <span> · {TYPE_LABEL[fType]}</span>}{fStatus && <span> · {STATUS_BY_KEY[fStatus]?.label}</span>}<button onClick={clearFilters}>איפוס סינון</button></div>}

      {/* Quick add */}
      <div className="tw-quick-add flex items-center gap-2 bg-white border border-dashed border-[#CBD5E1] rounded-[12px] px-3 py-2 mb-3 focus-within:border-[#00488D] transition-colors">
        <span className="w-[22px] h-[22px] rounded-full border-[1.5px] border-dashed border-[#CBD5E1] flex-shrink-0" aria-hidden />
        <input value={quick} onChange={e => setQuick(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); quickAdd() } }}
          aria-label="משימה מהירה להיום" placeholder="מה עוד צריך לעשות היום?" disabled={quickSaving}
          className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-[#94A3B8]" />
        <button disabled={!quick.trim() || quickSaving} className="tw-quick-submit" onClick={quickAdd}>{quickSaving?"יוצר…":"הוספה"}</button>
        {quick.trim() && <button onClick={() => { openNew({ title: quick.trim(), due_date: today }); setQuick("") }} className="press text-[11px] font-semibold text-[#00488D] px-2 py-1 rounded-[7px] hover:bg-[#EEF4FB]">פרטים נוספים</button>}
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-[14px]">
          <Empty hasFilter={hasFilter} due={fDue} onClear={clearFilters} onNew={() => openNew()} />
        </div>
      ) : view === "board" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className={`tw-board grid gap-3 ${isAdmin ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1"}`}>
            {STATUS.map(s => {
              const col = filtered.filter(t => t.status === s.key)
              return (
                <Column key={s.key} status={s} count={col.length}>
                  {col.map((t, i) => (
                    <Draggable key={t.id} id={t.id} disabled={bulk}>
                      <TaskCard t={t} i={i} today={today} bulk={bulk} selected={selected.has(t.id)} onSelect={() => toggleSelect(t.id)} onOpen={() => openTask(t)} onDone={() => setStatus(t, t.status === "done" ? "todo" : "done")} contacts={contacts} events={events} base={base} router={router} />
                    </Draggable>
                  ))}
                  {!col.length && <div className="text-xs text-[#B6C2D1] text-center py-6">—</div>}
                </Column>
              )
            })}
          </div>
          <DragOverlay>{dragging && <div className="bg-white border border-[#00488D] rounded-[12px] px-3 py-2.5 shadow-xl w-64 text-sm font-semibold text-[#0D2744]">{dragging.title}</div>}</DragOverlay>
        </DndContext>
      ) : (
        <div className="space-y-4">
          {[...BUCKETS].sort((a,b)=> (a.key==="today"?-1:b.key==="today"?1:0)).map(b => {
            const rows = grouped[b.key]
            if (!rows.length) return null
            return (
              <section className={"tw-task-group tw-group-"+b.key} key={b.key}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.tone }} />
                  <span className="text-[12px] font-bold" style={{ color: b.tone }}>{b.label}</span>
                  <span className="text-[11px] text-[#94A3B8]">{rows.length}</span>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-[14px] overflow-visible divide-y divide-[#F1F5F9]">
                  {(b.key==="overdue" && !expandedLate && fDue!=="overdue" ? rows.slice(0,3) : rows).map((t, i) => (
                    <TaskRow key={t.id} t={t} i={i} today={today} bulk={bulk} selected={selected.has(t.id)} leaving={leaving.has(t.id)}
                      menuOpen={menuFor === t.id} onMenu={() => setMenuFor(m => m === t.id ? null : t.id)}
                      onSelect={() => toggleSelect(t.id)} onOpen={() => openTask(t)}
                      onDone={() => setStatus(t, t.status === "done" ? "todo" : "done")} onStatus={(s: string) => setStatus(t, s)} onSnooze={(d: number) => snooze(t, d)}
                      contacts={contacts} events={events} base={base} router={router} compact={!isAdmin} />
                  ))}
                </div>
                {b.key==="overdue" && rows.length>3 && fDue!=="overdue" && <button className="tw-show-all" aria-expanded={expandedLate} onClick={()=>setExpandedLate(v=>!v)}>{expandedLate?"צמצום הרשימה":`הצגת כל ${rows.length} המשימות באיחור`} <span aria-hidden="true">⌄</span></button>}
              </section>
            )
          })}
        </div>
      )}

      {/* Bulk bar */}
      {isAdmin && bulk && selected.size > 0 && (
        <div className="tw-bulkbar fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-6 z-40 bg-[#0D2744] text-white rounded-[14px] shadow-2xl p-2.5 flex items-center gap-2 flex-wrap fade-up">
          <span className="text-sm font-bold px-1.5">{selected.size} נבחרו</span>
          <select onChange={e => { if (e.target.value) bulkAct({ action: "status", status: e.target.value }, "סטטוס עודכן ל-{n} משימות"); e.target.value = "" }} disabled={bulking} className="px-2 py-1.5 rounded-[7px] text-xs text-[#0D2744]">
            <option value="">סטטוס…</option>{STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select onChange={e => { if (e.target.value) bulkAct({ action: "priority", priority: e.target.value }, "דחיפות עודכנה ל-{n} משימות"); e.target.value = "" }} disabled={bulking} className="px-2 py-1.5 rounded-[7px] text-xs text-[#0D2744]">
            <option value="">דחיפות…</option>{Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select onChange={e => { if (e.target.value) bulkAct({ action: "add_assignee", name: e.target.value }, "משויך נוסף ל-{n} משימות"); e.target.value = "" }} disabled={bulking} className="px-2 py-1.5 rounded-[7px] text-xs text-[#0D2744]">
            <option value="">הוסף משויך…</option>{people.map(p => <option key={`${p.id}-${p._isManager ? "m" : "c"}`} value={p.name}>{p.name}</option>)}
          </select>
          <button onClick={() => { if (confirm(`למחוק ${selected.size} משימות?`)) bulkAct({ action: "delete" }, "{n} משימות נמחקו") }} disabled={bulking} className="press px-3 py-1.5 rounded-[7px] text-xs font-bold bg-[#960010]">מחק</button>
          <button onClick={() => setSelected(new Set())} className="press px-3 py-1.5 rounded-[7px] text-xs bg-white/10">נקה</button>
        </div>
      )}

      {/* Panels */}
      {panel?.kind === "task" && (
        <TaskPanel mode={mode} task={panel.task} form={form} setForm={setForm} people={people} contacts={contacts} events={events} today={today}
          saving={saving} onSave={save} onDelete={panel.task ? () => remove(panel.task) : undefined} onClose={closePanel} showNotifyLog={isAdmin} base={base} />
      )}
      {isAdmin && (panel?.kind === "templates" || panel?.kind === "series") && (
        <AdminExtras tab={panel.kind} people={people} today={today} onClose={closePanel} onChanged={() => load(true)} />
      )}
    </div>
  )
}

// ── pieces ───────────────────────────────────────────────────

function prioRank(t: any) { return t.priority === "urgent" ? 0 : t.priority === "low" ? 2 : 1 }

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex bg-[#F1F5F9] p-0.5 rounded-[9px]" role="tablist">
      {options.map(([v, l]) => {
        const on = value === v
        return <button key={v} role="tab" aria-selected={on} onClick={() => onChange(v)} className="press px-3 py-1.5 rounded-[7px] text-sm font-semibold" style={{ background: on ? "#fff" : "transparent", color: on ? "#0D2744" : "#64748B", boxShadow: on ? "0 1px 2px rgba(13,39,68,.12)" : "none" }}>{l}</button>
      })}
    </div>
  )
}

function Select({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder: string; children: React.ReactNode }) {
  return (
    <select aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)}
      className={`flex-shrink-0 px-3 py-2 border rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#00488D] transition-colors ${value ? "border-[#00488D] text-[#0D2744] font-semibold" : "border-[#E2E8F0] text-[#475569]"}`}>
      <option value="">{placeholder}</option>{children}
    </select>
  )
}

function Empty({ hasFilter, due, onClear, onNew }: { hasFilter: boolean; due: DueFilter; onClear: () => void; onNew: () => void }) {
  const msg = due === "overdue" ? ["אין משימות באיחור", "כל מה שהיה אמור להיסגר — נסגר."]
    : due === "today" ? ["אין משימות להיום", "אפשר להתקדם על מה שמתוכנן להמשך השבוע."]
    : due === "done" ? ["עדיין לא הושלמו משימות", "כל משימה שתסומן כבוצע תופיע כאן."]
    : hasFilter ? ["אין משימות שמתאימות לסינון", "נסה להרחיב את הסינון או לנקות אותו."]
    : ["אין משימות פתוחות", "הכל מטופל. כשתצטרך — N פותח משימה חדשה."]
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-[#EEF8F0] text-[#166534] flex items-center justify-center mb-3">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4L16 6" /></svg>
      </div>
      <div className="text-[#0D2744] font-bold text-base">{msg[0]}</div>
      <div className="text-sm text-[#64748B] mt-1 mb-4 max-w-xs">{msg[1]}</div>
      {hasFilter
        ? <button onClick={onClear} className="press px-4 py-2 rounded-[9px] border border-[#E2E8F0] text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC]">נקה סינון</button>
        : <button onClick={onNew} className="press px-4 py-2 rounded-[9px] bg-[#0D2744] text-white text-sm font-bold">משימה חדשה</button>}
    </div>
  )
}

function Chips({ t, contacts, events, base, router }: { t: any; contacts: any[]; events: any[]; base: string; router: any }) {
  const contact = t.contact_id ? contacts.find(c => c.id === t.contact_id) : null
  const event = t.event_id ? events.find(e => e.id === t.event_id) : null
  const prio = t.priority && t.priority !== "normal" ? PRIORITY_STYLE[t.priority] : null
  const stuck = (t.status === "inprogress" || t.status === "waiting") && ds(t.status_changed_at || t.created_at) >= STUCK_DAYS
  return (
    <div className="flex items-center gap-1 flex-wrap min-w-0">
      {prio && <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full" style={{ background: prio.bg, color: prio.fg }}>{PRIORITY_LABEL[t.priority]}</span>}
      <span className="text-[10px] text-[#64748B] px-1.5 py-[1px] rounded-full bg-[#F1F5F9]">{TYPE_LABEL[t.type] || t.type}</span>
      {t.recurrence && <span className="text-[10px] text-[#64748B] px-1.5 py-[1px] rounded-full bg-[#F1F5F9]" title={RECURRENCE_LABEL[t.recurrence]}>↻ {RECURRENCE_LABEL[t.recurrence]}</span>}
      {stuck && <span className="text-[10px] font-bold text-[#92400E] px-1.5 py-[1px] rounded-full bg-[#FFF8E8]">תקוע {ds(t.status_changed_at || t.created_at)} ימים</span>}
      {contact && <button onClick={e => { e.stopPropagation(); router.push(`${base}/contacts?open=${contact.id}`) }} className="text-[10px] font-semibold text-[#00488D] px-1.5 py-[1px] rounded-full bg-[#EEF4FB] hover:bg-[#DBEAFE] truncate max-w-[140px]">{contact.name}</button>}
      {event && <button onClick={e => { e.stopPropagation(); router.push(`${base}/events`) }} className="text-[10px] font-semibold text-[#7C3AED] px-1.5 py-[1px] rounded-full bg-[#F3EEFF] hover:bg-[#EDE9FE] truncate max-w-[140px]">{event.name}</button>}
    </div>
  )
}

function Avatars({ names, max = 3 }: { names: string[]; max?: number }) {
  if (!names?.length) return null
  const shown = names.slice(0, max)
  return (
    <div className="tw-avatars flex items-center -space-x-1.5 space-x-reverse flex-shrink-0" aria-label={"משויכים: "+names.join(", ")} title={names.join(", ")}>
      {shown.map(n => { const c = avatarColor(n); return <span key={n} className="w-6 h-6 rounded-full border-2 border-white text-[10px] font-bold flex items-center justify-center" style={{ background: c.bg, color: c.fg }}>{initials(n)}</span> })}
      {names.length > max && <span className="w-6 h-6 rounded-full border-2 border-white bg-[#F1F5F9] text-[#64748B] text-[10px] font-bold flex items-center justify-center">+{names.length - max}</span>}
    </div>
  )
}

function CheckButton({ on, onClick, size = 44 }: { on: boolean; onClick: () => void; size?: number }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onClick() }} className={`check ${on ? "on" : ""}`} style={{ width: 44, height: 44 }} aria-label={on ? "החזר לפתוח" : "סמן כבוצע"}>
      <svg width={12} height={12} viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2.2 2.2L8 3" /></svg>
    </button>
  )
}

function TaskRow({ t, i, today, bulk, selected, leaving, menuOpen, onMenu, onSelect, onOpen, onDone, onStatus, onSnooze, contacts, events, base, router, compact }: any) {
  const late = isLate(t, today)
  const done = t.status === "done"
  const st = STATUS_BY_KEY[t.status] || STATUS_BY_KEY.todo
  return (
    <div onClick={() => bulk ? onSelect() : onOpen()}
      className={`tw-task-row row-in group relative flex items-center gap-3 px-3 sm:px-4 py-2.5 cursor-pointer hover:bg-[#FAFBFD] transition-colors ${selected ? "bg-[#EEF4FB]" : ""} ${leaving ? "leaving" : ""}`}
      style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}>
      {bulk
        ? <input type="checkbox" checked={selected} onChange={onSelect} onClick={e => e.stopPropagation()} className="w-4 h-4 accent-[#0D2744] flex-shrink-0" />
        : <CheckButton on={done} onClick={onDone} size={compact ? 26 : 22} />}
      <div className="flex-1 min-w-0">
        <button onClick={e=>{e.stopPropagation();bulk?onSelect():onOpen()}} className={`tw-title-button title ${done?"done":""}`}>{t.title}</button>
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          <Chips t={t} contacts={contacts} events={events} base={base} router={router} />
        </div>
      </div>
      {!compact && <Avatars names={t.assignees || []} />}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0 w-[72px]">
        {t.due_date
          ? <span className={`text-[12px] font-bold ${late ? "text-[#960010]" : done ? "text-[#94A3B8]" : "text-[#334155]"}`}>{relDay(t.due_date, today)}</span>
          : <span className="text-[11px] text-[#B6C2D1]">ללא תאריך</span>}
        <span className="text-[10px] font-semibold" style={{ color: st.fg }}>{st.label}</span>
      </div>
      {!bulk && (
        <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onMenu} aria-label="פעולות" aria-expanded={menuOpen} className={`tw-row-menu press w-8 h-8 rounded-[8px] flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] ${menuOpen ? "bg-[#F1F5F9]" : "sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"} transition-opacity`}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="2.5" cy="7" r="1.4" /><circle cx="7" cy="7" r="1.4" /><circle cx="11.5" cy="7" r="1.4" /></svg>
          </button>
          {menuOpen && (
            <div className="pop absolute left-0 top-9 z-30 w-44 bg-white border border-[#E2E8F0] rounded-[12px] shadow-[0_8px_24px_-6px_rgba(13,39,68,.25)] p-1" role="menu">
              <div className="text-[10px] font-bold text-[#94A3B8] px-2 pt-1 pb-0.5">סטטוס</div>
              {STATUS.map(s => (
                <button key={s.key} role="menuitem" onClick={() => onStatus(s.key)} className={`w-full text-right flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-sm hover:bg-[#F4F7FB] ${t.status === s.key ? "font-bold" : ""}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />{s.label}
                </button>
              ))}
              {!done && <>
                <div className="h-px bg-[#EEF2F6] my-1" />
                <div className="text-[10px] font-bold text-[#94A3B8] px-2 pb-0.5">דחייה</div>
                <button role="menuitem" onClick={() => onSnooze(1)} className="w-full text-right px-2 py-1.5 rounded-[8px] text-sm hover:bg-[#F4F7FB]">למחר</button>
                <button role="menuitem" onClick={() => onSnooze(7)} className="w-full text-right px-2 py-1.5 rounded-[8px] text-sm hover:bg-[#F4F7FB]">לשבוע הבא</button>
              </>}
              <div className="h-px bg-[#EEF2F6] my-1" />
              <button role="menuitem" onClick={onOpen} className="w-full text-right px-2 py-1.5 rounded-[8px] text-sm hover:bg-[#F4F7FB]">פתח / ערוך</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskCard({ t, i, today, bulk, selected, onSelect, onOpen, onDone, contacts, events, base, router }: any) {
  const late = isLate(t, today)
  const done = t.status === "done"
  return (
    <div onClick={() => bulk ? onSelect() : onOpen()}
      className={`tw-task-card row-in bg-white border rounded-[12px] px-3 py-2.5 cursor-pointer transition-[box-shadow,border-color] duration-150 hover:shadow-[0_4px_14px_-6px_rgba(13,39,68,.25)] ${selected ? "border-[#0D2744] bg-[#EEF4FB]" : t.priority === "urgent" && !done ? "border-[#F5C2C7]" : "border-[#E2E8F0] hover:border-[#CBD5E1]"}`}
      style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}>
      <div className="flex items-start gap-2">
        {bulk ? <input type="checkbox" checked={selected} onChange={onSelect} onClick={e => e.stopPropagation()} className="w-4 h-4 mt-0.5 accent-[#0D2744]" /> : <CheckButton on={done} onClick={onDone} size={20} />}
        <div className="flex-1 min-w-0">
          <button onClick={e=>{e.stopPropagation();bulk?onSelect():onOpen()}} className={`tw-title-button title ${done?"done":""}`}>{t.title}</button>
          <div className="mt-1.5"><Chips t={t} contacts={contacts} events={events} base={base} router={router} /></div>
          <div className="flex items-center justify-between mt-2">
            <Avatars names={t.assignees || []} max={2} />
            {t.due_date && <span className={`text-[11px] font-bold ${late ? "text-[#960010]" : "text-[#64748B]"}`}>{relDay(t.due_date, today)}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Column({ status, count, children }: { status: typeof STATUS[number]; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.key })
  return (
    <div ref={setNodeRef} className="col rounded-[14px] p-2.5 min-h-[220px] border" style={{ background: isOver ? "#EEF4FB" : status.bg, borderColor: isOver ? "#00488D" : "transparent" }}>
      <div className="flex items-center gap-2 px-1 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: status.dot }} />
        <span className="text-[12px] font-bold" style={{ color: status.fg }}>{status.label}</span>
        <span className="text-[11px] text-[#64748B] mr-auto">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Draggable({ id, disabled, children }: { id: number; disabled?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.35 : 1 } : undefined
  return <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={disabled ? "" : "touch-manipulation"}>{children}</div>
}

