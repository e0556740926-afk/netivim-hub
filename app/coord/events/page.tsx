"use client"
import EmptyState from "@/components/ui/EmptyState"
import { useQuickAction } from "@/lib/quick-action"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useToast } from "@/components/ui/Toast"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import EventFormModal from "@/components/events/EventFormModal"
import EventResultsModal from "@/components/events/EventResultsModal"
import EventManageModal from "@/components/events/EventManageModal"
import EventInsightsModal from "@/components/events/EventInsightsModal"
import EventCard from "@/components/events/EventCard"
import { ST, EMPTY_FORM, EMPTY_RESULTS, formFromEvent, duplicateForm, resultsFromEvent, formToBody } from "@/components/events/shared"

/**
 * Coordinator events — the same toolset as the admin screen (full
 * form, debrief, attendees/vendors, duplicate, bulk status, insights,
 * public lead link), scoped to the coordinator's own events. Approval
 * stays with the manager: the coordinator submits and sees "ממתין".
 */
export default function CoordEvents() {
  const { success } = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [coordId, setCoordId] = useState<number|null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [expenses, setExpenses] = useState<Record<number,number>>({})
  const [contacts, setContacts] = useState<any[]>([])
  const [filter, setFilter] = useState("")

  const [showNew, setShowNew] = useState(false)
  const [editId, setEditId] = useState<number|null>(null)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [saving, setSaving] = useState(false)

  const [resultsId, setResultsId] = useState<number|null>(null)
  const [results, setResults] = useState({...EMPTY_RESULTS})
  const [manageId, setManageId] = useState<number|null>(null)

  const [showInsights, setShowInsights] = useState(false)
  const [insights, setInsights] = useState<any>(null)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      if (!user) return
      const [cr, er, ex, ct] = await Promise.all([
        fetch(`/api/coord?user_id=${user.id}`), fetch("/api/events"), fetch("/api/expenses"), fetch("/api/contacts"),
      ])
      const { coord } = await cr.json()
      const cid = coord?.id || null
      setCoordId(cid)
      const { events } = await er.json()
      const { expenses } = await ex.json()
      const { contacts } = await ct.json().catch(()=>({contacts:[]}))
      // Only my own events — the API enforces this on writes; this is the read-side filter.
      setEvents((events||[]).filter((e:any)=>cid && e.coordinator_id===cid))
      setContacts(contacts||[])
      const m: Record<number,number> = {}
      ;(expenses||[]).forEach((e:any)=>{ if(e.event_id) m[e.event_id]=(m[e.event_id]||0)+(+e.amount||0) })
      setExpenses(m)
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(()=>{ if(user) load() },[user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadInsights() {
    setShowInsights(true)
    if (insights) return
    const res = await fetch("/api/events/insights")
    if (res.ok) setInsights(await res.json())
  }

  function openNew() { setEditId(null); setResultsId(null); setForm({...EMPTY_FORM, status:"pending_approval"}); setShowNew(true) }
  function openEdit(e: any) { setEditId(e.id); setForm(formFromEvent(e)); setShowNew(false); setResultsId(null) }
  function duplicateEvent(e: any) { setEditId(null); setForm({...duplicateForm(e), status:"pending_approval"}); setShowNew(true); setResultsId(null) }
  // "+ הוספה" → הצעת אירוע opens the same proposal form.
  useQuickAction(["event"], openNew, !loading)
  function openResults(e: any) { setResultsId(e.id); setResults(resultsFromEvent(e)); setEditId(null); setShowNew(false) }

  async function saveEdit() {
    if (!form.name.trim()) return
    setSaving(true)
    const body = { ...formToBody(form), coordinator_id: coordId }
    const res = editId
      ? await fetch(`/api/events/${editId}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) })
      : await fetch("/api/events", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) })
    setSaving(false)
    if (!res.ok) { success("לא ניתן לשמור — אין הרשאה"); return }
    setEditId(null); setShowNew(false); load()
    success(editId ? "האירוע עודכן" : "האירוע נשלח לאישור")
  }

  async function saveResults() {
    if (!resultsId) return
    setSaving(true)
    await fetch(`/api/events/${resultsId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ results: true, actual_attendees: +results.actual_attendees||0, leads_collected: +results.leads_collected||0, summary: results.summary })
    })
    if (results.follow_up.trim()) {
      await fetch("/api/tasks", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          title: results.follow_up, type: "call", status: "todo", event_id: resultsId, coordinator_id: coordId,
          due_date: new Date(Date.now()+3*24*60*60*1000).toISOString().slice(0,10),
          assignees: user?.name ? [user.name] : []
        })
      })
    }
    setSaving(false); setResultsId(null); load()
    success("התוצאות נשמרו")
  }

  async function deleteEvent(id: number) {
    if (!confirm("למחוק אירוע זה לצמיתות?")) return
    const res = await fetch(`/api/events/${id}`, { method:"DELETE" })
    if (!res.ok) { success("לא ניתן למחוק"); return }
    setEvents(e=>e.filter(x=>x.id!==id))
    if (editId===id) setEditId(null)
    if (resultsId===id) setResultsId(null)
  }

  const filtered = filter ? events.filter(e=>e.status===filter) : events
  const editEvent = events.find(e=>e.id===editId) || null
  const resultsEvent = events.find(e=>e.id===resultsId) || null
  const manageEvent = events.find(e=>e.id===manageId) || null
  const pendingCount = events.filter(e=>e.status==="pending_approval"&&!e.approved).length

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={3}/>)}</div>

  return <div className="p-4 pb-24 max-w-3xl mx-auto fade-up">
    {/* Header */}
    <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
      <div>
        <div className="text-lg font-extrabold">האירועים שלי</div>
        <div className="text-xs text-[#64748B]">{events.length} אירועים{pendingCount>0?` · ${pendingCount} ממתינים לאישור`:""}</div>
      </div>
      <div className="flex gap-2">
        <button onClick={loadInsights} className="px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-[9px] text-sm font-semibold">📊 ביצועים</button>
        <button onClick={openNew} className="px-3 py-1.5 bg-[#0D2744] text-white rounded-[9px] text-sm font-semibold">+ הצע אירוע</button>
      </div>
    </div>
    {!coordId && <div className="text-xs text-[#B45309] bg-[#FEF3C7] rounded-[8px] px-3 py-2 mt-2 mb-3">המשתמש שלך לא מקושר לרשומת רכז — פנה למנהל.</div>}

    <EventInsightsModal open={showInsights} onClose={()=>setShowInsights(false)} insights={insights} mode="coord"/>
    <EventManageModal event={manageEvent} onClose={()=>setManageId(null)} onChanged={load}/>
    <EventFormModal open={showNew || editId !== null} onClose={()=>{setEditId(null);setShowNew(false)}}
      editEvent={editEvent} form={form} setForm={setForm} contacts={contacts} saving={saving} onSave={saveEdit} mode="coord"/>
    <EventResultsModal event={resultsEvent} results={results} setResults={setResults} saving={saving} onSave={saveResults} onClose={()=>setResultsId(null)}/>

    {/* Filter */}
    <div className="flex gap-2 mt-3 mb-3 overflow-x-auto pb-1">
      {(["","pending_approval","planning","approved","marketing","done","cancelled"] as const).map(s=>(
        <button key={s} onClick={()=>setFilter(s)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${filter===s?"bg-[#0D2744] text-white":"bg-white border border-[#E2E8F0] text-[#475569]"}`}>
          {s===""?`הכל (${events.length})`:ST[s]}
        </button>
      ))}
    </div>

    {/* Bulk toolbar — same as admin, minus approval; the API clamps approved/marketing to pending */}
    {selected.size > 0 && (
      <div className="flex items-center gap-2 flex-wrap bg-[#0D2744] text-white rounded-[10px] px-3.5 py-2.5 mb-3">
        <span className="text-sm font-semibold">{selected.size} נבחרו</span>
        <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} className="text-xs px-2 py-1.5 rounded-[7px] bg-white/15 text-white border-none outline-none">
          <option value="" className="text-black">שנה סטטוס ל...</option>
          {["planning","pending_approval","done","cancelled"].map(v=><option key={v} value={v} className="text-black">{ST[v]}</option>)}
        </select>
        <button disabled={!bulkStatus||bulkBusy} onClick={async ()=>{
            setBulkBusy(true)
            await fetch("/api/events/bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ ids:[...selected], action:"status", status:bulkStatus })})
            setBulkBusy(false); setSelected(new Set()); setBulkStatus(""); success("הסטטוס עודכן"); load()
          }} className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white text-[#0D2744] disabled:opacity-40">{bulkBusy?"מעדכן...":"החל"}</button>
        <button disabled={bulkBusy} onClick={async ()=>{
            if (!confirm(`למחוק ${selected.size} אירועים?`)) return
            setBulkBusy(true)
            await fetch("/api/events/bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ ids:[...selected], action:"delete" })})
            setBulkBusy(false); setSelected(new Set()); success("נמחקו"); load()
          }} className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white/15 hover:bg-white/25">מחק</button>
        <button onClick={()=>setSelected(new Set())} className="mr-auto text-xs text-white/60 hover:text-white">נקה בחירה</button>
      </div>
    )}

    {/* Events list */}
    <div className="space-y-3">
      {filtered.length===0 && <EmptyState icon="📅" title={filter?"אין אירועים בסטטוס זה":"אין אירועים"} hint={filter?undefined:"תוכל להציע אירוע חדש — הוא יישלח לאישור המנהל"} actionLabel={filter?undefined:"+ הצע אירוע"} onAction={openNew} onClearFilters={filter?()=>setFilter(""):undefined}/>}
      {filtered.map(e=>(
        <EventCard key={e.id} e={e} spent={expenses[e.id]||0}
          isEditing={editId===e.id} isResults={resultsId===e.id}
          selected={selected.has(e.id)}
          onToggleSelect={()=>{ const next=new Set(selected); next.has(e.id)?next.delete(e.id):next.add(e.id); setSelected(next) }}
          onEdit={()=>editId===e.id?setEditId(null):openEdit(e)}
          onResults={()=>resultsId===e.id?setResultsId(null):openResults(e)}
          onManage={()=>setManageId(e.id)}
          onDuplicate={()=>duplicateEvent(e)}
          onDelete={()=>deleteEvent(e.id)}/>
      ))}
    </div>
  </div>
}
