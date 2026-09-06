"use client"
import Pagination, { usePagination } from "@/components/ui/Pagination"
import { useSort, Th } from "@/components/ui/SortableTable"
import { useUrlState } from "@/lib/use-url-state"
import EmptyState from "@/components/ui/EmptyState"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { fd } from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import ExportButton from "@/components/ui/ExportButton"
import Badge from "@/components/ui/Badge"
import { SkeletonTable } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useToast } from "@/components/ui/Toast"

const STATUS_LABEL: Record<string,string> = {
  new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי"
}
const STATUS_COLORS: Record<string,{bg:string,color:string}> = {
  new:{bg:"#DBEAFE",color:"#1E40AF"},
  contacted:{bg:"#DCFCE7",color:"#166534"},
  advanced:{bg:"#EDE9FE",color:"#5B21B6"},
  irrelevant:{bg:"#FEE2E2",color:"#991B1B"}
}
const EMPTY_FORM = { firstName:"", lastName:"", phone:"", age:"", idNumber:"", notes:"", coordinator_id:"", owner_name:"", eventId:"", leadSourceId:"", arrivalChannelId:"" }

export default function AdminLeads() {
  const router = useRouter()
  const { success, undoable } = useToast()
  const [leads, setLeads] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [leadSources, setLeadSources] = useState<any[]>([])
  const [arrivalChannels, setArrivalChannels] = useState<any[]>([])
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkTarget, setBulkTarget] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [dupWarning, setDupWarning] = useState<any>(null)
  const [liveDupMatches, setLiveDupMatches] = useState<any[]>([])
  const [filterCoord, setFilterCoord] = useUrlState("coord")
  const [filterStatus, setFilterStatus] = useUrlState("status")
  const [q, setQ] = useUrlState("q")

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
      setEvents((events||[]).filter((e:any)=>["approved","marketing","done"].includes(e.status)))
      setAdminUsers(admins||[])
      setLeadSources((lead_sources||[]).filter((s:any)=>s.active))
      setArrivalChannels(arrival_channels||[])
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  // Real-time duplicate warning (upgrade proposal §2.1) — non-blocking,
  // fires while typing so a person notices before even trying to save,
  // separate from the hard block already enforced server-side on submit.
  useEffect(() => {
    const phoneReady = form.phone.replace(/\D/g,"").length >= 9
    const idReady = form.idNumber.length === 9
    if (!phoneReady && !idReady) { setLiveDupMatches([]); return }
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (phoneReady) params.set("phone", form.phone)
      if (idReady) params.set("id_number", form.idNumber)
      fetch(`/api/leads/check-duplicate?${params}`).then(r=>r.json()).then(d=>setLiveDupMatches(d.matches||[]))
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
        age: form.age ? +form.age : null,
        id_number: form.idNumber,
        notes: form.notes,
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

  async function convertToContact(lead: any) {
    const coord = coords.find(c=>c.id===lead.coordinator_id)
    const res = await fetch("/api/leads/convert",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({lead_id:lead.id, coordinator_name:coord?.name||""})
    })
    const d = await res.json()
    if (d.contact_id || d.error) load()
  }

  const filteredRaw = leads.filter(l => {
    if (q && !((l.name||"")+(l.phone||"")).includes(q)) return false
    if (filterCoord && String(l.coordinator_id)!==filterCoord) return false
    if (filterStatus && l.status!==filterStatus) return false
    return true
  })
  const { sorted: filtered, sortKey, sortDir, toggleSort } = useSort(filteredRaw, "created_at", "desc")
  const pg = usePagination(filtered, 50)

  const InputClass = "w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">ניהול לידים</h1>
          <div className="text-sm text-[#64748B] mt-0.5">{leads.length} לידים סה"כ</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportButton type="leads"/>
          <Button onClick={()=>{setShowForm(v=>!v);setErr("");setDupWarning(null)}}>+ הוסף ליד</Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="mb-5 border-2 border-[#00488D]">
          <div className="p-5">
            <div className="text-sm font-bold text-[#00488D] mb-4">הוספת ליד חדש</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold block mb-1">שם פרטי *</label>
                <input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))}
                  placeholder="שם פרטי" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">שם משפחה</label>
                <input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))}
                  placeholder="שם משפחה" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">טלפון *</label>
                <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                  placeholder="050-0000000" type="tel" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">שיוך ל</label>
                <select
                  value={form.coordinator_id ? "coord_"+form.coordinator_id : form.owner_name ? "admin_"+form.owner_name : ""}
                  onChange={e=>{
                    const v = e.target.value
                    if (v.startsWith("coord_")) {
                      setForm(f=>({...f, coordinator_id: v.replace("coord_",""), owner_name:""}))
                    } else if (v.startsWith("admin_")) {
                      setForm(f=>({...f, coordinator_id:"", owner_name: v.replace("admin_","")}))
                    } else {
                      setForm(f=>({...f, coordinator_id:"", owner_name:""}))
                    }
                  }}
                  className={InputClass+" bg-white"}>
                  <option value="">— בחר משתמש —</option>
                  <optgroup label="רכזים">
                    {coords.map((c:any)=><option key={c.id} value={"coord_"+c.id}>{c.name}</option>)}
                  </optgroup>
                  <optgroup label="מנהלים">
                    {adminUsers.map((a:any)=><option key={a.id} value={"admin_"+a.name}>👑 {a.name}</option>)}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">גיל</label>
                <input value={form.age} onChange={e=>setForm(f=>({...f,age:e.target.value}))}
                  placeholder="18" type="number" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">ת.ז</label>
                <input value={form.idNumber} onChange={e=>setForm(f=>({...f,idNumber:e.target.value}))}
                  placeholder="000000000" maxLength={9} className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">מקור פנייה *</label>
                <select value={form.leadSourceId} onChange={e=>setForm(f=>({...f,leadSourceId:e.target.value}))} className={InputClass+" bg-white"}>
                  <option value="">— בחר מקור —</option>
                  {leadSources.map((s:any)=><option key={s.id} value={s.id}>{s.coordinator_id?"רכז: ":""}{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">ערוץ הגעה *</label>
                <select value={form.arrivalChannelId} onChange={e=>setForm(f=>({...f,arrivalChannelId:e.target.value}))} className={InputClass+" bg-white"}>
                  <option value="">— איך הגיע? —</option>
                  {arrivalChannels.map((c:any)=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold block mb-1">נאסף באירוע (לא חובה)</label>
                <select value={form.eventId} onChange={e=>setForm(f=>({...f,eventId:e.target.value}))} className={InputClass+" bg-white"}>
                  <option value="">— לא באירוע —</option>
                  {events.map((ev:any)=><option key={ev.id} value={ev.id}>{ev.name}{ev.date?` (${ev.date.slice(8,10)}.${ev.date.slice(5,7)})`:""}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold block mb-1">הערות</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                  rows={2} placeholder="מידע נוסף..." className={InputClass+" resize-none"}/>
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
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-[9px] px-3 py-1.5">
          <span className="text-[#94A3B8]">🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="שם / טלפון..."
            className="text-sm outline-none bg-transparent w-28"/>
          {q&&<button onClick={()=>setQ("")} className="text-[#94A3B8] text-xs">✕</button>}
        </div>
        <select value={filterCoord} onChange={e=>setFilterCoord(e.target.value)}
          className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הרכזים</option>
          {coords.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-xs text-[#94A3B8]">{filtered.length} רשומות</span>
      </div>

      {/* Bulk actions toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-[#0D2744] text-white rounded-[10px] px-3.5 py-2.5 mb-3">
          <span className="text-sm font-semibold">{selected.size} נבחרו</span>
          <select value={bulkTarget} onChange={e=>setBulkTarget(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-[7px] bg-white/15 text-white border-none outline-none">
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
            <div style={{ overflowX: "auto" }}><table className="w-full text-sm border-collapse">
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
                  {[["שם","name"],["טלפון","phone"],["ת.ז","id_number"],["גיל","age"],
                    ["ציון","score"],["רכז","owner_display"],["סטטוס","status"],
                    ["תאריך","created_at"],["",""]].map(([label,key])=>(
                    <Th key={label||"actions"} label={label} k={key||undefined}
                      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 && (
                  <tr><td colSpan={9}><EmptyState icon="⭐" title={q||filterCoord||filterStatus?"לא נמצאו לידים":"אין עדיין לידים"} hint={q||filterCoord||filterStatus?"נסה לשנות את הסינון":"לידים נכנסים מהלינק האישי של הרכזים, מאירועים, או בהוספה ידנית"} actionLabel={q||filterCoord||filterStatus?undefined:"+ הוסף ליד"} onAction={()=>setShowForm(true)} onClearFilters={q||filterCoord||filterStatus?()=>{setQ("");setFilterCoord("");setFilterStatus("")}:undefined}/></td></tr>
                )}
                {pg.paged.map(l => {
                  const coord = coords.find(c=>c.id===l.coordinator_id)
                  const sc = STATUS_COLORS[l.status]||{bg:"#F3F4F6",color:"#374151"}
                  return (
                    <tr key={l.id} className={`border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] ${selected.has(l.id)?"!bg-[#F0F7FF]":""}`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selected.has(l.id)}
                          onChange={()=>{
                            const next = new Set(selected)
                            next.has(l.id) ? next.delete(l.id) : next.add(l.id)
                            setSelected(next)
                          }}
                          className="accent-[#00488D] w-3.5 h-3.5"/>
                      </td>
                      <td className="px-3 py-2.5">
                        <div onClick={() => router.push(`/admin/cases/${l.id}`)} className="font-semibold text-[#0D2744] cursor-pointer hover:underline hover:text-[#00488D]">{l.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[#475569]">
                        <a href={`https://wa.me/972${l.phone?.replace(/^0/,"").replace(/-/g,"")}`} target="_blank"
                          className="hover:text-[#166534] transition-colors">{l.phone}</a>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94A3B8]">{l.id_number||"—"}</td>
                      <td className="px-3 py-2.5 text-[#475569]">{l.age||"—"}</td>
                      <td className="px-3 py-2.5 font-bold" style={{color:l.score>=8?"#166534":l.score>=5?"#B45309":"#94A3B8"}}>{l.score??"—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[#475569]">{l.owner_display||coord?.name||l.owner_name||"—"}</td>
                      <td className="px-3 py-2.5">
                        <span style={sc} className="px-2 py-0.5 rounded-full text-xs font-semibold">
                          {STATUS_LABEL[l.status]||l.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94A3B8] whitespace-nowrap">{fd(l.created_at?.slice(0,10))}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {l.status==="contacted" && (
                            <button onClick={()=>convertToContact(l)}
                              className="px-2 py-1 rounded-[6px] text-xs bg-[#DBEAFE] text-[#1E40AF] font-semibold hover:bg-[#BFDBFE] whitespace-nowrap">
                              → קשר
                            </button>
                          )}
                          <a href={`https://wa.me/972${l.phone?.replace(/^0/,"").replace(/-/g,"")}`} target="_blank"
                            className="px-2 py-1 rounded-[6px] text-xs bg-[#DCFCE7] text-[#166534] font-semibold hover:bg-[#BBF7D0]">
                            ↗
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </div>
          <div className="hidden md:block">
            <Pagination {...pg} onChange={pg.setPage}/>
          </div>

          {/* Mobile: cards instead of a 9-column table */}
          <div className="md:hidden divide-y divide-[#F1F5F9]">
            {filtered.length === 0 && (
              <EmptyState icon="⭐" title={q||filterCoord||filterStatus?"לא נמצאו לידים":"אין עדיין לידים"}
                hint={q||filterCoord||filterStatus?"נסה לשנות את הסינון":"לידים נכנסים מהלינק האישי של הרכזים, מאירועים, או בהוספה ידנית"}
                actionLabel={q||filterCoord||filterStatus?undefined:"+ הוסף ליד"} onAction={()=>setShowForm(true)}
                onClearFilters={q||filterCoord||filterStatus?()=>{setQ("");setFilterCoord("");setFilterStatus("")}:undefined}/>
            )}
            {pg.paged.map(l => {
              const coord = coords.find(c=>c.id===l.coordinator_id)
              const sc = STATUS_COLORS[l.status]||{bg:"#F3F4F6",color:"#374151"}
              return (
                <div key={l.id} className="p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#0D2744]">{l.name}</div>
                      <div className="text-xs text-[#64748B] mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>{l.phone}</span>
                        {l.age && <span>גיל {l.age}</span>}
                        {l.id_number && <span>ת.ז {l.id_number}</span>}
                      </div>
                      <div className="text-xs text-[#94A3B8] mt-0.5">
                        {l.owner_display||coord?.name||l.owner_name||"ללא שיוך"} · {fd(l.created_at?.slice(0,10))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span style={sc} className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap">
                        {STATUS_LABEL[l.status]||l.status}
                      </span>
                      {l.score!=null && (
                        <span className="text-xs font-bold" style={{color:l.score>=8?"#166534":l.score>=5?"#B45309":"#94A3B8"}}>
                          ★ {l.score}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <a href={`https://wa.me/972${l.phone?.replace(/^0/,"").replace(/-/g,"")}`} target="_blank"
                      className="flex-1 text-center py-1.5 rounded-[8px] text-xs font-semibold bg-[#DCFCE7] text-[#166534]">
                      ↗ וואטסאפ
                    </a>
                    {l.status==="contacted" && (
                      <button onClick={()=>convertToContact(l)}
                        className="flex-1 py-1.5 rounded-[8px] text-xs font-semibold bg-[#DBEAFE] text-[#1E40AF]">
                        → איש קשר
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <Pagination {...pg} onChange={pg.setPage}/>
          </div>
        </Card>
      )}
    </div>
  )
}