"use client"
import { useEffect, useState, useCallback } from "react"
import { fd, ds } from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import ExportButton from "@/components/ui/ExportButton"
import { SkeletonTable } from "@/components/ui/Skeleton"
import { useToast } from "@/components/ui/Toast"

const TYPE_LABEL: Record<string,string> = {
  partner:"שותף אסטרטגי", authority:"גורם רשות", vendor:"ספק חיצוני", lead:"ליד"
}
const STATUS_LABEL: Record<string,string> = {
  active:"שותף פעיל", initial:"נוצר קשר", meeting:"פגישה", cold:"ליד קר", irrelevant:"לא רלוונטי"
}
const STATUS_COLORS: Record<string,{bg:string,color:string}> = {
  active:{bg:"#DCFCE7",color:"#166534"}, initial:{bg:"#DBEAFE",color:"#1E40AF"},
  meeting:{bg:"#EDE9FE",color:"#5B21B6"}, cold:{bg:"#F3F4F6",color:"#374151"},
  irrelevant:{bg:"#FEE2E2",color:"#991B1B"}
}
const INT_ICON: Record<string,string> = { call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝" }
const INT_LABEL: Record<string,string> = { call:"שיחה", meeting:"פגישה", whatsapp:"וואטסאפ", email:"דואל", other:"אחר" }
const TASK_TYPE: Record<string,string> = { call:"שיחה", meeting:"פגישה", materials:"חומרים", backoffice:"בק-אופיס" }

const EMPTY_CONTACT = { name:"", org:"", role:"", phone:"", email:"", type:"partner", status:"cold", potential:1, owner:"", last_contact:"", notes:"" }
const EMPTY_INT = { date:new Date().toISOString().slice(0,10), type:"call", summary:"", next_step:"" }
const EMPTY_TASK = { title:"", type:"call", due_date:"", status:"todo", details:"", assignees:[] as string[] }

export default function ContactsPage() {
  const { success, error: toastError, undoable } = useToast()
  const [contacts, setContacts] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [managers, setManagers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [fType, setFType] = useState("")
  const [fStatus, setFStatus] = useState("")
  const [fOwner, setFOwner] = useState("")

  // Panel state
  const [openId, setOpenId] = useState<number|null>(null)
  const [detail, setDetail] = useState<any>(null)

  // Forms
  const [showContactForm, setShowContactForm] = useState(false)
  const [editContactId, setEditContactId] = useState<number|null>(null)
  const [contactForm, setContactForm] = useState({...EMPTY_CONTACT})

  // Interaction forms
  const [showIntForm, setShowIntForm] = useState(false)
  const [editIntId, setEditIntId] = useState<number|null>(null)
  const [intForm, setIntForm] = useState({...EMPTY_INT})

  // Task from interaction
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState({...EMPTY_TASK})
  const [taskContactId, setTaskContactId] = useState<number|null>(null)

  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cr, tr, ur] = await Promise.all([
        fetch("/api/contacts"), fetch("/api/targets"), fetch("/api/users/assignees")
      ])
      const { contacts } = await cr.json()
      const { coordinators } = await tr.json()
      const { managers } = await ur.json()
      setContacts(contacts||[])
      setCoords(coordinators||[])
      setManagers(managers||[])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadDetail(id: number) {
    const res = await fetch("/api/contacts/"+id)
    const d = await res.json()
    setDetail(d)
  }

  async function openDetail(id: number) {
    if (openId===id) { setOpenId(null); setDetail(null); return }
    setOpenId(id); setShowIntForm(false); setShowTaskForm(false); setEditIntId(null)
    await loadDetail(id)
  }

  function startAdd() {
    setEditContactId(null)
    setContactForm({...EMPTY_CONTACT, last_contact:new Date().toISOString().slice(0,10)})
    setShowContactForm(true); setOpenId(null); setDetail(null)
  }
  function startEdit(c: any) {
    setEditContactId(c.id)
    setContactForm({ name:c.name||"", org:c.org||"", role:c.role||"", phone:c.phone||"", email:c.email||"", type:c.type||"partner", status:c.status||"cold", potential:c.potential||1, owner:c.owner||"", last_contact:c.last_contact||"", notes:c.notes||"" })
    setShowContactForm(true); setOpenId(null); setDetail(null)
  }

  async function saveContact() {
    if (!contactForm.name.trim()) return
    setSaving(true)
    if (editContactId) await fetch("/api/contacts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...contactForm,id:editContactId})})
    else await fetch("/api/contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(contactForm)})
    setSaving(false); setShowContactForm(false); load()
    success(editContactId ? "השינויים נשמרו" : "איש הקשר נוסף")
  }

  async function deleteContact(id: number) {
    const name = contacts.find(c => c.id === id)?.name || "איש הקשר"
    await fetch("/api/contacts",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})})
    if (openId===id) { setOpenId(null); setDetail(null) }
    setContacts(cs => cs.filter(c => c.id !== id))
    undoable(`${name} נמחק`, async () => {
      await fetch("/api/contacts",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,restore:true})})
      load()
      success("השחזור הושלם")
    })
  }

  // ---- INTERACTIONS ----
  function openAddInt() {
    setEditIntId(null); setIntForm({...EMPTY_INT}); setShowIntForm(true); setShowTaskForm(false)
  }
  function openEditInt(i: any) {
    setEditIntId(i.id)
    setIntForm({ date:i.date||"", type:i.type||"call", summary:i.summary||"", next_step:i.next_step||"" })
    setShowIntForm(true); setShowTaskForm(false)
  }

  async function saveInt() {
    if (!intForm.summary.trim()||!openId) return
    setSaving(true)
    if (editIntId) {
      await fetch("/api/interactions",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...intForm,id:editIntId})})
    } else {
      await fetch("/api/interactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...intForm,contact_id:openId})})
    }
    setSaving(false); setShowIntForm(false); setEditIntId(null); setIntForm({...EMPTY_INT})
    success(editIntId ? "האינטראקציה עודכנה" : "האינטראקציה תועדה")
    if (openId) await loadDetail(openId); load()
  }

  async function deleteInt(id: number) {
    if (!confirm("למחוק אינטראקציה זו?")) return
    await fetch("/api/interactions",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})})
    if (openId) await loadDetail(openId)
  }

  // ---- TASK FROM INTERACTION ----
  function openTaskFromInt(contactId: number, contactName?: string) {
    setTaskContactId(contactId)
    const defaultDue = new Date(Date.now()+7*24*60*60*1000).toISOString().slice(0,10)
    setTaskForm({
      title: contactName ? `מעקב — ${contactName}` : "מעקב אינטראקציה",
      type:"call", due_date:defaultDue, status:"todo", details:"", assignees:[]
    })
    setShowTaskForm(true); setShowIntForm(false)
  }

  async function saveTask() {
    if (!taskForm.title.trim()) return
    setSaving(true)
    await fetch("/api/tasks",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...taskForm, contact_id:taskContactId||openId})
    })
    setSaving(false); setShowTaskForm(false); setTaskForm({...EMPTY_TASK})
    success("המשימה נוצרה")
    if (openId) await loadDetail(openId)
  }

  // ---- TASK → INTERACTION ----
  async function taskToInteraction(task: any) {
    if (!openId) return
    setSaving(true)
    await fetch("/api/interactions",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        contact_id:openId,
        date:new Date().toISOString().slice(0,10),
        type:"call",
        summary:`בוצע: ${task.title}`,
        next_step:""
      })
    })
    // Mark task as done
    await fetch("/api/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:task.id,status:"done",status_only:true})})
    setSaving(false); await loadDetail(openId); load()
  }

  function toggleAssignee(name: string) {
    setTaskForm(f=>({...f, assignees: f.assignees.includes(name)?f.assignees.filter(x=>x!==name):[...f.assignees,name]}))
  }

  // All assignable people
  const allAssignees = [
    ...coords.map((c:any)=>({name:c.name, label:c.name, role:"רכז"})),
    ...managers.map((m:any)=>({name:m.name, label:m.name, role:m.role==="admin"?"מנהל":"צופה"})),
  ]

  const filtered = contacts.filter(c => {
    if (q && !((c.name||"")+(c.org||"")+(c.owner||"")).includes(q)) return false
    if (fType && c.type!==fType) return false
    if (fStatus && c.status!==fStatus) return false
    if (fOwner && c.owner!==fOwner) return false
    return true
  })
  const today = new Date().toISOString().slice(0,10)
  const InputClass = "w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">אנשי קשר ושותפים</h1>
          <div className="text-sm text-[#64748B] mt-0.5">{contacts.length} רשומות</div>
        </div>
        <div className="flex gap-2"><ExportButton type="contacts"/><Button onClick={startAdd}>+ איש קשר חדש</Button></div>
      </div>

      {/* Contact form */}
      {showContactForm && <Card className="mb-5 border-2 border-[#00488D]"><div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-bold text-[#00488D]">{editContactId?"עריכת איש קשר":"איש קשר חדש"}</div>
          <button onClick={()=>setShowContactForm(false)} className="text-[#94A3B8] hover:text-[#374151] text-lg">✕</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {[["שם *","name","text"],["ארגון","org","text"],["תפקיד","role","text"],["טלפון","phone","tel"],["דואל","email","email"]].map(([l,k,t])=>(
            <div key={k}><label className="text-xs font-semibold block mb-1">{l}</label>
              <input type={t} value={(contactForm as any)[k]} onChange={e=>setContactForm(f=>({...f,[k]:e.target.value}))} className={InputClass}/></div>
          ))}
          <div><label className="text-xs font-semibold block mb-1">רכז אחראי</label>
            <select value={contactForm.owner} onChange={e=>setContactForm(f=>({...f,owner:e.target.value}))} className={InputClass+" bg-white"}>
              <option value="">— בחר —</option>
              {coords.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
            </select></div>
          <div><label className="text-xs font-semibold block mb-1">סוג</label>
            <select value={contactForm.type} onChange={e=>setContactForm(f=>({...f,type:e.target.value}))} className={InputClass+" bg-white"}>
              {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label className="text-xs font-semibold block mb-1">סטטוס</label>
            <select value={contactForm.status} onChange={e=>setContactForm(f=>({...f,status:e.target.value}))} className={InputClass+" bg-white"}>
              {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label className="text-xs font-semibold block mb-1">פוטנציאל</label>
            <select value={contactForm.potential} onChange={e=>setContactForm(f=>({...f,potential:+e.target.value}))} className={InputClass+" bg-white"}>
              <option value={1}>★ נמוך</option><option value={2}>★★ בינוני</option><option value={3}>★★★ גבוה</option>
            </select></div>
          <div><label className="text-xs font-semibold block mb-1">קשר אחרון</label>
            <input type="date" value={contactForm.last_contact} onChange={e=>setContactForm(f=>({...f,last_contact:e.target.value}))} className={InputClass}/></div>
          <div className="sm:col-span-2"><label className="text-xs font-semibold block mb-1">הערות</label>
            <input value={contactForm.notes} onChange={e=>setContactForm(f=>({...f,notes:e.target.value}))} className={InputClass}/></div>
        </div>
        <div className="flex gap-2"><Button onClick={saveContact} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowContactForm(false)}>ביטול</Button></div>
      </div></Card>}

      {/* Detail panel */}
      {openId && detail?.contact && <Card className="mb-5 border-2 border-[#00488D]"><div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-4 pb-4 border-b border-[#E2E8F0] mb-4">
          <div className="w-12 h-12 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-base font-bold flex-shrink-0">
            {(detail.contact.name||"").split(" ").map((w:string)=>w[0]).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold">{detail.contact.name}</div>
            <div className="text-sm text-[#64748B]">{detail.contact.role} · {detail.contact.org}</div>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {STATUS_COLORS[detail.contact.status] && <span style={STATUS_COLORS[detail.contact.status]} className="px-2.5 py-0.5 rounded-full text-xs font-semibold">{STATUS_LABEL[detail.contact.status]}</span>}
              <span className="text-[#f59e0b] text-sm">{"★".repeat(detail.contact.potential||1)}{"☆".repeat(3-(detail.contact.potential||1))}</span>
            </div>
          </div>
          <div className="text-xs text-[#64748B] text-right space-y-1 flex-shrink-0">
            {detail.contact.phone&&<div>📞 {detail.contact.phone}</div>}
            {detail.contact.email&&<div>✉ {detail.contact.email}</div>}
            {detail.contact.owner&&<div>👤 {detail.contact.owner}</div>}
            <button onClick={()=>{setOpenId(null);setDetail(null)}} className="text-[#94A3B8] hover:text-[#374151] block mt-1">✕ סגור</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* INTERACTIONS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-[#374151] uppercase tracking-wide">אינטראקציות ({(detail.interactions||[]).length})</div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={openAddInt}>+ תעד</Button>
                <Button size="sm" onClick={()=>openTaskFromInt(openId!,detail.contact.name)}>+ משימה</Button>
              </div>
            </div>

            {/* Interaction form */}
            {showIntForm && <div className="bg-[#F0F7FF] rounded-[11px] p-3 mb-3 space-y-2">
              <div className="text-xs font-bold text-[#00488D]">{editIntId?"עריכת אינטראקציה":"אינטראקציה חדשה"}</div>
              <div className="grid grid-cols-2 gap-2">
                <select value={intForm.type} onChange={e=>setIntForm(f=>({...f,type:e.target.value}))} className="px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs bg-white">
                  {Object.entries(INT_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
                <input type="date" value={intForm.date} onChange={e=>setIntForm(f=>({...f,date:e.target.value}))} className="px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
              </div>
              <textarea value={intForm.summary} onChange={e=>setIntForm(f=>({...f,summary:e.target.value}))} rows={2} placeholder="סיכום *" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs resize-none focus:outline-none focus:border-[#00488D]"/>
              <input value={intForm.next_step} onChange={e=>setIntForm(f=>({...f,next_step:e.target.value}))} placeholder="צעד הבא" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveInt} disabled={saving}>{saving?"...":"שמור"}</Button>
                <Button size="sm" variant="secondary" onClick={()=>{setShowIntForm(false);setEditIntId(null);setIntForm({...EMPTY_INT})}}>ביטול</Button>
              </div>
            </div>}

            {/* Task from interaction form */}
            {showTaskForm && <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[11px] p-3 mb-3 space-y-2">
              <div className="text-xs font-bold text-[#5B21B6]">+ משימה חדשה</div>
              <input value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} placeholder="כותרת המשימה *" className="w-full px-2 py-1.5 border border-[#C4B5FD] rounded-[8px] text-xs focus:outline-none focus:border-[#5B21B6]"/>
              <div className="grid grid-cols-2 gap-2">
                <select value={taskForm.type} onChange={e=>setTaskForm(f=>({...f,type:e.target.value}))} className="px-2 py-1.5 border border-[#C4B5FD] rounded-[8px] text-xs bg-white">
                  {Object.entries(TASK_TYPE).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
                <input type="date" value={taskForm.due_date} onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))} className="px-2 py-1.5 border border-[#C4B5FD] rounded-[8px] text-xs focus:outline-none focus:border-[#5B21B6]"/>
              </div>
              <input value={taskForm.details} onChange={e=>setTaskForm(f=>({...f,details:e.target.value}))} placeholder="פרטים" className="w-full px-2 py-1.5 border border-[#C4B5FD] rounded-[8px] text-xs focus:outline-none focus:border-[#5B21B6]"/>
              <div>
                <div className="text-[10px] font-bold text-[#5B21B6] mb-1.5">שיוך (רכזים ומנהלים)</div>
                <div className="flex flex-wrap gap-1.5">
                  {allAssignees.map(a=>(
                    <label key={a.name} className="flex items-center gap-1 text-[10px] cursor-pointer bg-white border border-[#E2E8F0] rounded-full px-2 py-0.5">
                      <input type="checkbox" checked={taskForm.assignees.includes(a.name)} onChange={()=>toggleAssignee(a.name)} className="accent-[#5B21B6] w-3 h-3"/>
                      <span>{a.name}</span>
                      <span className="text-[#94A3B8]">{a.role==="מנהל"?"👑":""}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveTask} disabled={saving}>{saving?"...":"שמור משימה"}</Button>
                <Button size="sm" variant="secondary" onClick={()=>{setShowTaskForm(false);setTaskForm({...EMPTY_TASK})}}>ביטול</Button>
              </div>
            </div>}

            <div className="space-y-0 max-h-72 overflow-y-auto">
              {(detail.interactions||[]).length===0 && <div className="text-xs text-[#94A3B8] text-center py-4">אין אינטראקציות</div>}
              {(detail.interactions||[]).map((i:any)=>(
                <div key={i.id} className="flex gap-2.5 py-2.5 border-b border-[#F1F5F9] last:border-0 group">
                  <div className="w-8 h-8 rounded-full bg-[#F0F7FF] flex items-center justify-center text-sm flex-shrink-0">{INT_ICON[i.type]||"📝"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{INT_LABEL[i.type]||i.type} · {fd(i.date)}</div>
                    <div className="text-xs text-[#475569] mt-0.5 bg-[#F9FAFB] rounded p-1.5">{i.summary}</div>
                    {i.next_step&&<div className="text-xs text-[#00488D] mt-1">← {i.next_step}</div>}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={()=>openEditInt(i)} className="text-[#94A3B8] hover:text-[#00488D] text-xs px-1">✎</button>
                    <button onClick={()=>deleteInt(i.id)} className="text-[#94A3B8] hover:text-[#960010] text-xs px-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TASKS */}
          <div>
            <div className="text-xs font-bold text-[#374151] uppercase tracking-wide mb-3">
              משימות פתוחות ({(detail.tasks||[]).length})
            </div>
            <div className="space-y-0">
              {(detail.tasks||[]).length===0 && <div className="text-xs text-[#94A3B8] text-center py-4">אין משימות פתוחות</div>}
              {(detail.tasks||[]).map((t:any)=>{
                const late = t.due_date&&t.due_date.slice(0,10)<today
                return (
                  <div key={t.id} className="flex items-start gap-2 py-2.5 border-b border-[#F1F5F9] last:border-0 group">
                    <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{background:late?"#960010":"#00488D"}}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold">{t.title}</div>
                      <div className={`text-xs mt-0.5 ${late?"text-[#960010]":"text-[#64748B]"}`}>{TASK_TYPE[t.type]||t.type} · {fd(t.due_date?.slice(0,10))}</div>
                      {t.assignees?.length>0&&<div className="text-[10px] text-[#94A3B8] mt-0.5">{t.assignees.join(", ")}</div>}
                    </div>
                    {/* Convert task to interaction */}
                    <button onClick={()=>taskToInteraction(t)} disabled={saving}
                      title="המר לאינטראקציה"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-0.5 bg-[#F0F7FF] text-[#00488D] rounded-full border border-[#BFDBFE] hover:bg-[#DBEAFE] whitespace-nowrap">
                      → אינטראקציה
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div></Card>}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-[9px] px-3 py-1.5">
          <span className="text-[#94A3B8] text-sm">🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="חיפוש..." className="border-none outline-none text-sm bg-transparent w-32"/>
          {q&&<button onClick={()=>setQ("")} className="text-[#94A3B8] text-xs">✕</button>}
        </div>
        <select value={fType} onChange={e=>setFType(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הסוגים</option>
          {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <select value={fOwner} onChange={e=>setFOwner(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הרכזים</option>
          {coords.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <span className="text-xs text-[#94A3B8]">{filtered.length} רשומות</span>
      </div>

      {/* Table */}
      {loading ? <SkeletonTable rows={5} cols={7}/> : <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              {["שם","ארגון","סוג","רכז","סטטוס","פוטנציאל","קשר אחרון",""].map(h=>(
                <th key={h} className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={8} className="text-center py-10 text-sm text-[#94A3B8]">לא נמצאו אנשי קשר</td></tr>}
              {filtered.map(c=>{
                const d=ds(c.last_contact); const isOpen=openId===c.id
                const sc=STATUS_COLORS[c.status]||{bg:"#F3F4F6",color:"#374151"}
                return <tr key={c.id} className={`border-b border-[#F1F5F9] last:border-0 transition-colors ${d>=30?"bg-[#FFF8F8]":""} ${isOpen?"!bg-[#F0F7FF]":"hover:bg-[#F8FAFC]"}`}>
                  <td className="px-3 py-2.5"><div className="font-semibold text-[#0D2744]">{c.name}</div><div className="text-xs text-[#64748B]">{c.role}</div></td>
                  <td className="px-3 py-2.5 text-sm text-[#475569]">{c.org||"—"}</td>
                  <td className="px-3 py-2.5 text-xs text-[#475569]">{TYPE_LABEL[c.type]||c.type}</td>
                  <td className="px-3 py-2.5 text-xs text-[#475569]">{c.owner||"—"}</td>
                  <td className="px-3 py-2.5"><span style={sc} className="px-2 py-0.5 rounded-full text-xs font-semibold">{STATUS_LABEL[c.status]||c.status}</span></td>
                  <td className="px-3 py-2.5 text-[#f59e0b] text-sm">{"★".repeat(c.potential||1)}{"☆".repeat(3-(c.potential||1))}</td>
                  <td className={`px-3 py-2.5 text-xs font-medium ${d>=30?"text-[#960010]":"text-[#475569]"}`}>{fd(c.last_contact)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={()=>openDetail(c.id)} className={`px-2 py-1 rounded-[6px] text-xs border transition-colors ${isOpen?"bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]":"border-[#E2E8F0] hover:bg-[#F0F7FF]"}`}>👁</button>
                      <button onClick={()=>startEdit(c)} className="px-2 py-1 rounded-[6px] text-xs border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
                      <button onClick={()=>deleteContact(c.id)} className="px-2 py-1 rounded-[6px] text-xs border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
                    </div>
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </Card>}
    </div>
  )
}