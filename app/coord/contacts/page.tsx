"use client"
import EmptyState from "@/components/ui/EmptyState"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd, ds } from "@/lib/utils"

const TYPE_LABEL: Record<string,string> = { partner:"שותף אסטרטגי", authority:"גורם רשות", vendor:"ספק חיצוני", lead:"ליד" }
const STATUS_COLORS: Record<string,{bg:string,color:string}> = {
  active:{bg:"#DCFCE7",color:"#166534"}, initial:{bg:"#DBEAFE",color:"#1E40AF"},
  meeting:{bg:"#EDE9FE",color:"#5B21B6"}, cold:{bg:"#F3F4F6",color:"#374151"},
  irrelevant:{bg:"#FEE2E2",color:"#991B1B"}
}
const STATUS_LABEL: Record<string,string> = { active:"שותף פעיל", initial:"נוצר קשר", meeting:"פגישה", cold:"ליד קר", irrelevant:"לא רלוונטי" }
const INT_ICON: Record<string,string> = { call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝" }

const EMPTY_FORM = { name:"", org:"", role:"", phone:"", email:"", type:"partner", status:"cold", potential:1, owner:"", last_contact:new Date().toISOString().slice(0,10), notes:"" }
const EMPTY_INT = { date:new Date().toISOString().slice(0,10), type:"call", summary:"", next_step:"" }

export default function CoordContacts() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const [contacts, setContacts] = useState<any[]>([])
  const [q, setQ] = useState("")
  const [fStatus, setFStatus] = useState("")
  const [openId, setOpenId] = useState<number|null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number|null>(null)
  const [showInt, setShowInt] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [intForm, setIntForm] = useState({...EMPTY_INT})
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const res = await fetch("/api/contacts")
      const { contacts } = await res.json()
      setContacts(contacts||[])
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function openDetail(id: number) {
    if (openId===id) { setOpenId(null); setDetail(null); return }
    setOpenId(id); setShowInt(false)
    const res = await fetch("/api/contacts/"+id)
    setDetail(await res.json())
  }

  function startAdd() {
    setEditId(null)
    setForm({...EMPTY_FORM, owner:user?.name||"", last_contact:new Date().toISOString().slice(0,10)})
    setShowForm(true); setOpenId(null); setDetail(null)
  }
  function startEdit(c:any) {
    setEditId(c.id)
    setForm({name:c.name||"",org:c.org||"",role:c.role||"",phone:c.phone||"",email:c.email||"",type:c.type||"partner",status:c.status||"cold",potential:c.potential||1,owner:c.owner||"",last_contact:c.last_contact||"",notes:c.notes||""})
    setShowForm(true); setOpenId(null); setDetail(null)
  }

  async function save(force = false) {
    if (!form.name.trim()) return
    setSaving(true)
    if (editId) {
      await fetch("/api/contacts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,id:editId})})
    } else {
      const res = await fetch("/api/contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,force})})
      if (res.status === 409) {
        const d = await res.json()
        setSaving(false)
        if (confirm(`איש קשר עם טלפון זה כבר קיים (${d.duplicate.name}${d.duplicate.org?` · ${d.duplicate.org}`:""}). להוסיף בכל זאת?`)) {
          return save(true)
        }
        return
      }
    }
    setSaving(false); setShowForm(false); load()
  }

  async function saveInt() {
    if (!intForm.summary.trim()||!openId) return
    setSaving(true)
    await fetch("/api/interactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...intForm,contact_id:openId})})
    setSaving(false); setShowInt(false); setIntForm({...EMPTY_INT})
    const res=await fetch("/api/contacts/"+openId); setDetail(await res.json()); load()
  }

  const filtered = contacts.filter(c=>{
    if(q&&!((c.name||"")+(c.org||"")).includes(q)) return false
    if(fStatus&&c.status!==fStatus) return false
    return true
  })

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={4}/>)}</div>

  return <div className="p-4">
    <div className="flex items-center justify-between mb-3">
      <div className="text-lg font-extrabold">אנשי קשר</div>
      <button onClick={startAdd} className="px-3 py-1.5 bg-[#0D2744] text-white rounded-[9px] text-sm font-semibold">+ הוסף</button>
    </div>

    {/* Filters */}
    <div className="flex gap-2 mb-3">
      <div className="flex-1 flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-[10px] px-3 py-2">
        <span className="text-[#94A3B8]">🔍</span>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="חיפוש..." className="flex-1 text-sm bg-transparent outline-none"/>
        {q&&<button onClick={()=>setQ("")} className="text-[#94A3B8] text-xs">✕</button>}
      </div>
      <select value={fStatus} onChange={e=>setFStatus(e.target.value)} className="px-2 py-2 border border-[#E2E8F0] rounded-[10px] text-xs bg-white">
        <option value="">הכל</option>
        {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
    </div>

    {/* Add/Edit form */}
    {showForm&&<div className="bg-white border-2 border-[#00488D] rounded-[14px] p-4 mb-3 fade-up">
      <div className="text-sm font-bold text-[#00488D] mb-3">{editId?"עריכת איש קשר":"איש קשר חדש"}</div>
      <div className="space-y-2">
        <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="שם מלא *" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.org} onChange={e=>setForm(f=>({...f,org:e.target.value}))} placeholder="ארגון" className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <input value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} placeholder="תפקיד" className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="טלפון" className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="דואל" className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="הערות" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={()=>save()} disabled={saving} className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50">{saving?"שומר...":"שמור"}</button>
        <button onClick={()=>setShowForm(false)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-[10px] text-sm">ביטול</button>
      </div>
    </div>}

    {/* Detail panel */}
    {openId&&detail?.contact&&<div className="bg-white border-2 border-[#00488D] rounded-[14px] p-4 mb-3 fade-up">
      <div className="flex items-start gap-3 pb-3 border-b border-[#E2E8F0] mb-3">
        <div className="w-11 h-11 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-sm font-bold flex-shrink-0">
          {(detail.contact.name||"").split(" ").map((w:string)=>w[0]).join("")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">{detail.contact.name}</div>
          <div className="text-xs text-[#64748B]">{detail.contact.role} · {detail.contact.org}</div>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {STATUS_COLORS[detail.contact.status]&&<span style={STATUS_COLORS[detail.contact.status]} className="px-2 py-0.5 rounded-full text-xs font-semibold">{STATUS_LABEL[detail.contact.status]}</span>}
            <span className="text-[#f59e0b] text-xs">{"★".repeat(detail.contact.potential||1)}</span>
          </div>
          {detail.contact.phone&&<div className="text-xs text-[#64748B] mt-1">📞 {detail.contact.phone}</div>}
        </div>
        <div className="flex gap-1.5">
          <button onClick={()=>startEdit(detail.contact)} className="px-2 py-1 rounded-[7px] border border-[#E2E8F0] text-xs hover:bg-[#F0F7FF]">✎</button>
          <button onClick={()=>{setOpenId(null);setDetail(null)}} className="px-2 py-1 rounded-[7px] border border-[#E2E8F0] text-xs">✕</button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-[#374151]">אינטראקציות ({(detail.interactions||[]).length})</div>
        <button onClick={()=>setShowInt(v=>!v)} className="text-xs font-bold text-[#00488D]">+ תעד</button>
      </div>
      {showInt&&<div className="bg-[#F0F7FF] rounded-[10px] p-3 mb-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select value={intForm.type} onChange={e=>setIntForm(f=>({...f,type:e.target.value}))} className="px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs bg-white">
            {[["call","שיחה"],["meeting","פגישה"],["whatsapp","וואטסאפ"],["email","דואל"],["other","אחר"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={intForm.date} onChange={e=>setIntForm(f=>({...f,date:e.target.value}))} className="px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
        </div>
        <textarea value={intForm.summary} onChange={e=>setIntForm(f=>({...f,summary:e.target.value}))} rows={2} placeholder="סיכום *" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs resize-none focus:outline-none focus:border-[#00488D]"/>
        <input value={intForm.next_step} onChange={e=>setIntForm(f=>({...f,next_step:e.target.value}))} placeholder="צעד הבא" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
        <div className="flex gap-2">
          <button onClick={saveInt} disabled={saving} className="flex-1 py-1.5 bg-[#0D2744] text-white text-xs font-bold rounded-[8px] disabled:opacity-50">שמור</button>
          <button onClick={()=>setShowInt(false)} className="px-3 py-1.5 border border-[#E2E8F0] text-xs rounded-[8px]">ביטול</button>
        </div>
      </div>}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {(detail.interactions||[]).length===0&&<div className="text-xs text-[#94A3B8] text-center py-3">אין אינטראקציות</div>}
        {(detail.interactions||[]).map((i:any)=><div key={i.id} className="flex gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0">
          <span className="text-base flex-shrink-0">{INT_ICON[i.type]||"📝"}</span>
          <div className="flex-1"><div className="text-xs font-semibold">{fd(i.date)}</div>
            <div className="text-xs text-[#475569] mt-0.5 bg-[#F9FAFB] rounded p-1.5">{i.summary}</div>
            {i.next_step&&<div className="text-xs text-[#00488D] mt-0.5">← {i.next_step}</div>}
          </div>
        </div>)}
      </div>
    </div>}

    {/* List */}
    <div className="space-y-2">
      {filtered.length===0&&<EmptyState icon="👥" title={q||fStatus?"לא נמצאו תוצאות":"אין עדיין אנשי קשר"} hint={q||fStatus?"נסה חיפוש אחר":"כאן מופיעים כל אנשי הקשר של הארגון"} actionLabel={q||fStatus?undefined:"+ הוסף איש קשר"} onAction={startAdd} onClearFilters={q||fStatus?()=>{setQ("");setFStatus("")}:undefined}/>}
      {filtered.map(c=>{
        const d=ds(c.last_contact); const isOpen=openId===c.id
        const sc=STATUS_COLORS[c.status]||{bg:"#F3F4F6",color:"#374151"}
        return <div key={c.id} onClick={()=>openDetail(c.id)}
          className={`bg-white border rounded-[12px] p-3 flex items-center gap-3 cursor-pointer transition-colors ${isOpen?"border-[#00488D] bg-[#F0F7FF]":d>=30?"border-[#FECACA] bg-[#FFF8F8]":"border-[#E2E8F0]"}`}>
          <div className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">
            {(c.name||"").split(" ").map((w:string)=>w[0]).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{c.name}</div>
            <div className="text-xs text-[#64748B] truncate">{c.org} {c.owner&&`· ${c.owner}`}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <span style={sc} className="px-2 py-0.5 rounded-full text-xs font-semibold">{STATUS_LABEL[c.status]||c.status}</span>
            <div className={`text-xs mt-1 ${d>=30?"text-[#960010] font-semibold":"text-[#94A3B8]"}`}>{fd(c.last_contact)}</div>
          </div>
        </div>
      })}
    </div>
  </div>
}