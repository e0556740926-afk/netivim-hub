"use client"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Button from "@/components/ui/Button"

const COLS = [
  { key:"todo", label:"לביצוע", bg:"#F8FAFC", border:"#E2E8F0", fg:"#374151" },
  { key:"inprogress", label:"בתהליך", bg:"#F0F7FF", border:"#BFDBFE", fg:"#1E40AF" },
  { key:"waiting", label:"ממתין לתשובה", bg:"#FFFBEB", border:"#FDE68A", fg:"#B45309" },
  { key:"done", label:"בוצע", bg:"#F0FFF4", border:"#BBF7D0", fg:"#166534" },
]
const TYPE_LABEL: Record<string,string> = { call:"שיחה", meeting:"פגישה", materials:"חומרים", backoffice:"בק-אופיס" }

export default function TasksPage() {
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<any>(null)
  const [filterAssignee, setFilterAssignee] = useState("")
  const [form, setForm] = useState({ title:"", type:"call", assignees:[] as string[], due_date:"", status:"todo", event_id:"", contact_id:"", details:"" })
  const [saving, setSaving] = useState(false)
  const today = new Date().toISOString().slice(0,10)

  async function load() {
    setLoading(true)
    const [tr, cr, er, cor] = await Promise.all([
      fetch("/api/tasks"), fetch("/api/contacts"), fetch("/api/events"), fetch("/api/targets")
    ])
    const { tasks } = await tr.json()
    const { contacts } = await cr.json()
    const { events } = await er.json()
    const { coordinators } = await cor.json()
    setTasks(tasks||[]); setContacts(contacts||[]); setEvents(events||[]); setCoords(coordinators||[])
  }

  useEffect(() => { load().finally(()=>setLoading(false)) }, [])

  function startEdit(t: any) {
    setEditTask(t)
    setForm({ title:t.title, type:t.type, assignees:t.assignees||[], due_date:t.due_date?.slice(0,10)||"", status:t.status, event_id:t.event_id||"", contact_id:t.contact_id||"", details:t.details||"" })
    setShowForm(true)
  }

  function startAdd() {
    setEditTask(null)
    setForm({ title:"", type:"call", assignees:[], due_date:"", status:"todo", event_id:"", contact_id:"", details:"" })
    setShowForm(true)
  }

  async function save() {
    if (!form.title) return
    setSaving(true)
    const body = { ...form, event_id: form.event_id||null, contact_id: form.contact_id||null }
    if (editTask) {
      await fetch("/api/tasks", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...body, id:editTask.id}) })
    } else {
      await fetch("/api/tasks", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) })
    }
    setSaving(false); setShowForm(false); load()
  }

  async function moveTask(id: number, status: string) {
    await fetch("/api/tasks", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id, status, status_only:true}) })
    setTasks(t => t.map(x => x.id===id ? {...x,status} : x))
  }

  async function deleteTask(id: number) {
    await fetch("/api/tasks", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    setTasks(t => t.filter(x => x.id!==id))
  }

  function toggleAssignee(name: string) {
    setForm(f => ({ ...f, assignees: f.assignees.includes(name) ? f.assignees.filter(x=>x!==name) : [...f.assignees,name] }))
  }

  const filtered = filterAssignee ? tasks.filter(t => t.assignees?.includes(filterAssignee)) : tasks

  return <div className="p-4 md:p-6 lg:p-8 fade-up">
    <div className="flex items-center justify-between mb-5">
      <div><h1 className="text-2xl font-extrabold text-[#0D2744]">לוח משימות Kanban</h1>
        <div className="text-sm text-[#64748B] mt-0.5">{tasks.filter(t=>t.status!=="done").length} פתוחות · {tasks.filter(t=>t.status==="done").length} הושלמו</div>
      </div>
      <div className="flex gap-2">
        <select value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)} className="px-3 py-2 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הרכזים</option>
          {coords.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <Button onClick={startAdd}>+ משימה חדשה</Button>
      </div>
    </div>

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
        <div><label className="text-xs font-semibold block mb-1">אירוע</label>
          <select value={form.event_id} onChange={e=>setForm(f=>({...f,event_id:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            <option value="">— ללא —</option>
            {events.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
      </div>
      <div className="mb-3"><label className="text-xs font-semibold block mb-1">שיוך רכזים</label>
        <div className="flex flex-wrap gap-2">
          {coords.map((c:any)=><label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={form.assignees.includes(c.name)} onChange={()=>toggleAssignee(c.name)} className="accent-[#00488D]"/>{c.name}
          </label>)}
        </div></div>
      <div className="mb-3"><label className="text-xs font-semibold block mb-1">הערות</label>
        <input value={form.details} onChange={e=>setForm(f=>({...f,details:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
      <div className="flex gap-2"><Button onClick={save} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button></div>
    </div>}

    {/* Kanban */}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {COLS.map(col => {
        const colTasks = filtered.filter(t => t.status===col.key)
        return <div key={col.key} style={{background:col.bg,borderColor:col.border}} className="border rounded-[14px] p-3 min-h-[300px]">
          <div style={{color:col.fg}} className="text-xs font-bold mb-3 flex items-center justify-between">
            {col.label} <span className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center text-xs">{colTasks.length}</span>
          </div>
          <div className="space-y-2">
            {colTasks.map(t => {
              const late = t.due_date && t.due_date.slice(0,10) < today && t.status!=="done"
              const accent = late?"#960010":col.key==="waiting"?"#B45309":col.key==="done"?"#166534":"#00488D"
              return <div key={t.id} style={{borderRight:`3px solid ${accent}`}} className="bg-white border border-[#E2E8F0] rounded-[11px] p-3">
                <div className="text-xs font-semibold leading-snug mb-1.5">{t.title}</div>
                <div className="flex gap-1 mb-2 flex-wrap">
                  <Badge text={TYPE_LABEL[t.type]||t.type}/>
                  {t.assignees?.slice(0,1).map((a:string)=><span key={a} className="text-xs px-1.5 py-0.5 bg-[#F0F7FF] text-[#00488D] rounded-full">{a.split(" ")[0]}</span>)}
                </div>
                {t.due_date && <div style={{color:accent}} className="text-xs font-semibold mb-2">{late?"⚠ ":""}{fd(t.due_date.slice(0,10))}</div>}
                <div className="flex gap-1">
                  {COLS.filter(c=>c.key!==col.key).slice(0,2).map(nc=><button key={nc.key} onClick={()=>moveTask(t.id,nc.key)} className="flex-1 text-center py-1 rounded-[7px] bg-[#F0F4F8] text-[#00488D] text-xs font-bold hover:bg-[#DBEAFE] transition-colors">{nc.key==="todo"?"←":nc.key==="inprogress"?"▶":nc.key==="waiting"?"⏳":"✓"}</button>)}
                  <button onClick={()=>startEdit(t)} className="px-2 py-1 rounded-[7px] bg-[#F0F4F8] text-xs hover:bg-[#E2E8F0]">✎</button>
                  <button onClick={()=>deleteTask(t.id)} className="px-2 py-1 rounded-[7px] bg-[#F0F4F8] text-xs hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
                </div>
              </div>
            })}
          </div>
        </div>
      })}
    </div>
  </div>
}