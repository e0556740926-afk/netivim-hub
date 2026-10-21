"use client"
import OrganizationDirectory from "@/components/partners/OrganizationDirectory"
import {useToast} from "@/components/ui/Toast"
import EmptyState from "@/components/ui/EmptyState"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd, ds } from "@/lib/utils"
import { useUrlState } from "@/lib/use-url-state"
import { useQuickAction } from "@/lib/quick-action"
import Sheet from "@/components/shell/Sheet"
import ReferralLink from "@/components/partners/ReferralLink"

const TYPE_LABEL: Record<string,string> = { partner:"שותף אסטרטגי", authority:"גורם רשות", vendor:"ספק חיצוני", lead:"ליד" }
const STATUS_COLORS: Record<string,{bg:string,color:string}> = {
  active:{bg:"#DCFCE7",color:"#166534"}, initial:{bg:"#DBEAFE",color:"#1E40AF"},
  meeting:{bg:"#EDE9FE",color:"#5B21B6"}, cold:{bg:"#F3F4F6",color:"#374151"},
  irrelevant:{bg:"#FEE2E2",color:"#991B1B"}
}
const STATUS_LABEL: Record<string,string> = { active:"שותף פעיל", initial:"נוצר קשר", meeting:"פגישה", cold:"ליד קר", irrelevant:"לא רלוונטי" }
const INT_ICON: Record<string,string> = { call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝" }

const EMPTY_FORM = { name:"", org:"", partner_organization_id:null as number|null, role:"", phone:"", email:"", type:"partner", status:"cold", potential:1, owner:"", last_contact:new Date().toISOString().slice(0,10), notes:"" }
const EMPTY_INT = { date:new Date().toISOString().slice(0,10), type:"call", summary:"", next_step:"" }
const TASK_TYPE: Record<string,string> = { call:"שיחה", meeting:"פגישה", materials:"חומרים", backoffice:"בק-אופיס" }
const LEAD_STATUS: Record<string,string> = { new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי" }
const EMPTY_TASK = { title:"", type:"call", due_date:"", details:"" }

export default function CoordContacts() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const {success,error:toastError}=useToast()
  // View + filters live in the URL so opening a card, another tab or a reload keeps them.
  const [view,setView]=useUrlState("view","contacts")
  const [organizations,setOrganizations]=useState<any[]>([]),[registryReady,setRegistryReady]=useState(false)
  const [contacts, setContacts] = useState<any[]>([])
  const [q, setQ] = useUrlState("q")
  const [fStatus, setFStatus] = useUrlState("status")
  const [fType, setFType] = useUrlState("type")
  const [fOwner, setFOwner] = useUrlState("owner")
  const [pickForInteraction, setPickForInteraction] = useState(false)
  const [newOrgSignal, setNewOrgSignal] = useState(0)
  const [linkFor, setLinkFor] = useState<any>(null)
  const [openId, setOpenId] = useState<number|null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number|null>(null)
  const [showInt, setShowInt] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [intForm, setIntForm] = useState({...EMPTY_INT})
  const [showTask, setShowTask] = useState(false)
  const [taskForm, setTaskForm] = useState({...EMPTY_TASK})
  const [coordId, setCoordId] = useState<number|null>(null)
  const [saving, setSaving] = useState(false)
  const today = new Date().toISOString().slice(0,10)

  async function load() {
    setError(false)
    try {
      const [res,orgRes]=await Promise.all([fetch('/api/contacts'),fetch('/api/contacts/organizations')]);
      if(!res.ok||!orgRes.ok)throw Error('טעינת המאגר נכשלה');
      const {contacts}=await res.json(),orgData=await orgRes.json();
      setContacts(contacts||[]);setOrganizations(orgData.organizations||[]);setRegistryReady(orgData.available!==false)
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Deep link from tasks/leads chips: /…/contacts?open=<id>
  useEffect(() => {
    if (typeof window === "undefined") return
    const id = Number(new URLSearchParams(window.location.search).get("open"))
    if (id) openDetail(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Own coordinator row — tasks created from a contact card are scoped to it.
  useEffect(() => {
    if (!user) return
    fetch(`/api/coord?user_id=${user.id}`).then(r=>r.json()).then(d=>setCoordId(d.coord?.id||null)).catch(()=>{})
  }, [user])

  async function loadDetail(id: number) {
    const res = await fetch("/api/contacts/"+id)
    setDetail(await res.json())
  }
  async function openDetail(id: number, withInteraction = false) {
    if (openId===id && !withInteraction) { setOpenId(null); setDetail(null); return }
    setOpenId(id); setShowInt(withInteraction); setShowTask(false)
    if (withInteraction) setIntForm({...EMPTY_INT, date:new Date().toISOString().slice(0,10)})
    await loadDetail(id)
  }
  function closeDetail() { setOpenId(null); setDetail(null); setShowInt(false); setShowTask(false) }

  // "+ הוספה" quick actions open these same forms.
  useQuickAction(["partner","organization","interaction"], t => {
    if (t === "partner") startAdd()
    else if (t === "organization") { setShowForm(false); setView("organizations"); setNewOrgSignal(n => n + 1) }
    else { setView("contacts"); setPickForInteraction(true) }
  }, !loading)

  function startTask() {
    const name = detail?.contact?.name || ""
    const due = new Date(Date.now()+7*24*60*60*1000).toISOString().slice(0,10)
    setTaskForm({ title: name ? `מעקב — ${name}` : "מעקב", type:"call", due_date:due, details:"" })
    setShowTask(true); setShowInt(false)
  }
  async function saveTask() {
    if (!taskForm.title.trim()||!openId||!user) return
    setSaving(true)
    // Assigned to the coordinator themselves (tasks are matched by name in `assignees`).
    await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...taskForm, status:"todo", contact_id:openId, coordinator_id:coordId, assignees:[user.name]})})
    setSaving(false); setShowTask(false); setTaskForm({...EMPTY_TASK})
    await loadDetail(openId)
  }
  async function doneTask(id: number) {
    await fetch("/api/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:"done",status_only:true})})
    if (openId) await loadDetail(openId)
  }

  function startAdd() {
    setView("contacts")
    setEditId(null)
    setForm({...EMPTY_FORM, owner:user?.name||"", last_contact:new Date().toISOString().slice(0,10)})
    setShowForm(true); setOpenId(null); setDetail(null)
  }
  function startEdit(c:any) {
    setEditId(c.id)
    setForm({name:c.name||"",org:c.org||"",partner_organization_id:c.partner_organization_id||organizations.find(o=>o.name===c.org)?.id||null,role:c.role||"",phone:c.phone||"",email:c.email||"",type:c.type||"partner",status:c.status||"cold",potential:c.potential||1,owner:c.owner||"",last_contact:c.last_contact||"",notes:c.notes||""})
    setShowForm(true); setOpenId(null); setDetail(null)
  }

  async function save(force=false){
    if(!form.name.trim()){toastError('יש להזין שם איש קשר');return}
    if(!registryReady||!form.partner_organization_id){toastError('יש לבחור עמותה או מוסד קיימים');return}
    setSaving(true)
    try{const res=await fetch('/api/contacts',{method:editId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(editId?{...form,id:editId}:{...form,force})});const data=await res.json();
      if(res.status===409&&data.duplicate&&!editId){setSaving(false);if(confirm(`איש קשר עם טלפון זה כבר קיים (${data.duplicate.name}). להוסיף בכל זאת?`))return save(true);return}
      if(!res.ok)throw Error(data.error||'שמירת איש הקשר נכשלה');setShowForm(false);await load();success('איש הקשר נשמר')
    }catch(e){toastError(e instanceof Error?e.message:'שמירת איש הקשר נכשלה')}finally{setSaving(false)}
  }

  async function saveInt() {
    if (!intForm.summary.trim()||!openId) return
    setSaving(true)
    await fetch("/api/interactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...intForm,contact_id:openId})})
    setSaving(false); setShowInt(false); setIntForm({...EMPTY_INT})
    await loadDetail(openId); load()
  }

  const owners = Array.from(new Set(contacts.map(c=>c.owner).filter(Boolean))).sort()

  const filtered = contacts.filter(c=>{
    if(q&&!((c.name||"")+(c.org||"")).includes(q)) return false
    if(fStatus&&c.status!==fStatus) return false
    if(fType&&c.type!==fType) return false
    if(fOwner&&c.owner!==fOwner) return false
    return true
  })
  const hasFilters = !!(q||fStatus||fType||fOwner)
  function clearFilters() { setQ(""); setFStatus(""); setFType(""); setFOwner("") }

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={4}/>)}</div>

  return <div className="partners-ws partner-coordinator-page">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div><h1 className="text-[26px] font-bold leading-tight tracking-[-.6px] m-0 mb-1.5">הקשרים שלי</h1><div className="text-[13px] text-[#62756E]">אנשים וארגונים שמקדמים יחד</div></div>
      <button onClick={startAdd} aria-label="איש קשר חדש" className="w-11 h-11 flex-shrink-0 grid place-items-center rounded-[12px] border border-[#E1E8E3] bg-white text-xl text-[#183D32]">+</button>
    </div>

    <div className="partner-view-tabs partner-coord-tabs"><button aria-pressed={view==='contacts'} onClick={()=>setView('contacts')}>אנשי קשר <span>{contacts.length}</span></button><button aria-pressed={view==='organizations'} onClick={()=>{setShowForm(false);setView('organizations')}}>עמותות ומוסדות <span>{organizations.length}</span></button></div>
    {view==='organizations'?<OrganizationDirectory createSignal={newOrgSignal} organizations={organizations} contacts={contacts} available={registryReady} onChanged={load} onAddContact={o=>{startAdd();setForm(f=>({...f,org:o.name,partner_organization_id:o.id}))}} onOpenContact={id=>{setView('contacts');openDetail(id)}}/>:<>
    {/* Filters */}
    <div className="flex gap-2 mb-2">
      <div className="flex-1 flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-[10px] px-3 py-2">
        <span className="text-[#94A3B8]">🔍</span>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="חיפוש..." className="flex-1 text-sm bg-transparent outline-none"/>
        {q&&<button onClick={()=>setQ("")} className="text-[#94A3B8] text-xs">✕</button>}
      </div>
    </div>
    <div className="flex gap-2 mb-3 overflow-x-auto">
      <select value={fType} onChange={e=>setFType(e.target.value)} className="px-2 py-2 border border-[#E2E8F0] rounded-[10px] text-xs bg-white flex-shrink-0">
        <option value="">כל הסוגים</option>
        {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <select value={fStatus} onChange={e=>setFStatus(e.target.value)} className="px-2 py-2 border border-[#E2E8F0] rounded-[10px] text-xs bg-white flex-shrink-0">
        <option value="">כל הסטטוסים</option>
        {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      {owners.length>1&&<select value={fOwner} onChange={e=>setFOwner(e.target.value)} className="px-2 py-2 border border-[#E2E8F0] rounded-[10px] text-xs bg-white flex-shrink-0">
        <option value="">כל האחראים</option>
        {owners.map(o=><option key={o} value={o}>{o}</option>)}
      </select>}
      {hasFilters&&<button onClick={clearFilters} className="px-2 py-2 text-xs text-[#00488D] font-semibold flex-shrink-0">נקה סינון</button>}
    </div>

    {/* Add/Edit form */}
    <Sheet open={showForm} onClose={()=>setShowForm(false)} title={editId?"עריכת איש קשר":"איש קשר חדש"} subtitle="שיוך לעמותה או מוסד קיימים מהמאגר" labelledBy="coord-contact-form">
      <div className="space-y-2">
        <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="שם מלא *" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
        <div className="grid grid-cols-2 gap-2">
          <label className="partner-coord-org-select">עמותה / מוסד *<select aria-label="בחירת עמותה או מוסד קיימים" value={form.partner_organization_id||''} disabled={!registryReady} onChange={e=>{const o=organizations.find(o=>String(o.id)===e.target.value);setForm(f=>({...f,org:o?.name||'',partner_organization_id:o?.id||null}))}}><option value="">בחירת ארגון קיים</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><small>את פרטי הארגון מנהלים בלשונית עמותות ומוסדות.</small></label>
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
    </Sheet>

    {/* Detail panel */}
    <Sheet open={!!openId} onClose={closeDetail} title={detail?.contact?.name||"פרטי איש קשר"} subtitle={detail?.contact?[detail.contact.role,detail.contact.org].filter(Boolean).join(" · "):undefined} labelledBy="coord-contact-detail">
    {!detail?.contact?<div className="text-sm text-[#62756E] text-center py-8">טוען…</div>:<div>
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
          {detail.contact.phone&&<div className="text-xs text-[#64748B] mt-1">📞 <a href={`tel:${detail.contact.phone}`} className="underline">{detail.contact.phone}</a></div>}
          {detail.contact.email&&<div className="text-xs text-[#64748B] mt-0.5">✉️ {detail.contact.email}</div>}
          {detail.contact.notes&&<div className="text-xs text-[#475569] mt-1.5 bg-[#F9FAFB] rounded p-1.5">{detail.contact.notes}</div>}
        </div>
        <div className="flex gap-1.5">
          <button onClick={()=>startEdit(detail.contact)} className="px-2 py-1 rounded-[7px] border border-[#E2E8F0] text-xs hover:bg-[#F0F7FF]">✎</button>
          
        </div>
      </div>

      {/* Contact actions */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {detail.contact.phone?<a href={`tel:${detail.contact.phone}`} className="py-2.5 rounded-[10px] text-xs font-bold border border-[#E2E8F0] text-center">חיוג</a>:<span/>}
        {detail.contact.phone?<a href={`https://wa.me/972${String(detail.contact.phone).replace(/^0/,"").replace(/[^0-9]/g,"")}`} target="_blank" rel="noopener noreferrer" className="py-2.5 rounded-[10px] text-xs font-bold border border-[#E2E8F0] text-center">WhatsApp</a>:<span/>}
      </div>
      {Number(detail.contact.coordinator_id)===Number(coordId)&&<button onClick={()=>setLinkFor(detail.contact)} className="w-full py-2.5 mb-2 rounded-[10px] text-xs font-bold border border-[#21634F] text-[#21634F]">↗ לינק אישי דרך השותף</button>}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={()=>{setShowInt(v=>!v);setShowTask(false)}} className={`py-2 rounded-[10px] text-xs font-bold border ${showInt?"bg-[#0D2744] text-white border-[#0D2744]":"bg-white text-[#0D2744] border-[#CBD5E1]"}`}>📝 תעד אינטראקציה</button>
        <button onClick={()=>showTask?setShowTask(false):startTask()} className={`py-2 rounded-[10px] text-xs font-bold border ${showTask?"bg-[#00488D] text-white border-[#00488D]":"bg-white text-[#00488D] border-[#BFDBFE]"}`}>✅ הוסף משימה</button>
      </div>

      {/* Task form */}
      {showTask&&<div className="bg-[#EFF6FF] rounded-[10px] p-3 mb-3 space-y-2">
        <input value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} placeholder="כותרת המשימה *" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
        <div className="grid grid-cols-2 gap-2">
          <select value={taskForm.type} onChange={e=>setTaskForm(f=>({...f,type:e.target.value}))} className="px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs bg-white">
            {Object.entries(TASK_TYPE).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={taskForm.due_date} onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))} className="px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
        </div>
        <textarea value={taskForm.details} onChange={e=>setTaskForm(f=>({...f,details:e.target.value}))} rows={2} placeholder="פרטים" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs resize-none focus:outline-none focus:border-[#00488D]"/>
        <div className="flex gap-2">
          <button onClick={saveTask} disabled={saving} className="flex-1 py-1.5 bg-[#00488D] text-white text-xs font-bold rounded-[8px] disabled:opacity-50">{saving?"שומר...":"צור משימה"}</button>
          <button onClick={()=>setShowTask(false)} className="px-3 py-1.5 border border-[#E2E8F0] text-xs rounded-[8px]">ביטול</button>
        </div>
      </div>}

      {/* Open tasks */}
      {(detail.tasks||[]).length>0&&<div className="mb-3">
        <div className="text-xs font-bold text-[#374151] mb-1.5">משימות פתוחות ({detail.tasks.length})</div>
        <div className="space-y-1.5">
          {detail.tasks.map((t:any)=>{
            const late=t.due_date&&t.due_date.slice(0,10)<today
            const accent=late?"#960010":"#00488D"
            return <div key={t.id} style={{borderRight:`3px solid ${accent}`}} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-2 flex items-center gap-2">
              <div onClick={()=>doneTask(t.id)} style={{borderColor:accent,color:accent}} className="w-5 h-5 flex-shrink-0 rounded-[6px] border-2 cursor-pointer flex items-center justify-center text-[10px] font-bold">✓</div>
              <div className="flex-1 min-w-0"><div className="text-xs font-semibold truncate">{t.title}</div>
                <div style={{color:accent}} className="text-[11px] font-semibold">{TASK_TYPE[t.type]||t.type} · {late?"⚠ ":""}{fd(t.due_date?.slice(0,10))}</div></div>
            </div>
          })}
        </div>
      </div>}

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-[#374151]">אינטראקציות ({(detail.interactions||[]).length})</div>
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

      {/* Linked leads — referred by this contact, or from an event they partnered on */}
      <div className="mt-3 pt-3 border-t border-[#E2E8F0]">
        <div className="text-xs font-bold text-[#374151] mb-1.5">לידים משויכים ({(detail.leads||[]).length})</div>
        {(detail.leads||[]).length===0&&<div className="text-xs text-[#94A3B8] text-center py-2">אין לידים משויכים — אפשר לשייך ליד לאיש קשר בטופס הזנת ליד</div>}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {(detail.leads||[]).map((l:any)=><div key={l.id} className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-2">
            <div className="w-7 h-7 rounded-full bg-[#DCFCE7] text-[#166534] flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {(l.name||"").split(" ").map((w:string)=>w[0]).join("").slice(0,2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{l.name}{l.city&&<span className="text-[#94A3B8] font-normal"> · {l.city}</span>}</div>
              <div className="text-[11px] text-[#64748B]">{fd(l.created_at?.slice(0,10))}{l.via==="event"?` · דרך אירוע${l.event_name?`: ${l.event_name}`:""}`:" · הופנה ישירות"}</div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#374151] font-semibold flex-shrink-0">{LEAD_STATUS[l.status]||l.status}</span>
          </div>)}
        </div>
      </div>
    </div>}
    </Sheet>

    {/* List */}
    {pickForInteraction&&<div className="partner-notice" role="status" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:12}}><span>תיעוד קשר: בחרו את איש הקשר, וטופס התיעוד ייפתח בכרטיס שלו.</span><button className="partner-btn" onClick={()=>setPickForInteraction(false)}>ביטול</button></div>}
    <div className="space-y-2">
      {filtered.length===0&&<EmptyState icon="👥" title={hasFilters?"לא נמצאו תוצאות":"אין עדיין אנשי קשר"} hint={hasFilters?"נסה לשנות את הסינון או החיפוש":"כאן מופיעים כל אנשי הקשר של הארגון"} actionLabel={hasFilters?undefined:"+ הוסף איש קשר"} onAction={startAdd} onClearFilters={hasFilters?clearFilters:undefined}/>}
      {filtered.map(c=>{
        const d=ds(c.last_contact); const isOpen=openId===c.id
        const sc=STATUS_COLORS[c.status]||{bg:"#F3F4F6",color:"#374151"}
        return <div key={c.id} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetail(c.id,pickForInteraction);setPickForInteraction(false)}}} onClick={()=>{openDetail(c.id,pickForInteraction);setPickForInteraction(false)}}
          className={`bg-white border rounded-[12px] p-3 flex items-center gap-3 cursor-pointer transition-colors ${isOpen?"border-[#00488D] bg-[#F0F7FF]":d>=30?"border-[#FECACA] bg-[#FFF8F8]":"border-[#E2E8F0]"}`}>
          <div className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">
            {(c.name||"").split(" ").map((w:string)=>w[0]).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{c.name}</div>
            <div className="text-xs text-[#64748B] truncate">{c.org} {c.org&&"· "}{TYPE_LABEL[c.type]||c.type} {c.owner&&`· ${c.owner}`}</div>
            <div className="text-[#f59e0b] text-xs mt-0.5">{"★".repeat(c.potential||1)}{"☆".repeat(3-(c.potential||1))}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <span style={sc} className="px-2 py-0.5 rounded-full text-xs font-semibold">{STATUS_LABEL[c.status]||c.status}</span>
            <div className={`text-xs mt-1 ${d>=30?"text-[#960010] font-semibold":"text-[#94A3B8]"}`}>{fd(c.last_contact)}</div>
          </div>
        </div>
      })}
    </div>
    </>}
    {linkFor&&<ReferralLink coords={coordId?[{id:coordId,name:user?.name,area:(user as any)?.area}]:[]} contacts={contacts.filter(c=>Number(c.coordinator_id)===Number(coordId))} initialContact={{...linkFor,coordinator_id:coordId}} onClose={()=>setLinkFor(null)}/>}
  </div>
}
