"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd } from "@/lib/utils"

const COLS = [
  { key:"todo", label:"לביצוע", border:"#E2E8F0", dot:"#94A3B8" },
  { key:"inprogress", label:"בתהליך", border:"#BFDBFE", dot:"#1E40AF" },
  { key:"waiting", label:"ממתין", border:"#FDE68A", dot:"#B45309" },
  { key:"done", label:"בוצע", border:"#BBF7D0", dot:"#166534" },
]
const TYPE_LABEL: Record<string,string> = { call:"שיחה", meeting:"פגישה", materials:"חומרים", backoffice:"בק-אופיס" }

export default function CoordTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number|null>(null)
  const [myOnly, setMyOnly] = useState(true)
  const [form, setForm] = useState({ title:"", type:"call", assignees:[] as string[], due_date:"", status:"todo", details:"", event_id:"", contact_id:"" })
  const [saving, setSaving] = useState(false)
  const today = new Date().toISOString().slice(0,10)

  async function load() {
    const [tr, cr, cor, er, ur] = await Promise.all([
      fetch("/api/tasks"), fetch("/api/contacts"), fetch("/api/targets"),
      fetch("/api/events"), fetch("/api/users/assignees")
    ])
    const { tasks } = await tr.json()
    const { contacts } = await cr.json()
    const { coordinators } = await cor.json()
    const { events } = await er.json()
    const { managers } = await ur.json()
    const allPeople = [
      ...coordinators,
      ...(managers||[]).map((m:any)=>({...m, name:m.name+" 👑"}))
    ]
    setTasks(tasks||[]); setContacts(contacts||[]); setCoords(allPeople); setEvents(events||[])
  }
  useEffect(() => { load() }, [])

  const shown = myOnly
    ? tasks.filter(t=>t.assignees?.includes(user?.name||""))
    : tasks

  function startAdd() {
    setEditId(null)
    setForm({ title:"", type:"call", assignees:[user?.name||""], due_date:"", status:"todo", details:"", event_id:"", contact_id:"" })
    setShowForm(true)
  }
  function startEdit(t:any) {
    setEditId(t.id)
    setForm({ title:t.title, type:t.type, assignees:t.assignees||[], due_date:t.due_date?.slice(0,10)||"", status:t.status, details:t.details||"", event_id:t.event_id||"", contact_id:t.contact_id||"" })
    setShowForm(true)
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const body = { ...form, event_id:form.event_id||null, contact_id:form.contact_id||null }
    if (editId) await fetch("/api/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,id:editId,assigned_by:user?.name})})
    else await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,assigned_by:user?.name})})
    setSaving(false); setShowForm(false); load()
  }

  async function move(id:number, status:string) {
    await fetch("/api/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status,status_only:true})})
    setTasks(t=>t.map(x=>x.id===id?{...x,status}:x))
  }

  async function del(id:number) {
    await fetch("/api/tasks",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})})
    setTasks(t=>t.filter(x=>x.id!==id))
  }

  function toggleAssignee(name:string) {
    setForm(f=>({...f, assignees: f.assignees.includes(name)?f.assignees.filter(x=>x!==name):[...f.assignees,name]}))
  }

  return <div className="p-4">
    <div className="flex items-center justify-between mb-3">
      <div className="text-lg font-extrabold">משימות</div>
      <div className="flex gap-2">
        <button onClick={()=>setMyOnly(v=>!v)} className={`px-3 py-1.5 rounded-[9px] text-xs font-semibold border transition-colors ${myOnly?"bg-[#0D2744] text-white border-[#0D2744]":"border-[#E2E8F0] text-[#475569]"}`}>
          {myOnly?"שלי בלבד":"הכל"}
        </button>
        <button onClick={startAdd} className="px-3 py-1.5 bg-[#0D2744] text-white rounded-[9px] text-sm font-semibold">+ משימה</button>
      </div>
    </div>

    {/* Form */}
    {showForm&&<div className="bg-white border-2 border-[#00488D] rounded-[14px] p-4 mb-4 fade-up">
      <div className="text-sm font-bold text-[#00488D] mb-3">{editId?"עריכת משימה":"משימה חדשה"}</div>
      <div className="space-y-2.5">
        <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="כותרת *" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {COLS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <select value={form.event_id} onChange={e=>setForm(f=>({...f,event_id:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            <option value="">— אירוע —</option>
            {events.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <input value={form.details} onChange={e=>setForm(f=>({...f,details:e.target.value}))} placeholder="הערות" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
        <div>
          <div className="text-xs font-semibold mb-1.5">שיוך רכזים</div>
          <div className="flex flex-wrap gap-2">
            {coords.map((c:any)=>(
            <label key={`${c.id}-${c._isManager}`}
              className={`flex items-center gap-1.5 text-xs cursor-pointer border rounded-[8px] px-2.5 py-1 select-none transition-colors ${
                form.assignees.includes(c.name)
                  ? c._isManager?"bg-[#EDE9FE] border-[#C4B5FD] text-[#5B21B6]":"bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]"
                  : "bg-white border-[#E2E8F0]"
              }`}>
              <input type="checkbox" checked={form.assignees.includes(c.name)} onChange={()=>toggleAssignee(c.name)} className="w-3 h-3" style={{accentColor:c._isManager?"#5B21B6":"#00488D"}}/>
              {c._isManager && "👑"} {c.name}
            </label>
          ))}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50">{saving?"שומר...":"שמור"}</button>
          <button onClick={()=>setShowForm(false)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-[10px] text-sm">ביטול</button>
        </div>
      </div>
    </div>}

    {/* Kanban - horizontal scroll */}
    <div className="flex gap-3 overflow-x-auto pb-3">
      {COLS.map(col=>{
        const colTasks = shown.filter(t=>t.status===col.key)
        return <div key={col.key} style={{borderColor:col.border}} className="border-2 rounded-[14px] p-3 min-w-[200px] w-52 flex-shrink-0 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:col.dot}}/>
            <div className="text-xs font-bold flex-1">{col.label}</div>
            <span className="text-xs text-[#94A3B8]">{colTasks.length}</span>
          </div>
          <div className="space-y-2">
            {colTasks.map(t=>{
              const late=t.due_date&&t.due_date.slice(0,10)<today&&t.status!=="done"
              return <div key={t.id} style={{borderRight:`3px solid ${late?"#960010":col.dot}`}} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-2.5">
                <div className="text-xs font-semibold leading-snug mb-1.5">{t.title}</div>
                <div className="text-[10px] text-[#64748B] mb-2">{TYPE_LABEL[t.type]||t.type}{t.due_date&&` · ${fd(t.due_date.slice(0,10))}`}</div>
                {t.assignees?.length>0&&<div className="text-[10px] text-[#00488D] mb-2">{t.assignees.join(", ")}</div>}
                <div className="flex gap-1">
                  {col.key!=="done"&&<button onClick={()=>move(t.id,"done")} className="flex-1 text-center py-1 rounded-[6px] text-[10px] font-bold bg-[#DCFCE7] text-[#166534]">✓</button>}
                  {col.key==="todo"&&<button onClick={()=>move(t.id,"inprogress")} className="flex-1 text-center py-1 rounded-[6px] text-[10px] font-bold bg-[#DBEAFE] text-[#1E40AF]">▶</button>}
                  {col.key==="inprogress"&&<button onClick={()=>move(t.id,"waiting")} className="flex-1 text-center py-1 rounded-[6px] text-[10px] font-bold bg-[#FEF3C7] text-[#B45309]">⏳</button>}
                  <button onClick={()=>startEdit(t)} className="px-1.5 py-1 rounded-[6px] text-[10px] bg-white border border-[#E2E8F0]">✎</button>
                  <button onClick={()=>del(t.id)} className="px-1.5 py-1 rounded-[6px] text-[10px] bg-white border border-[#E2E8F0] hover:text-[#960010]">✕</button>
                </div>
              </div>
            })}
            {colTasks.length===0&&<div className="text-xs text-[#CBD5E1] text-center py-3">ריק</div>}
          </div>
        </div>
      })}
    </div>
  </div>
}