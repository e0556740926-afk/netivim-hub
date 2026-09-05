"use client"
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useToast } from "@/components/ui/Toast"
import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"
import { fd, ds, tod } from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Button from "@/components/ui/Button"

const COLS = [
  { key:"todo", label:"לביצוע", bg:"#F8FAFC", border:"#E2E8F0", fg:"#374151" },
  { key:"inprogress", label:"בתהליך", bg:"#F0F7FF", border:"#BFDBFE", fg:"#1E40AF" },
  { key:"waiting", label:"ממתין לתשובה", bg:"#FFFBEB", border:"#FDE68A", fg:"#B45309" },
  { key:"done", label:"בוצע", bg:"#F0FFF4", border:"#BBF7D0", fg:"#166534" },
]
const TYPE_LABEL: Record<string,string> = { call:"שיחה", meeting:"פגישה", materials:"חומרים", backoffice:"בק-אופיס" }
const PRIORITY_LABEL: Record<string,string> = { urgent:"דחוף", normal:"רגיל", low:"נמוך" }
const PRIORITY_COLOR: Record<string,{bg:string,fg:string}> = {
  urgent: { bg:"#FEE2E2", fg:"#991B1B" },
  normal: { bg:"#F3F4F6", fg:"#374151" },
  low:    { bg:"#F0F4F8", fg:"#64748B" },
}
const STUCK_DAYS = 3 // inprogress/waiting sitting this long without a status change gets flagged

export default function TasksPage() {
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<any>(null)
  const [filterAssignee, setFilterAssignee] = useState("")
  const [filterPriority, setFilterPriority] = useState("")
  const [form, setForm] = useState({ title:"", type:"call", assignees:[] as string[], due_date:"", status:"todo", event_id:"", contact_id:"", details:"", recurrence:"", priority:"normal" })
  const [saving, setSaving] = useState(false)
  const today = tod()

  // Bulk selection
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulking, setBulking] = useState(false)

  // Templates
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [newTplName, setNewTplName] = useState("")
  const [newTplItems, setNewTplItems] = useState<{title:string,type:string,priority:string,offset_days:number}[]>([{title:"",type:"call",priority:"normal",offset_days:0}])
  const [applyTplId, setApplyTplId] = useState<number|null>(null)
  const [applyAssignees, setApplyAssignees] = useState<string[]>([])
  const [applyDate, setApplyDate] = useState(today)

  // Recurring series
  const [showSeries, setShowSeries] = useState(false)
  const [series, setSeries] = useState<any[]>([])

  async function load() {
    setLoading(true); setError(false)
    try {
      const [tr, cr, er, ua] = await Promise.all([
        fetch("/api/tasks"), fetch("/api/contacts"), fetch("/api/events"), fetch("/api/users/all")
      ])
      const { tasks } = await tr.json()
      const { contacts } = await cr.json()
      const { events } = await er.json()
      const { coordinators, admins } = await ua.json()
      const allPeople = [
        ...(coordinators||[]).map((c:any) => ({...c, _isManager: false})),
        ...(admins||[]).filter((a:any) => !(coordinators||[]).find((c:any) => c.name===a.name))
          .map((a:any) => ({...a, _isManager: true}))
      ]
      setTasks(tasks||[]); setContacts(contacts||[]); setEvents(events||[]); setCoords(allPeople)
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => { load().finally(()=>setLoading(false)) }, [])

  async function loadTemplates() {
    const r = await fetch("/api/task-templates")
    const { templates } = await r.json()
    setTemplates(templates||[])
  }
  async function loadSeries() {
    const r = await fetch("/api/tasks/series")
    const { series } = await r.json()
    setSeries(series||[])
  }

  function startEdit(t: any) {
    setEditTask(t)
    setForm({ title:t.title, type:t.type, assignees:t.assignees||[], due_date:t.due_date?.slice(0,10)||"", status:t.status, event_id:t.event_id||"", contact_id:t.contact_id||"", details:t.details||"", recurrence:t.recurrence||"", priority:t.priority||"normal" })
    setShowForm(true)
  }

  function startAdd() {
    setEditTask(null)
    setForm({ title:"", type:"call", assignees:[], due_date:"", status:"todo", event_id:"", contact_id:"", details:"", recurrence:"", priority:"normal" })
    setShowForm(true)
  }

  async function save() {
    if (!form.title) return
    setSaving(true)
    const body = { ...form, event_id: form.event_id||null, contact_id: form.contact_id||null }
    if (editTask) {
      await fetch("/api/tasks", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...body, id:editTask.id}) })
    } else {
      await fetch("/api/tasks", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...body,assigned_by:user?.name}) })
    }
    setSaving(false); setShowForm(false); load()
  }

  const [activeTask, setActiveTask] = useState<any>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragStart(e: DragStartEvent) {
    setActiveTask(tasks.find(t => t.id === e.active.id) || null)
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveTask(null)
    const overCol = e.over?.id as string | undefined
    const taskId = e.active.id as number
    const task = tasks.find(t => t.id === taskId)
    if (overCol && task && task.status !== overCol) moveTask(taskId, overCol)
  }

  async function moveTask(id: number, status: string) {
    await fetch("/api/tasks", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id, status, status_only:true}) })
    setTasks(t => t.map(x => x.id===id ? {...x,status,status_changed_at:new Date().toISOString()} : x))
  }

  async function deleteTask(id: number) {
    if (!confirm("למחוק משימה זו?")) return
    await fetch("/api/tasks", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    setTasks(t => t.filter(x => x.id!==id))
  }

  function toggleAssignee(name: string) {
    setForm(f => ({ ...f, assignees: f.assignees.includes(name) ? f.assignees.filter(x=>x!==name) : [...f.assignees,name] }))
  }

  function toggleSelect(id: number) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function bulkStatus(status: string) {
    if (!selected.size) return
    setBulking(true)
    await fetch("/api/tasks/bulk", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ids:[...selected], action:"status", status}) })
    setBulking(false); success(`סטטוס עודכן ל-${selected.size} משימות`); setSelected(new Set()); load()
  }
  async function bulkPriority(priority: string) {
    if (!selected.size) return
    setBulking(true)
    await fetch("/api/tasks/bulk", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ids:[...selected], action:"priority", priority}) })
    setBulking(false); success(`דחיפות עודכנה ל-${selected.size} משימות`); setSelected(new Set()); load()
  }
  async function bulkAddAssignee(name: string) {
    if (!selected.size || !name) return
    setBulking(true)
    await fetch("/api/tasks/bulk", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ids:[...selected], action:"add_assignee", name}) })
    setBulking(false); success(`${name} נוסף/ה ל-${selected.size} משימות`); setSelected(new Set()); load()
  }
  async function bulkDelete() {
    if (!selected.size || !confirm(`למחוק ${selected.size} משימות?`)) return
    setBulking(true)
    await fetch("/api/tasks/bulk", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ids:[...selected], action:"delete"}) })
    setBulking(false); success(`${selected.size} משימות נמחקו`); setSelected(new Set()); load()
  }

  function addTplRow() {
    setNewTplItems(items => [...items, {title:"",type:"call",priority:"normal",offset_days:0}])
  }
  async function saveTemplate() {
    const items = newTplItems.filter(i=>i.title.trim())
    if (!newTplName.trim() || !items.length) return
    await fetch("/api/task-templates", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:newTplName.trim(), items}) })
    setNewTplName(""); setNewTplItems([{title:"",type:"call",priority:"normal",offset_days:0}])
    success("התבנית נשמרה"); loadTemplates()
  }
  async function applyTemplate() {
    if (!applyTplId || !applyAssignees.length) { toastError("בחר תבנית ומשויכים"); return }
    const r = await fetch("/api/task-templates/apply", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({template_id:applyTplId, assignees:applyAssignees, start_date:applyDate}) })
    const d = await r.json()
    if (d.ok) { success(`נוצרו ${d.created} משימות`); setApplyTplId(null); setApplyAssignees([]); load() }
    else toastError(d.error || "שגיאה")
  }
  async function deleteTemplate(id: number) {
    if (!confirm("למחוק תבנית זו?")) return
    await fetch("/api/task-templates", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    loadTemplates()
  }

  async function pauseSeries(id: number) {
    await fetch("/api/tasks/series", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id, action:"pause"}) })
    success("הסדרה הושהתה"); loadSeries()
  }
  async function resumeSeries(id: number) {
    await fetch("/api/tasks/series", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id, action:"resume"}) })
    success("הסדרה חודשה"); loadSeries()
  }

  const filtered = tasks
    .filter(t => !filterAssignee || t.assignees?.includes(filterAssignee))
    .filter(t => !filterPriority || (t.priority||"normal") === filterPriority)

  // Per-assignee load — open + overdue counts, for spotting who's overloaded
  const loadByAssignee = coords.map((c:any) => {
    const mine = tasks.filter(t => t.assignees?.includes(c.name))
    const open = mine.filter(t => t.status !== "done")
    const overdue = open.filter(t => t.due_date && t.due_date.slice(0,10) < today)
    return { name: c.name, isManager: c._isManager, open: open.length, overdue: overdue.length }
  }).filter(x => x.open > 0).sort((a,b) => b.overdue - a.overdue || b.open - a.open)

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 md:p-6 lg:p-8 space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={3}/>)}</div>

  return <div className="p-4 md:p-6 lg:p-8 fade-up">
    <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
      <div><h1 className="text-2xl font-extrabold text-[#0D2744]">לוח משימות Kanban</h1>
        <div className="text-sm text-[#64748B] mt-0.5">{tasks.filter(t=>t.status!=="done").length} פתוחות · {tasks.filter(t=>t.status==="done").length} הושלמו</div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" size="sm" onClick={()=>{ setShowSeries(v=>!v); if(!showSeries) loadSeries() }}>🔁 סדרות חוזרות</Button>
        <Button variant="secondary" size="sm" onClick={()=>{ setShowTemplates(v=>!v); if(!showTemplates) loadTemplates() }}>📋 תבניות</Button>
        <Button variant={bulkMode?"primary":"secondary"} size="sm" onClick={()=>{ setBulkMode(v=>!v); setSelected(new Set()) }}>{bulkMode?"סיום בחירה":"בחירה מרובה"}</Button>
        <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} className="px-3 py-2 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל רמות הדחיפות</option>
          {Object.entries(PRIORITY_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)} className="px-3 py-2 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל המשתמשים</option>
          <optgroup label="רכזים">{coords.filter((c:any)=>!c._isManager).map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}</optgroup>
          <optgroup label="מנהלים">{coords.filter((c:any)=>c._isManager).map((c:any)=><option key={c.id} value={c.name}>👑 {c.name}</option>)}</optgroup>
        </select>
        <Button onClick={startAdd}>+ משימה חדשה</Button>
      </div>
    </div>

    {/* Per-coordinator load — spot who's overloaded before assigning more */}
    {loadByAssignee.length>0 && <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
      {loadByAssignee.map(a => (
        <button key={a.name} onClick={()=>setFilterAssignee(f=>f===a.name?"":a.name)}
          className={`flex-shrink-0 px-3 py-2 rounded-[10px] border text-xs whitespace-nowrap transition-colors ${filterAssignee===a.name?"border-[#00488D] bg-[#F0F7FF]":"border-[#E2E8F0] bg-white"}`}>
          <span className="font-bold">{a.isManager && "👑 "}{a.name}</span>
          <span className="text-[#64748B]"> · {a.open} פתוחות</span>
          {a.overdue>0 && <span className="text-[#960010] font-bold"> · {a.overdue} באיחור</span>}
        </button>
      ))}
    </div>}

    {/* Recurring series manager */}
    {showSeries && <div className="bg-white border-2 border-[#E2E8F0] rounded-[14px] p-4 mb-5">
      <div className="text-sm font-bold text-[#0D2744] mb-3">סדרות חוזרות פעילות</div>
      <div className="space-y-2">
        {series.map((s:any) => (
          <div key={s.id} className="flex items-center gap-2 border border-[#E2E8F0] rounded-[10px] p-2.5 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <div className="text-xs font-semibold">{s.recurrence==="daily"?"כל יום":s.recurrence==="weekly"?"כל שבוע":"כל חודש"} · {s.title}</div>
              <div className="text-[10px] text-[#64748B]">{s.spawned_count} הופעות נוצרו · {s.open_count} פתוחות כרגע{!s.next_run && " · מושהית"}</div>
            </div>
            {s.next_run
              ? <Button size="sm" variant="secondary" onClick={()=>pauseSeries(s.id)}>השהה</Button>
              : <Button size="sm" variant="success" onClick={()=>resumeSeries(s.id)}>חדש</Button>}
          </div>
        ))}
        {series.length===0 && <div className="text-xs text-[#CBD5E1]">אין סדרות חוזרות פעילות</div>}
      </div>
    </div>}

    {/* Templates */}
    {showTemplates && <div className="bg-white border-2 border-[#E2E8F0] rounded-[14px] p-4 mb-5">
      <div className="text-sm font-bold text-[#0D2744] mb-3">תבניות משימות (החלה ידנית בלבד)</div>

      <div className="space-y-2 mb-4">
        {templates.map((t:any) => (
          <div key={t.id} className="border border-[#E2E8F0] rounded-[10px] p-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold">{t.name} <span className="text-[#94A3B8] font-normal">({t.items.length} פריטים)</span></div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={()=>setApplyTplId(applyTplId===t.id?null:t.id)}>{applyTplId===t.id?"ביטול":"החל"}</Button>
                <button onClick={()=>deleteTemplate(t.id)} className="px-2 py-1 rounded-[7px] text-xs bg-[#F0F4F8] hover:text-[#960010]">✕</button>
              </div>
            </div>
            <div className="text-[10px] text-[#64748B] mt-1">{t.items.map((i:any)=>i.title).join(" · ")}</div>
            {applyTplId===t.id && <div className="mt-2.5 pt-2.5 border-t border-[#E2E8F0] space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {coords.map((c:any)=>(
                  <label key={c.id} className={`flex items-center gap-1 text-xs cursor-pointer border rounded-[7px] px-2 py-1 ${applyAssignees.includes(c.name)?"bg-[#DBEAFE] border-[#BFDBFE]":"bg-white border-[#E2E8F0]"}`}>
                    <input type="checkbox" checked={applyAssignees.includes(c.name)} onChange={()=>setApplyAssignees(a=>a.includes(c.name)?a.filter(x=>x!==c.name):[...a,c.name])} className="w-3 h-3"/>
                    {c._isManager && "👑"} {c.name}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="date" value={applyDate} onChange={e=>setApplyDate(e.target.value)} className="px-2 py-1.5 border border-[#E2E8F0] rounded-[7px] text-xs"/>
                <Button size="sm" onClick={applyTemplate}>צור משימות</Button>
              </div>
            </div>}
          </div>
        ))}
        {templates.length===0 && <div className="text-xs text-[#CBD5E1] mb-2">אין תבניות עדיין</div>}
      </div>

      <details>
        <summary className="text-xs font-bold text-[#00488D] cursor-pointer">+ תבנית חדשה</summary>
        <div className="mt-2.5 space-y-2">
          <input value={newTplName} onChange={e=>setNewTplName(e.target.value)} placeholder="שם התבנית, למשל: רצף פתיחת שותפות" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm"/>
          {newTplItems.map((it,idx)=>(
            <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5">
              <input value={it.title} onChange={e=>setNewTplItems(items=>items.map((x,i)=>i===idx?{...x,title:e.target.value}:x))} placeholder={`שלב ${idx+1}`} className="px-2 py-1.5 border border-[#E2E8F0] rounded-[7px] text-xs"/>
              <select value={it.type} onChange={e=>setNewTplItems(items=>items.map((x,i)=>i===idx?{...x,type:e.target.value}:x))} className="px-2 py-1.5 border border-[#E2E8F0] rounded-[7px] text-xs bg-white">
                {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
              <input type="number" value={it.offset_days} onChange={e=>setNewTplItems(items=>items.map((x,i)=>i===idx?{...x,offset_days:Number(e.target.value)}:x))} title="ימים מתחילת התבנית" className="w-16 px-2 py-1.5 border border-[#E2E8F0] rounded-[7px] text-xs"/>
              <span className="text-[10px] text-[#94A3B8] self-center">ימים+</span>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={addTplRow}>+ שלב</Button>
            <Button size="sm" onClick={saveTemplate}>שמור תבנית</Button>
          </div>
        </div>
      </details>
    </div>}

    {/* Form */}
    {showForm && <div className="bg-white border-2 border-[#00488D] rounded-[14px] p-5 mb-5">
      <div className="text-sm font-bold text-[#00488D] mb-4">{editTask?"עריכת משימה":"משימה חדשה"}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="col-span-2"><label className="text-xs font-semibold block mb-1">כותרת *</label>
          <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">סוג</label>
          <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">סטטוס</label>
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {COLS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">תאריך יעד</label>
          <input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">דחיפות</label>
          <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(PRIORITY_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">חזרה 🔁</label>
          <select value={form.recurrence} onChange={e=>setForm(f=>({...f,recurrence:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            <option value="">חד-פעמית</option>
            <option value="daily">כל יום</option>
            <option value="weekly">כל שבוע</option>
            <option value="monthly">כל חודש</option>
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">אירוע</label>
          <select value={form.event_id} onChange={e=>setForm(f=>({...f,event_id:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            <option value="">— ללא —</option>
            {events.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
      </div>
      <div className="mb-3"><label className="text-xs font-semibold block mb-1">שיוך משתמשים</label>
        <div className="flex flex-wrap gap-2">
          {coords.map((c:any)=>(
            <label key={`${c.id}-${c._isManager}`}
              className={`flex items-center gap-1.5 text-xs cursor-pointer border rounded-[8px] px-2.5 py-1.5 select-none transition-colors ${
                form.assignees.includes(c.name)
                  ? c._isManager ? "bg-[#EDE9FE] border-[#C4B5FD] text-[#5B21B6]" : "bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]"
                  : "bg-white border-[#E2E8F0] text-[#374151] hover:bg-[#F8FAFC]"
              }`}>
              <input type="checkbox" checked={form.assignees.includes(c.name)} onChange={()=>toggleAssignee(c.name)} className="w-3 h-3" style={{accentColor: c._isManager?"#5B21B6":"#00488D"}}/>
              {c._isManager && <span>👑</span>}
              <span>{c.name}</span>
            </label>
          ))}
        </div></div>
      <div className="mb-3"><label className="text-xs font-semibold block mb-1">הערות</label>
        <input value={form.details} onChange={e=>setForm(f=>({...f,details:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
      <div className="flex gap-2"><Button onClick={save} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button></div>
    </div>}

    {/* Kanban */}
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 sm:grid-cols-4 gap-3">
        {COLS.map(col => {
          const colTasks = filtered.filter(t => t.status===col.key)
          return <DroppableColumn key={col.key} id={col.key} col={col} count={colTasks.length}>
            <div className="space-y-2">
              {colTasks.map(t => {
                const late = t.due_date && t.due_date.slice(0,10) < today && t.status!=="done"
                const accent = late?"#960010":col.key==="waiting"?"#B45309":col.key==="done"?"#166534":"#00488D"
                const isUrgent = (t.priority||"normal") === "urgent"
                const stuckDays = (col.key==="inprogress"||col.key==="waiting") ? ds(t.status_changed_at || t.created_at) : 0
                const isStuck = stuckDays >= STUCK_DAYS
                const lastNotify: any[] = Array.isArray(t.notify_log) ? t.notify_log.slice(-3) : []
                const card = <div style={{borderRight:`3px solid ${isUrgent?"#960010":accent}`}} className={`bg-white border rounded-[11px] p-3 ${bulkMode?"":"cursor-grab active:cursor-grabbing"} ${isUrgent?"border-[#FECACA]":"border-[#E2E8F0]"}`}>
                    <div className="flex items-start gap-2">
                      {bulkMode && <input type="checkbox" checked={selected.has(t.id)} onChange={()=>toggleSelect(t.id)} className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold leading-snug mb-1.5">{t.recurrence && "🔁 "}{isUrgent && "🔴 "}{t.title}</div>
                        <div className="flex gap-1 mb-2 flex-wrap">
                          <Badge text={TYPE_LABEL[t.type]||t.type}/>
                          {(t.priority && t.priority !== "normal") && (
                            <span style={{background:PRIORITY_COLOR[t.priority]?.bg,color:PRIORITY_COLOR[t.priority]?.fg}} className="text-xs font-bold px-1.5 py-0.5 rounded-full">
                              {PRIORITY_LABEL[t.priority]}
                            </span>
                          )}
                          {isStuck && <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#B45309]" title="לא זזה זמן רב">⏱ תקוע {stuckDays}י׳</span>}
                          {t.assignees?.slice(0,1).map((a:string)=><span key={a} className="text-xs px-1.5 py-0.5 bg-[#F0F7FF] text-[#00488D] rounded-full">{a.split(" ")[0]}</span>)}
                          {t.participant_names?.length>0 && <span className="text-xs px-1.5 py-0.5 bg-[#F3F4F6] text-[#374151] rounded-full" title={t.participant_names.join(", ")}>+{t.participant_names.length}</span>}
                        </div>
                        {t.due_date && <div style={{color:accent}} className="text-xs font-semibold mb-2">{late?"⚠ ":""}{fd(t.due_date.slice(0,10))}</div>}
                        {lastNotify.length>0 && <div className="flex gap-1 mb-2" title="סטטוס שליחת התראות">
                          {lastNotify.map((n:any,i:number)=>(
                            <span key={i} className={`text-[9px] px-1 py-0.5 rounded ${n.ok?"bg-[#DCFCE7] text-[#166534]":"bg-[#FEE2E2] text-[#991B1B]"}`}>
                              {n.channel==="email"?"✉":"📱"}{n.ok?"✓":"✕"}
                            </span>
                          ))}
                        </div>}
                        {!bulkMode && <div className="flex gap-1">
                          {COLS.filter(c=>c.key!==col.key).slice(0,2).map(nc=><button key={nc.key} onClick={()=>moveTask(t.id,nc.key)} className="flex-1 text-center py-1 rounded-[7px] bg-[#F0F4F8] text-[#00488D] text-xs font-bold hover:bg-[#DBEAFE] transition-colors">{nc.key==="todo"?"←":nc.key==="inprogress"?"▶":nc.key==="waiting"?"⏳":"✓"}</button>)}
                          <button onClick={()=>startEdit(t)} className="px-2 py-1 rounded-[7px] bg-[#F0F4F8] text-xs hover:bg-[#E2E8F0]">✎</button>
                          <button onClick={()=>deleteTask(t.id)} className="px-2 py-1 rounded-[7px] bg-[#F0F4F8] text-xs hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
                        </div>}
                      </div>
                    </div>
                  </div>
                return bulkMode
                  ? <div key={t.id} onClick={()=>toggleSelect(t.id)}>{card}</div>
                  : <DraggableCard key={t.id} id={t.id}>{card}</DraggableCard>
              })}
            </div>
          </DroppableColumn>
        })}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="bg-white border-2 border-[#00488D] rounded-[11px] p-3 shadow-2xl rotate-2 w-64">
            <div className="text-xs font-semibold">{activeTask.title}</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>

    {/* Bulk action bar */}
    {bulkMode && selected.size>0 && <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-8 sm:left-auto z-40 bg-[#0D2744] text-white rounded-[14px] shadow-2xl p-3 flex items-center gap-2 flex-wrap">
      <span className="text-sm font-bold px-1">{selected.size} נבחרו</span>
      <select onChange={e=>{ if(e.target.value) bulkStatus(e.target.value); e.target.value="" }} disabled={bulking} className="px-2 py-1.5 rounded-[7px] text-xs text-[#0D2744]">
        <option value="">שנה סטטוס...</option>
        {COLS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <select onChange={e=>{ if(e.target.value) bulkPriority(e.target.value); e.target.value="" }} disabled={bulking} className="px-2 py-1.5 rounded-[7px] text-xs text-[#0D2744]">
        <option value="">שנה דחיפות...</option>
        {Object.entries(PRIORITY_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <select onChange={e=>{ if(e.target.value) bulkAddAssignee(e.target.value); e.target.value="" }} disabled={bulking} className="px-2 py-1.5 rounded-[7px] text-xs text-[#0D2744]">
        <option value="">הוסף משויך...</option>
        {coords.map((c:any)=><option key={c.id} value={c.name}>{c._isManager?"👑 ":""}{c.name}</option>)}
      </select>
      <button onClick={bulkDelete} disabled={bulking} className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-[#960010]">מחק</button>
      <button onClick={()=>setSelected(new Set())} className="px-3 py-1.5 rounded-[7px] text-xs bg-white/10">נקה בחירה</button>
    </div>}
  </div>
}

function DroppableColumn({ id, col, count, children }: { id: string; col: any; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef}
      style={{ background: isOver ? "#EFF6FF" : col.bg, borderColor: isOver ? "#00488D" : col.border }}
      className="border rounded-[14px] p-3 min-h-[300px] transition-colors">
      <div style={{color:col.fg}} className="text-xs font-bold mb-3 flex items-center justify-between">
        {col.label} <span className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center text-xs">{count}</span>
      </div>
      {children}
    </div>
  )
}

function DraggableCard({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : "auto" }
    : undefined
  return <div ref={setNodeRef} style={style} {...listeners} {...attributes}>{children}</div>
}
