"use client"
import SfStatusBadge from "@/components/ui/SfStatusBadge"
import Pagination, { usePagination } from "@/components/ui/Pagination"
import { useSort, Th } from "@/components/ui/SortableTable"
import { useUrlState } from "@/lib/use-url-state"
import { useQuickAction } from "@/lib/quick-action"
import EmptyState from "@/components/ui/EmptyState"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Modal from "@/components/ui/Modal"
import ExportButton from "@/components/ui/ExportButton"
import AuditHistory from "@/components/ui/AuditHistory"
import { SkeletonTable } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useToast } from "@/components/ui/Toast"

// Field-only lead handling: leads are entered here (or via personal /
// source links) and passed on to Salesforce. No scoring, no case
// management — the record holds exactly what was typed in, and the
// detail dialog lets a manager see and fix every one of those fields.
const STATUS_LABEL: Record<string,string> = {
  new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי"
}
const STATUS_COLORS: Record<string,{bg:string,color:string}> = {
  new:{bg:"#DBEAFE",color:"#1E40AF"},
  contacted:{bg:"#DCFCE7",color:"#166534"},
  advanced:{bg:"#EDE9FE",color:"#5B21B6"},
  irrelevant:{bg:"#FEE2E2",color:"#991B1B"}
}
const SOURCE_LABEL: Record<string,string> = { link:"לינק אישי", event:"אירוע", manual:"הזנה ידנית" }
const INTEREST_LABEL: Record<string,string> = { training:"הכשרה / מסגרת", military:"שירות צבאי", other:"אחר" }

const EMPTY_FORM = { firstName:"", lastName:"", phone:"", email:"", city:"", age:"", idNumber:"", notes:"", coordinator_id:"", owner_name:"", eventId:"", leadSourceId:"", arrivalChannelId:"", isParent:false }

type EditForm = {
  name:string; phone:string; email:string; city:string; age:string; id_number:string;
  interest:string; status:string; source:string; event_id:string; lead_source_id:string;
  arrival_channel_id:string; assign:string; is_parent:boolean; notes:string
}

function monthKey(d?: string) { return d ? d.slice(0,7) : "" }
function waLink(phone?: string) { return `https://wa.me/972${(phone||"").replace(/^0/,"").replace(/-/g,"")}` }

export default function AdminLeads() {
  const { success, undoable } = useToast()
  const [leads, setLeads] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [leadSources, setLeadSources] = useState<any[]>([])
  const [arrivalChannels, setArrivalChannels] = useState<any[]>([])
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkTarget, setBulkTarget] = useState("")
  const [bulkStatus, setBulkStatus] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  // "+ הוספה" → ליד חדש opens the existing add form and brings it into view.
  useQuickAction(["lead"], () => {
    setErr(""); setDupWarning(null); setShowForm(true)
    setTimeout(() => document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60)
  })
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [dupWarning, setDupWarning] = useState<any>(null)
  const [liveDupMatches, setLiveDupMatches] = useState<any[]>([])
  const [filterCoord, setFilterCoord] = useUrlState("coord")
  const [filterStatus, setFilterStatus] = useUrlState("status")
  const [filterSource, setFilterSource] = useUrlState("source")
  const [filterMonth, setFilterMonth] = useUrlState("month")
  const [q, setQ] = useUrlState("q")

  // Detail dialog
  const [openLead, setOpenLead] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<EditForm | null>(null)
  const [editErr, setEditErr] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [lr, ua, er, lsr, acr] = await Promise.all([
        fetch("/api/leads"), fetch("/api/users/all"), fetch("/api/events"), fetch("/api/admin/lead-sources"), fetch("/api/arrival-channels")
      ])
      const { leads } = await lr.json()
      const { coordinators, admins } = await ua.json()
      const { events } = await er.json()
      const { lead_sources } = await lsr.json()
      const { arrival_channels } = await acr.json()
      setLeads(leads||[])
      setCoords(coordinators||[])
      setEvents(events||[])
      setAdminUsers(admins||[])
      setLeadSources(lead_sources||[])
      setArrivalChannels(arrival_channels||[])
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])
  // Deep link from dashboard / coordinator card: /admin/leads?open=<id>
  useEffect(() => {
    if (typeof window === "undefined" || !leads.length) return
    const id = Number(new URLSearchParams(window.location.search).get("open"))
    const l = id ? leads.find((x: any) => x.id === id) : null
    if (l && !openLead) openDetail(l)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads])

  // Live duplicate warning while typing a new lead — non-blocking; the
  // server still enforces the hard block on submit.
  useEffect(() => {
    const phoneReady = form.phone.replace(/\D/g,"").length >= 9
    const idReady = form.idNumber.length === 9
    if (!phoneReady && !idReady) { setLiveDupMatches([]); return }
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (phoneReady) params.set("phone", form.phone)
      if (idReady) params.set("id_number", form.idNumber)
      fetch(`/api/leads/check-duplicate?${params}`).then(r=>r.json()).then(d=>setLiveDupMatches(d.matches||[])).catch(()=>{})
    }, 500)
    return () => clearTimeout(t)
  }, [form.phone, form.idNumber])

  async function addLead() {
    if (!form.firstName||!form.phone) { setErr("שם פרטי וטלפון הם שדות חובה"); return }
    if (!form.coordinator_id && !form.owner_name) { setErr("יש לבחור את מי לשייך את הליד"); return }
    if (!form.leadSourceId) { setErr("יש לבחור מקור פנייה"); return }
    if (!form.arrivalChannelId) { setErr("יש לבחור ערוץ הגעה"); return }
    setErr(""); setDupWarning(null); setSaving(true)
    const fullName = `${form.firstName} ${form.lastName}`.trim()
    const res = await fetch("/api/leads",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        coordinator_id: form.coordinator_id ? +form.coordinator_id : null,
        owner_name: form.owner_name||"",
        name: fullName,
        phone: form.phone,
        email: form.email,
        city: form.city,
        age: form.age ? +form.age : null,
        id_number: form.idNumber,
        notes: form.notes,
        is_parent: form.isParent,
        event_id: form.eventId || null,
        lead_source_id: +form.leadSourceId,
        arrival_channel_id: +form.arrivalChannelId,
        source: form.eventId ? "event" : "manual"
      })
    })
    const d = await res.json()
    setSaving(false)
    if (d.error==="כפילות") { setDupWarning(d.duplicate); return }
    if (d.error) { setErr(d.error); return }
    setForm({...EMPTY_FORM}); setShowForm(false); load()
    success("הליד נוסף")
  }

  function openDetail(l: any) {
    setOpenLead(l); setEditing(false); setEditErr("")
    setEdit({
      name: l.name||"", phone: l.phone||"", email: l.email||"", city: l.city||"",
      age: l.age ?? "", id_number: l.id_number||"", interest: l.interest||"training",
      status: l.status||"new", source: l.source||"manual",
      event_id: l.event_id ? String(l.event_id) : "",
      lead_source_id: l.lead_source_id ? String(l.lead_source_id) : "",
      arrival_channel_id: l.arrival_channel_id ? String(l.arrival_channel_id) : "",
      assign: l.coordinator_id ? "coord_"+l.coordinator_id : l.owner_name ? "admin_"+l.owner_name : "",
      is_parent: !!l.is_parent, notes: l.notes||"",
    })
  }

  async function saveEdit() {
    if (!openLead || !edit) return
    if (!edit.name.trim() || !edit.phone.trim()) { setEditErr("שם וטלפון הם שדות חובה"); return }
    setEditErr(""); setEditSaving(true)
    const isCoord = edit.assign.startsWith("coord_")
    const body = {
      id: openLead.id,
      name: edit.name, phone: edit.phone, email: edit.email, city: edit.city,
      age: edit.age === "" ? null : +edit.age, id_number: edit.id_number,
      interest: edit.interest, status: edit.status, source: edit.source,
      event_id: edit.event_id || null,
      lead_source_id: edit.lead_source_id || null,
      arrival_channel_id: edit.arrival_channel_id || null,
      coordinator_id: isCoord ? +edit.assign.replace("coord_","") : null,
      owner_name: edit.assign.startsWith("admin_") ? edit.assign.replace("admin_","") : "",
      is_parent: edit.is_parent, notes: edit.notes,
    }
    const res = await fetch("/api/leads",{ method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) })
    const d = await res.json()
    setEditSaving(false)
    if (d.error==="כפילות") { setEditErr(`טלפון / ת.ז כבר קיימים אצל ${d.duplicate?.name||"ליד אחר"}`); return }
    if (d.error) { setEditErr(d.error); return }
    success("הליד עודכן")
    setEditing(false)
    await load()
    // keep the dialog open on the refreshed record
    setOpenLead((prev: any) => prev ? { ...prev, ...d.lead,
      owner_display: isCoord ? coords.find(c=>c.id===+edit.assign.replace("coord_",""))?.name : body.owner_name,
      event_name: events.find(e=>String(e.id)===edit.event_id)?.name || null,
      lead_source_label: leadSources.find(s=>String(s.id)===edit.lead_source_id)?.label || null,
      arrival_channel_label: arrivalChannels.find(c=>String(c.id)===edit.arrival_channel_id)?.label || null,
    } : prev)
  }

  async function quickStatus(l: any, status: string) {
    await fetch("/api/leads",{ method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:l.id, status }) })
    setLeads(ls => ls.map(x => x.id===l.id ? {...x, status} : x))
    if (openLead?.id===l.id) setOpenLead((p:any)=>({...p, status}))
  }

  async function deleteLead(l: any) {
    const res = await fetch("/api/leads",{ method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:l.id }) })
    const d = await res.json()
    setOpenLead(null)
    setLeads(ls => ls.filter(x => x.id!==l.id))
    if (d.soft) {
      undoable(`${l.name} נמחק`, async () => {
        await fetch("/api/leads",{ method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:l.id, restore:true }) })
        load()
      })
    } else success("הליד נמחק")
  }

  const months = Array.from(new Set(leads.map(l => monthKey(l.created_at)).filter(Boolean))).sort().reverse()
  const hasFilters = !!(q||filterCoord||filterStatus||filterSource||filterMonth)
  const clearFilters = () => { setQ(""); setFilterCoord(""); setFilterStatus(""); setFilterSource(""); setFilterMonth("") }

  const filteredRaw = leads.filter(l => {
    if (q && !((l.name||"")+(l.phone||"")+(l.email||"")+(l.city||"")).includes(q)) return false
    if (filterCoord) {
      if (filterCoord.startsWith("admin_")) { if (l.coordinator_id || l.owner_name!==filterCoord.replace("admin_","")) return false }
      else if (String(l.coordinator_id)!==filterCoord) return false
    }
    if (filterStatus && l.status!==filterStatus) return false
    if (filterSource && String(l.lead_source_id)!==filterSource) return false
    if (filterMonth && monthKey(l.created_at)!==filterMonth) return false
    return true
  })
  const { sorted: filtered, sortKey, sortDir, toggleSort } = useSort(filteredRaw, "created_at", "desc")
  const pg = usePagination(filtered, 50)

  const thisMonth = monthKey(new Date().toISOString())
  const countThisMonth = leads.filter(l => monthKey(l.created_at)===thisMonth).length

  const InputClass = "w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>

  function assignSelect(value: string, onChange: (v: string) => void, cls = InputClass+" bg-white") {
    return (
      <select value={value} onChange={e=>onChange(e.target.value)} className={cls}>
        <option value="">— ללא שיוך —</option>
        <optgroup label="רכזים">
          {coords.map((c:any)=><option key={c.id} value={"coord_"+c.id}>{c.name}</option>)}
        </optgroup>
        <optgroup label="מנהלים">
          {adminUsers.map((a:any)=><option key={a.id} value={"admin_"+a.name}>👑 {a.name}</option>)}
        </optgroup>
      </select>
    )
  }

  const Field = ({ label, children, span }: { label:string; children:React.ReactNode; span?:boolean }) => (
    <div className={span ? "sm:col-span-2" : ""}>
      <div className="text-[11px] font-semibold text-[#64748B] mb-0.5">{label}</div>
      <div className="text-sm text-[#0D2744] break-words">{children ?? "—"}</div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">לידים</h1>
          <div className="text-sm text-[#64748B] mt-0.5">{leads.length} לידים סה&quot;כ · {countThisMonth} החודש</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportButton type="leads"/>
          <Button onClick={()=>{setShowForm(v=>!v);setErr("");setDupWarning(null)}}>+ הוסף ליד</Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div id="lead-form" className="scroll-mt-20"><Card className="mb-5 border-2 border-[#00488D]">
          <div className="p-5">
            <div className="text-sm font-bold text-[#00488D] mb-4">הוספת ליד חדש</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold block mb-1">שם פרטי *</label>
                <input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="שם פרטי" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">שם משפחה</label>
                <input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="שם משפחה" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">טלפון *</label>
                <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="050-0000000" type="tel" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">אימייל</label>
                <input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="name@example.com" type="email" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">שיוך ל *</label>
                {assignSelect(
                  form.coordinator_id ? "coord_"+form.coordinator_id : form.owner_name ? "admin_"+form.owner_name : "",
                  v => setForm(f => ({ ...f,
                    coordinator_id: v.startsWith("coord_") ? v.replace("coord_","") : "",
                    owner_name: v.startsWith("admin_") ? v.replace("admin_","") : "" }))
                )}
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">עיר</label>
                <input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} placeholder="עיר מגורים" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">גיל</label>
                <input value={form.age} onChange={e=>setForm(f=>({...f,age:e.target.value}))} placeholder="18" type="number" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">ת.ז</label>
                <input value={form.idNumber} onChange={e=>setForm(f=>({...f,idNumber:e.target.value}))} placeholder="000000000" maxLength={9} className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">מקור פנייה *</label>
                <select value={form.leadSourceId} onChange={e=>setForm(f=>({...f,leadSourceId:e.target.value}))} className={InputClass+" bg-white"}>
                  <option value="">— בחר מקור —</option>
                  {leadSources.filter((s:any)=>s.active).map((s:any)=><option key={s.id} value={s.id}>{s.coordinator_id?"רכז: ":""}{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">ערוץ הגעה *</label>
                <select value={form.arrivalChannelId} onChange={e=>setForm(f=>({...f,arrivalChannelId:e.target.value}))} className={InputClass+" bg-white"}>
                  <option value="">— איך הגיע? —</option>
                  {arrivalChannels.map((c:any)=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">נאסף באירוע (לא חובה)</label>
                <select value={form.eventId} onChange={e=>setForm(f=>({...f,eventId:e.target.value}))} className={InputClass+" bg-white"}>
                  <option value="">— לא באירוע —</option>
                  {events.filter((e:any)=>["approved","marketing","done"].includes(e.status)).map((ev:any)=><option key={ev.id} value={ev.id}>{ev.name}{ev.date?` (${ev.date.slice(8,10)}.${ev.date.slice(5,7)})`:""}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm mt-5 cursor-pointer">
                <input type="checkbox" checked={form.isParent} onChange={e=>setForm(f=>({...f,isParent:e.target.checked}))} className="accent-[#00488D] w-4 h-4"/>
                הפונה הוא הורה
              </label>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold block mb-1">הערות</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} placeholder="מידע נוסף..." className={InputClass+" resize-none"}/>
              </div>
            </div>
            {dupWarning && (
              <div className="bg-[#FEF3C7] text-[#B45309] rounded-[9px] px-3 py-2.5 text-xs font-semibold mb-3">
                ⚠️ מספר זה כבר קיים — {dupWarning.name}. הליד לא נוצר.
              </div>
            )}
            {!dupWarning && liveDupMatches.length > 0 && (
              <div className="bg-[#FEF3C7] text-[#B45309] rounded-[9px] px-3 py-2.5 text-xs font-semibold mb-3">
                ⚠️ נמצאה התאמה אפשרית: {liveDupMatches.map((m:any)=>m.name).join(", ")} — בדוק שזה לא אותו אדם לפני שמירה
              </div>
            )}
            {err && <div className="text-xs text-[#960010] mb-3 font-semibold">{err}</div>}
            <div className="flex gap-2">
              <Button onClick={addLead} disabled={saving}>{saving?"שומר...":"הוסף ליד"}</Button>
              <Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button>
            </div>
          </div>
        </Card></div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-[9px] px-3 py-1.5">
          <span className="text-[#94A3B8]">🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="שם / טלפון / עיר..." className="text-sm outline-none bg-transparent w-36"/>
          {q&&<button onClick={()=>setQ("")} className="text-[#94A3B8] text-xs">✕</button>}
        </div>
        <select value={filterCoord} onChange={e=>setFilterCoord(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל השיוכים</option>
          <optgroup label="רכזים">{coords.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}</optgroup>
          <optgroup label="מנהלים">{adminUsers.map((a:any)=><option key={a.id} value={"admin_"+a.name}>👑 {a.name}</option>)}</optgroup>
        </select>
        <select value={filterSource} onChange={e=>setFilterSource(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל המקורות</option>
          {leadSources.map((s:any)=><option key={s.id} value={String(s.id)}>{s.label}</option>)}
        </select>
        <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל החודשים</option>
          {months.map(m=><option key={m} value={m}>{m.slice(5,7)}/{m.slice(0,4)}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-xs text-[#94A3B8]">{filtered.length} רשומות</span>
        {hasFilters && <button onClick={clearFilters} className="text-xs text-[#00488D] font-semibold">נקה סינון</button>}
      </div>

      {/* Bulk actions toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-[#0D2744] text-white rounded-[10px] px-3.5 py-2.5 mb-3">
          <span className="text-sm font-semibold">{selected.size} נבחרו</span>
          <select value={bulkTarget} onChange={e=>setBulkTarget(e.target.value)} className="text-xs px-2 py-1.5 rounded-[7px] bg-white/15 text-white border-none outline-none">
            <option value="" className="text-black">שייך ל...</option>
            <optgroup label="רכזים" className="text-black">
              {coords.map((c:any)=><option key={c.id} value={"coord_"+c.id} className="text-black">{c.name}</option>)}
            </optgroup>
            <optgroup label="מנהלים" className="text-black">
              {adminUsers.map((a:any)=><option key={a.id} value={"admin_"+a.name} className="text-black">👑 {a.name}</option>)}
            </optgroup>
          </select>
          <button disabled={!bulkTarget||bulkBusy} onClick={async ()=>{
              setBulkBusy(true)
              const isCoord = bulkTarget.startsWith("coord_")
              await fetch("/api/leads/bulk",{method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({ ids:[...selected], action:"assign",
                  coordinator_id: isCoord ? +bulkTarget.replace("coord_","") : undefined,
                  owner_name: isCoord ? undefined : bulkTarget.replace("admin_","") })})
              setBulkBusy(false); setSelected(new Set()); setBulkTarget(""); success("השיוך עודכן"); load()
            }}
            className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white text-[#0D2744] disabled:opacity-40">
            {bulkBusy?"מעדכן...":"החל שיוך"}
          </button>
          <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} className="text-xs px-2 py-1.5 rounded-[7px] bg-white/15 text-white border-none outline-none">
            <option value="" className="text-black">סטטוס...</option>
            {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v} className="text-black">{l}</option>)}
          </select>
          <button disabled={!bulkStatus||bulkBusy} onClick={async ()=>{
              setBulkBusy(true)
              await fetch("/api/leads/bulk",{method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({ ids:[...selected], action:"status", status: bulkStatus })})
              setBulkBusy(false); setSelected(new Set()); setBulkStatus(""); success("הסטטוס עודכן"); load()
            }}
            className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white text-[#0D2744] disabled:opacity-40">
            החל סטטוס
          </button>
          <button disabled={bulkBusy} onClick={async ()=>{
              if (!confirm(`למחוק ${selected.size} לידים?`)) return
              setBulkBusy(true)
              await fetch("/api/leads/bulk",{method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({ ids:[...selected], action:"delete" })})
              setBulkBusy(false); setSelected(new Set()); success("הלידים נמחקו"); load()
            }}
            className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white/15 hover:bg-white/25">
            מחק
          </button>
          <button onClick={()=>setSelected(new Set())} className="mr-auto text-xs text-white/60 hover:text-white">נקה בחירה</button>
        </div>
      )}

      {/* Table */}
      {loading ? <SkeletonTable rows={6} cols={6}/> : (
        <Card>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox"
                      checked={pg.paged.length>0 && pg.paged.every(l=>selected.has(l.id))}
                      onChange={e=>{
                        const next = new Set(selected)
                        pg.paged.forEach(l=> e.target.checked ? next.add(l.id) : next.delete(l.id))
                        setSelected(next)
                      }}
                      className="accent-[#00488D] w-3.5 h-3.5"/>
                  </th>
                  {[["שם","name"],["טלפון","phone"],["עיר","city"],["גיל","age"],
                    ["מקור","lead_source_label"],["שיוך","owner_display"],["סטטוס","status"],
                    ["תאריך","created_at"],["",""]].map(([label,key])=>(
                    <Th key={label||"actions"} label={label} k={key||undefined} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 && (
                  <tr><td colSpan={10}><EmptyState icon="⭐" title={hasFilters?"לא נמצאו לידים":"אין עדיין לידים"} hint={hasFilters?"נסה לשנות את הסינון":"לידים נכנסים מהלינק האישי של הרכזים, מלינקים של מקורות, מאירועים, או בהוספה ידנית"} actionLabel={hasFilters?undefined:"+ הוסף ליד"} onAction={()=>setShowForm(true)} onClearFilters={hasFilters?clearFilters:undefined}/></td></tr>
                )}
                {pg.paged.map(l => {
                  const sc = STATUS_COLORS[l.status]||{bg:"#F3F4F6",color:"#374151"}
                  return (
                    <tr key={l.id} className={`border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] ${selected.has(l.id)?"!bg-[#F0F7FF]":""}`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selected.has(l.id)}
                          onChange={()=>{ const next = new Set(selected); next.has(l.id) ? next.delete(l.id) : next.add(l.id); setSelected(next) }}
                          className="accent-[#00488D] w-3.5 h-3.5"/>
                      </td>
                      <td className="px-3 py-2.5">
                        <div onClick={()=>openDetail(l)} className="font-semibold text-[#0D2744] cursor-pointer hover:underline hover:text-[#00488D]">{l.name}</div>
                        {l.is_parent && <span className="text-[10px] text-[#B45309] font-semibold">הורה</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[#475569]">
                        <a href={waLink(l.phone)} target="_blank" className="hover:text-[#166534] transition-colors">{l.phone}</a>
                      </td>
                      <td className="px-3 py-2.5 text-[#475569]">{l.city||"—"}</td>
                      <td className="px-3 py-2.5 text-[#475569]">{l.age||"—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[#475569]">{l.lead_source_label||SOURCE_LABEL[l.source]||"—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[#475569]">{l.owner_display||"—"}</td>
                      <td className="px-3 py-2.5">
                        <select value={l.status} onChange={e=>quickStatus(l, e.target.value)}
                          style={{background:sc.bg,color:sc.color}} className="px-2 py-0.5 rounded-full text-xs font-semibold border-none outline-none cursor-pointer">
                          {Object.entries(STATUS_LABEL).map(([v,lab])=><option key={v} value={v} className="text-black bg-white">{lab}</option>)}
                        </select>
                        <div className="mt-1"><SfStatusBadge lead={l}/></div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94A3B8] whitespace-nowrap">{fd(l.created_at?.slice(0,10))}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <button onClick={()=>openDetail(l)} className="px-2 py-1 rounded-[6px] text-xs bg-[#DBEAFE] text-[#1E40AF] font-semibold hover:bg-[#BFDBFE] whitespace-nowrap">פרטים</button>
                          <a href={waLink(l.phone)} target="_blank" className="px-2 py-1 rounded-[6px] text-xs bg-[#DCFCE7] text-[#166534] font-semibold hover:bg-[#BBF7D0]">↗</a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="hidden md:block">
            <Pagination {...pg} onChange={pg.setPage}/>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden divide-y divide-[#F1F5F9]">
            {filtered.length === 0 && (
              <EmptyState icon="⭐" title={hasFilters?"לא נמצאו לידים":"אין עדיין לידים"}
                hint={hasFilters?"נסה לשנות את הסינון":"לידים נכנסים מהלינק האישי של הרכזים, מאירועים, או בהוספה ידנית"}
                actionLabel={hasFilters?undefined:"+ הוסף ליד"} onAction={()=>setShowForm(true)}
                onClearFilters={hasFilters?clearFilters:undefined}/>
            )}
            {pg.paged.map(l => {
              const sc = STATUS_COLORS[l.status]||{bg:"#F3F4F6",color:"#374151"}
              return (
                <div key={l.id} className="p-3.5" onClick={()=>openDetail(l)}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#0D2744]">{l.name}</div>
                      <div className="text-xs text-[#64748B] mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>{l.phone}</span>
                        {l.city && <span>{l.city}</span>}
                        {l.age && <span>גיל {l.age}</span>}
                      </div>
                      <div className="text-xs text-[#94A3B8] mt-0.5">
                        {l.owner_display||"ללא שיוך"} · {l.lead_source_label||SOURCE_LABEL[l.source]||""} · {fd(l.created_at?.slice(0,10))}
                      </div>
                    </div>
<div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span style={{background:sc.bg,color:sc.color}} className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0">
                      {STATUS_LABEL[l.status]||l.status}
                    </span>
                    <SfStatusBadge lead={l}/>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2.5" onClick={e=>e.stopPropagation()}>
                    <a href={waLink(l.phone)} target="_blank" className="flex-1 text-center py-1.5 rounded-[8px] text-xs font-semibold bg-[#DCFCE7] text-[#166534]">↗ וואטסאפ</a>
                    <button onClick={()=>openDetail(l)} className="flex-1 py-1.5 rounded-[8px] text-xs font-semibold bg-[#DBEAFE] text-[#1E40AF]">פרטים ועריכה</button>
                  </div>
                </div>
              )
            })}
            <Pagination {...pg} onChange={pg.setPage}/>
          </div>
        </Card>
      )}

      {/* Detail / edit dialog — every stored field, exactly as entered */}
      <Modal
        open={!!openLead}
        onClose={()=>setOpenLead(null)}
        title={openLead?.name || ""}
        subtitle={openLead ? `נוצר ${fd(openLead.created_at?.slice(0,10))} · ${SOURCE_LABEL[openLead.source]||openLead.source||""}` : undefined}
        width="680px"
        footer={openLead && (
          editing ? (
            <div className="flex gap-2 w-full justify-between items-center">
              <div className="text-xs text-[#960010] font-semibold">{editErr}</div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={()=>{ setEditing(false); setEditErr(""); openDetail(openLead) }}>ביטול</Button>
                <Button onClick={saveEdit} disabled={editSaving}>{editSaving?"שומר...":"שמור שינויים"}</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 w-full justify-between items-center">
              <button onClick={()=>{ if (confirm(`למחוק את ${openLead.name}?`)) deleteLead(openLead) }} className="text-xs text-[#960010] font-semibold hover:underline">מחק ליד</button>
              <div className="flex gap-2">
                <a href={waLink(openLead.phone)} target="_blank" className="px-3 py-2 rounded-[9px] text-sm font-semibold bg-[#DCFCE7] text-[#166534]">↗ וואטסאפ</a>
                <Button onClick={()=>setEditing(true)}>✎ עריכה</Button>
              </div>
            </div>
          )
        )}
      >
        {openLead && !editing && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <Field label="שם מלא">{openLead.name}</Field>
              <Field label="טלפון"><a href={waLink(openLead.phone)} target="_blank" className="text-[#00488D] hover:underline">{openLead.phone}</a></Field>
              <Field label="אימייל">{openLead.email || "—"}</Field>
              <Field label="עיר">{openLead.city || "—"}</Field>
              <Field label="גיל">{openLead.age || "—"}</Field>
              <Field label="ת.ז">{openLead.id_number || "—"}</Field>
              <Field label="תחום עניין">{INTEREST_LABEL[openLead.interest]||openLead.interest||"—"}</Field>
              <Field label="סטטוס">
                <span style={{background:(STATUS_COLORS[openLead.status]||{bg:"#F3F4F6"}).bg,color:(STATUS_COLORS[openLead.status]||{color:"#374151"}).color}} className="px-2 py-0.5 rounded-full text-xs font-semibold">{STATUS_LABEL[openLead.status]||openLead.status}</span>
              </Field>
              <Field label="סטטוס בסילפרוס">{openLead.sf_status ? <SfStatusBadge lead={openLead} detailed/> : <span className="text-[#94A3B8]">עוד לא סונכרן</span>}</Field>
              <Field label="שיוך">{openLead.owner_display || "ללא שיוך"}</Field>
              <Field label="מקור פנייה">{openLead.lead_source_label || "—"}</Field>
              <Field label="ערוץ הגעה">{openLead.arrival_channel_label || "—"}</Field>
              <Field label="דרך הכניסה למערכת">{SOURCE_LABEL[openLead.source]||openLead.source||"—"}</Field>
              <Field label="נאסף באירוע">{openLead.event_name || "—"}</Field>
              <Field label="הפונה הוא הורה">{openLead.is_parent ? "כן" : "לא"}</Field>
              <Field label="נוצר בתאריך">{fd(openLead.created_at?.slice(0,10))}</Field>
              <Field label="הערות" span>{openLead.notes ? <span className="whitespace-pre-wrap">{openLead.notes}</span> : "—"}</Field>
            </div>
            <AuditHistory entityType="lead" entityId={openLead.id}/>
          </div>
        )}

        {openLead && editing && edit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold block mb-1">שם מלא *</label>
              <input value={edit.name} onChange={e=>setEdit(f=>f&&({...f,name:e.target.value}))} className={InputClass}/></div>
            <div><label className="text-xs font-semibold block mb-1">טלפון *</label>
              <input value={edit.phone} onChange={e=>setEdit(f=>f&&({...f,phone:e.target.value}))} type="tel" className={InputClass}/></div>
            <div><label className="text-xs font-semibold block mb-1">אימייל</label>
              <input value={edit.email} onChange={e=>setEdit(f=>f&&({...f,email:e.target.value}))} type="email" className={InputClass}/></div>
            <div><label className="text-xs font-semibold block mb-1">עיר</label>
              <input value={edit.city} onChange={e=>setEdit(f=>f&&({...f,city:e.target.value}))} className={InputClass}/></div>
            <div><label className="text-xs font-semibold block mb-1">גיל</label>
              <input value={edit.age} onChange={e=>setEdit(f=>f&&({...f,age:e.target.value}))} type="number" className={InputClass}/></div>
            <div><label className="text-xs font-semibold block mb-1">ת.ז</label>
              <input value={edit.id_number} onChange={e=>setEdit(f=>f&&({...f,id_number:e.target.value}))} maxLength={9} className={InputClass}/></div>
            <div><label className="text-xs font-semibold block mb-1">תחום עניין</label>
              <select value={edit.interest} onChange={e=>setEdit(f=>f&&({...f,interest:e.target.value}))} className={InputClass+" bg-white"}>
                {Object.entries(INTEREST_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label className="text-xs font-semibold block mb-1">סטטוס</label>
              <select value={edit.status} onChange={e=>setEdit(f=>f&&({...f,status:e.target.value}))} className={InputClass+" bg-white"}>
                {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label className="text-xs font-semibold block mb-1">שיוך</label>
              {assignSelect(edit.assign, v=>setEdit(f=>f&&({...f,assign:v})))}</div>
            <div><label className="text-xs font-semibold block mb-1">מקור פנייה</label>
              <select value={edit.lead_source_id} onChange={e=>setEdit(f=>f&&({...f,lead_source_id:e.target.value}))} className={InputClass+" bg-white"}>
                <option value="">— ללא —</option>
                {leadSources.map((s:any)=><option key={s.id} value={s.id}>{s.coordinator_id?"רכז: ":""}{s.label}</option>)}
              </select></div>
            <div><label className="text-xs font-semibold block mb-1">ערוץ הגעה</label>
              <select value={edit.arrival_channel_id} onChange={e=>setEdit(f=>f&&({...f,arrival_channel_id:e.target.value}))} className={InputClass+" bg-white"}>
                <option value="">— ללא —</option>
                {arrivalChannels.map((c:any)=><option key={c.id} value={c.id}>{c.label}</option>)}
              </select></div>
            <div><label className="text-xs font-semibold block mb-1">דרך הכניסה למערכת</label>
              <select value={edit.source} onChange={e=>setEdit(f=>f&&({...f,source:e.target.value}))} className={InputClass+" bg-white"}>
                {Object.entries(SOURCE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label className="text-xs font-semibold block mb-1">נאסף באירוע</label>
              <select value={edit.event_id} onChange={e=>setEdit(f=>f&&({...f,event_id:e.target.value}))} className={InputClass+" bg-white"}>
                <option value="">— לא באירוע —</option>
                {events.map((ev:any)=><option key={ev.id} value={ev.id}>{ev.name}{ev.date?` (${ev.date.slice(8,10)}.${ev.date.slice(5,7)})`:""}</option>)}
              </select></div>
            <label className="flex items-center gap-2 text-sm mt-5 cursor-pointer">
              <input type="checkbox" checked={edit.is_parent} onChange={e=>setEdit(f=>f&&({...f,is_parent:e.target.checked}))} className="accent-[#00488D] w-4 h-4"/>
              הפונה הוא הורה
            </label>
            <div className="sm:col-span-2"><label className="text-xs font-semibold block mb-1">הערות</label>
              <textarea value={edit.notes} onChange={e=>setEdit(f=>f&&({...f,notes:e.target.value}))} rows={3} className={InputClass+" resize-none"}/></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
