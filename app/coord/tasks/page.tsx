"use client"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd, tod } from "@/lib/utils"

const COLS = [
  { key:"todo", label:"לביצוע", border:"#E2E8F0", dot:"#94A3B8" },
  { key:"inprogress", label:"בתהליך", border:"#BFDBFE", dot:"#1E40AF" },
  { key:"waiting", label:"ממתין", border:"#FDE68A", dot:"#B45309" },
  { key:"done", label:"בוצע", border:"#BBF7D0", dot:"#166534" },
]
const TYPE_LABEL: Record<string,string> = { call:"שיחה", meeting:"פגישה", materials:"חומרים", backoffice:"בק-אופיס" }
const PRIORITY_LABEL: Record<string,string> = { urgent:"דחוף", normal:"רגיל", low:"נמוך" }
const PRIORITY_COLOR: Record<string,{bg:string,fg:string}> = {
  urgent: { bg:"#FEE2E2", fg:"#991B1B" },
  normal: { bg:"#F3F4F6", fg:"#374151" },
  low:    { bg:"#F0F4F8", fg:"#64748B" },
}

function tomorrow(): string {
  const d = new Date(); d.setDate(d.getDate()+1)
  return d.toISOString().slice(0,10)
}

export default function CoordTasks() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const [tasks, setTasks] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number|null>(null)
  const [myOnly, setMyOnly] = useState(true)
  const [filterPriority, setFilterPriority] = useState("")
  const [view, setView] = useState<"kanban"|"agenda">("kanban")
  const [form, setForm] = useState({ title:"", type:"call", assignees:[] as string[], due_date:"", status:"todo", details:"", event_id:"", contact_id:"", recurrence:"", priority:"normal" })
  const [saving, setSaving] = useState(false)
  const [quickTitle, setQuickTitle] = useState("")
  const [quickSaving, setQuickSaving] = useState(false)
  const today = tod()

  // Checklist + comments for whichever task is being edited — loaded
  // on demand since both need a real task id (new tasks don't have
  // one until first save).
  const [checklist, setChecklist] = useState<any[]>([])
  const [newCheckItem, setNewCheckItem] = useState("")
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState("")

  async function load() {
    setLoading(true); setError(false)
    try {
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
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function loadTaskExtras(id: number) {
    try {
      const [clr, cmr] = await Promise.all([
        fetch(`/api/tasks/${id}/checklist`), fetch(`/api/tasks/${id}/comments`)
      ])
      const { items } = await clr.json()
      const { comments } = await cmr.json()
      setChecklist(items||[]); setComments(comments||[])
    } catch (e) { console.error(e) }
  }

  const shown = (myOnly
    ? tasks.filter(t=>t.assignees?.includes(user?.name||""))
    : tasks
  ).filter(t => !filterPriority || (t.priority||"normal") === filterPriority)

  function startAdd() {
    setEditId(null)
    setForm({ title:"", type:"call", assignees:[user?.name||""], due_date:"", status:"todo", details:"", event_id:"", contact_id:"", recurrence:"", priority:"normal" })
    setChecklist([]); setComments([])
    setShowForm(true)
  }
  function startEdit(t:any) {
    setEditId(t.id)
    setForm({ title:t.title, type:t.type, assignees:t.assignees||[], due_date:t.due_date?.slice(0,10)||"", status:t.status, details:t.details||"", event_id:t.event_id||"", contact_id:t.contact_id||"", recurrence:t.recurrence||"", priority:t.priority||"normal" })
    loadTaskExtras(t.id)
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

  async function quickAdd() {
    if (!quickTitle.trim() || !user?.name) return
    setQuickSaving(true)
    await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      title: quickTitle.trim(), type:"call", assignees:[user.name], due_date: today, status:"todo", priority:"normal", assigned_by:user.name
    })})
    setQuickTitle(""); setQuickSaving(false); load()
  }

  async function move(id:number, status:string) {
    await fetch("/api/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status,status_only:true})})
    setTasks(t=>t.map(x=>x.id===id?{...x,status}:x))
  }

  async function snooze(id:number) {
    const due = tomorrow()
    await fetch("/api/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,due_date:due,due_date_only:true})})
    setTasks(t=>t.map(x=>x.id===id?{...x,due_date:due}:x))
  }

  async function del(id:number) {
    if (!confirm("למחוק משימה זו?")) return
    await fetch("/api/tasks",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})})
    setTasks(t=>t.filter(x=>x.id!==id))
  }

  function toggleAssignee(name:string) {
    setForm(f=>({...f, assignees: f.assignees.includes(name)?f.assignees.filter(x=>x!==name):[...f.assignees,name]}))
  }

  async function addCheckItem() {
    if (!newCheckItem.trim() || !editId) return
    const res = await fetch(`/api/tasks/${editId}/checklist`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:newCheckItem.trim()})})
    const { item } = await res.json()
    setChecklist(c=>[...c,item]); setNewCheckItem("")
  }
  async function toggleCheckItem(id:number, done:boolean) {
    setChecklist(c=>c.map(x=>x.id===id?{...x,done}:x))
    await fetch(`/api/tasks/${editId}/checklist`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,done})})
  }
  async function delCheckItem(id:number) {
    setChecklist(c=>c.filter(x=>x.id!==id))
    await fetch(`/api/tasks/${editId}/checklist`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})})
  }
  async function addComment() {
    if (!newComment.trim() || !editId) return
    const res = await fetch(`/api/tasks/${editId}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:newComment.trim()})})
    const { comment } = await res.json()
    setComments(c=>[...c,comment]); setNewComment("")
  }

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={3}/>)}</div>

  // Agenda buckets — open tasks grouped by urgency instead of status.
  const openShown = shown.filter(t=>t.status!=="done")
  const doneShown = shown.filter(t=>t.status==="done")
  const overdue = openShown.filter(t=>t.due_date && t.due_date.slice(0,10)<today)
  const dueToday = openShown.filter(t=>t.due_date && t.due_date.slice(0,10)===today)
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate()+7)
  const weekEndStr = weekEnd.toISOString().slice(0,10)
  const dueSoon = openShown.filter(t=>t.due_date && t.due_date.slice(0,10)>today && t.due_date.slice(0,10)<=weekEndStr)
  const noDate = openShown.filter(t=>!t.due_date)
  const AGENDA_BUCKETS = [
    { label:"⚠ באיחור", color:"#960010", items:overdue },
    { label:"היום", color:"#00488D", items:dueToday },
    { label:"השבוע", color:"#374151", items:dueSoon },
    { label:"בלי תאריך", color:"#94A3B8", items:noDate },
  ]

  function AgendaRow({ t }: { t:any }) {
    const isUrgent=(t.priority||"normal")==="urgent"
    return <div className="bg-white border border-[#E2E8F0] rounded-[10px] p-2.5 flex items-center gap-2">
      <button onClick={()=>move(t.id,"done")} className="w-6 h-6 flex-shrink-0 rounded-full border-2 border-[#CBD5E1] hover:border-[#166534] hover:bg-[#DCFCE7] transition-colors" title="סמן כבוצע"/>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate">{t.recurrence && "🔁 "}{isUrgent && "🔴 "}{t.title}</div>
        <div className="text-[10px] text-[#64748B] flex items-center gap-1.5 flex-wrap mt-0.5">
          <span>{TYPE_LABEL[t.type]||t.type}{t.due_date&&` · ${fd(t.due_date.slice(0,10))}`}</span>
          {t.assignees?.length>0&&<span className="text-[#00488D]">{t.assignees.join(", ")}</span>}
        </div>
      </div>
      <button onClick={()=>snooze(t.id)} className="px-2 py-1 rounded-[6px] text-[10px] font-bold bg-[#F0F4F8] text-[#374151] flex-shrink-0" title="דחה למחר">⏭ מחר</button>
      <button onClick={()=>startEdit(t)} className="px-1.5 py-1 rounded-[6px] text-[10px] bg-white border border-[#E2E8F0] flex-shrink-0">✎</button>
    </div>
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

    {/* Quick add — one field, defaults to today/call/me, for adding a task in the field with minimum friction */}
    <div className="flex gap-1.5 mb-3">
      <input value={quickTitle} onChange={e=>setQuickTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") quickAdd()}}
        placeholder="הוספה מהירה — כותרת בלבד, ל-היום..." className="flex-1 px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
      <button onClick={quickAdd} disabled={quickSaving||!quickTitle.trim()} className="px-3 py-2 bg-[#F0F4F8] text-[#0D2744] rounded-[9px] text-sm font-bold disabled:opacity-40">+</button>
    </div>

    {/* View + priority filters */}
    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
      <div className="flex gap-1.5 overflow-x-auto">
        {["",...Object.keys(PRIORITY_LABEL)].map(p=>(
          <button key={p||"all"} onClick={()=>setFilterPriority(p)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${filterPriority===p?"bg-[#0D2744] text-white border-[#0D2744]":"border-[#E2E8F0] text-[#64748B]"}`}>
            {p===""?"הכל":PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="flex gap-1 bg-[#F0F4F8] rounded-[9px] p-0.5">
        <button onClick={()=>setView("agenda")} className={`px-2.5 py-1 rounded-[7px] text-xs font-semibold ${view==="agenda"?"bg-white shadow-sm text-[#0D2744]":"text-[#64748B]"}`}>סדר יומי</button>
        <button onClick={()=>setView("kanban")} className={`px-2.5 py-1 rounded-[7px] text-xs font-semibold ${view==="kanban"?"bg-white shadow-sm text-[#0D2744]":"text-[#64748B]"}`}>קנבן</button>
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
          <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(PRIORITY_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <select value={form.recurrence} onChange={e=>setForm(f=>({...f,recurrence:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            <option value="">חד-פעמית</option>
            <option value="daily">🔁 כל יום</option>
            <option value="weekly">🔁 כל שבוע</option>
            <option value="monthly">🔁 כל חודש</option>
          </select>
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

        {/* Checklist + comments — only once the task exists (needs a real id) */}
        {editId && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="border border-[#E2E8F0] rounded-[10px] p-2.5">
            <div className="text-xs font-bold mb-2">צ'קליסט</div>
            <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
              {checklist.map(it=>(
                <label key={it.id} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={it.done} onChange={e=>toggleCheckItem(it.id,e.target.checked)} className="w-3 h-3"/>
                  <span className={it.done?"line-through text-[#94A3B8] flex-1":"flex-1"}>{it.text}</span>
                  <button onClick={()=>delCheckItem(it.id)} className="text-[#CBD5E1] hover:text-[#960010]">✕</button>
                </label>
              ))}
              {checklist.length===0&&<div className="text-[10px] text-[#CBD5E1]">אין פריטים</div>}
            </div>
            <div className="flex gap-1">
              <input value={newCheckItem} onChange={e=>setNewCheckItem(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") addCheckItem()}} placeholder="פריט חדש..." className="flex-1 px-2 py-1 border border-[#E2E8F0] rounded-[7px] text-xs"/>
              <button onClick={addCheckItem} className="px-2 py-1 bg-[#F0F4F8] rounded-[7px] text-xs font-bold">+</button>
            </div>
          </div>
          <div className="border border-[#E2E8F0] rounded-[10px] p-2.5">
            <div className="text-xs font-bold mb-2">תגובות</div>
            <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
              {comments.map(c=>(
                <div key={c.id} className="text-xs"><span className="font-semibold text-[#00488D]">{c.author_name}:</span> {c.body}</div>
              ))}
              {comments.length===0&&<div className="text-[10px] text-[#CBD5E1]">אין תגובות</div>}
            </div>
            <div className="flex gap-1">
              <input value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") addComment()}} placeholder="תגובה..." className="flex-1 px-2 py-1 border border-[#E2E8F0] rounded-[7px] text-xs"/>
              <button onClick={addComment} className="px-2 py-1 bg-[#F0F4F8] rounded-[7px] text-xs font-bold">שלח</button>
            </div>
          </div>
        </div>}

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50">{saving?"שומר...":"שמור"}</button>
          <button onClick={()=>setShowForm(false)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-[10px] text-sm">ביטול</button>
        </div>
      </div>
    </div>}

    {/* Agenda view */}
    {view==="agenda" && <div className="space-y-4">
      {AGENDA_BUCKETS.map(b=>b.items.length>0 && (
        <div key={b.label}>
          <div style={{color:b.color}} className="text-xs font-bold mb-1.5 flex items-center gap-1.5">{b.label} <span className="text-[#94A3B8] font-normal">({b.items.length})</span></div>
          <div className="space-y-1.5">{b.items.map((t:any)=><AgendaRow key={t.id} t={t}/>)}</div>
        </div>
      ))}
      {openShown.length===0 && <div className="text-xs text-[#CBD5E1] text-center py-8">אין משימות פתוחות 🎉</div>}
      {doneShown.length>0 && <details className="pt-2">
        <summary className="text-xs font-bold text-[#94A3B8] cursor-pointer">בוצע ({doneShown.length})</summary>
        <div className="space-y-1.5 mt-2 opacity-60">{doneShown.map(t=><AgendaRow key={t.id} t={t}/>)}</div>
      </details>}
    </div>}

    {/* Kanban - horizontal scroll */}
    {view==="kanban" && <div className="flex gap-3 overflow-x-auto pb-3">
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
              const isUrgent=(t.priority||"normal")==="urgent"
              return <div key={t.id} style={{borderRight:`3px solid ${isUrgent?"#960010":late?"#960010":col.dot}`}} className={`bg-[#F8FAFC] border rounded-[10px] p-2.5 ${isUrgent?"border-[#FECACA]":"border-[#E2E8F0]"}`}>
                <div className="text-xs font-semibold leading-snug mb-1.5">{t.recurrence && "🔁 "}{isUrgent && "🔴 "}{t.title}</div>
                <div className="text-[10px] text-[#64748B] mb-2 flex items-center gap-1 flex-wrap">
                  <span>{TYPE_LABEL[t.type]||t.type}{t.due_date&&` · ${fd(t.due_date.slice(0,10))}`}</span>
                  {(t.priority && t.priority!=="normal") && (
                    <span style={{background:PRIORITY_COLOR[t.priority]?.bg,color:PRIORITY_COLOR[t.priority]?.fg}} className="px-1.5 py-0.5 rounded-full font-bold">
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  )}
                </div>
                {t.assignees?.length>0&&<div className="text-[10px] text-[#00488D] mb-2">{t.assignees.join(", ")}</div>}
                <div className="flex gap-1 flex-wrap">
                  {col.key!=="done"&&<button onClick={()=>move(t.id,"done")} className="flex-1 text-center py-1 rounded-[6px] text-[10px] font-bold bg-[#DCFCE7] text-[#166534]">✓</button>}
                  {col.key==="todo"&&<button onClick={()=>move(t.id,"inprogress")} className="flex-1 text-center py-1 rounded-[6px] text-[10px] font-bold bg-[#DBEAFE] text-[#1E40AF]">▶</button>}
                  {col.key==="inprogress"&&<button onClick={()=>move(t.id,"waiting")} className="flex-1 text-center py-1 rounded-[6px] text-[10px] font-bold bg-[#FEF3C7] text-[#B45309]">⏳</button>}
                  {col.key!=="done"&&<button onClick={()=>snooze(t.id)} className="px-1.5 py-1 rounded-[6px] text-[10px] bg-white border border-[#E2E8F0]" title="דחה למחר">⏭</button>}
                  <button onClick={()=>startEdit(t)} className="px-1.5 py-1 rounded-[6px] text-[10px] bg-white border border-[#E2E8F0]">✎</button>
                  <button onClick={()=>del(t.id)} className="px-1.5 py-1 rounded-[6px] text-[10px] bg-white border border-[#E2E8F0] hover:text-[#960010]">✕</button>
                </div>
              </div>
            })}
            {colTasks.length===0&&<div className="text-xs text-[#CBD5E1] text-center py-3">ריק</div>}
          </div>
        </div>
      })}
    </div>}
  </div>
}
