"use client"
import { uiMutation } from "@/lib/ui-request"
import WorkspaceHeader from "@/components/ui/WorkspaceHeader"
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
  const { success, error: showError } = useToast()
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
  const [manageTab,setManageTab]=useState<"attendees"|"registration">("attendees")

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
    if (!form.name.trim() || saving) return
    setSaving(true)
    try {
      await uiMutation(editId ? `/api/events/${editId}` : "/api/events", editId ? "PATCH" : "POST", { ...formToBody(form), coordinator_id: coordId })
      setEditId(null); setShowNew(false)
      success(editId ? "האירוע עודכן" : "האירוע נשלח לאישור")
      await load()
    } catch(e) { showError(e instanceof Error ? e.message : "האירוע לא נשמר") }
    finally { setSaving(false) }
  }

  async function saveResults() {
    if (!resultsId || saving) return
    setSaving(true)
    try {
      await uiMutation(`/api/events/${resultsId}`, "PATCH", { results:true, actual_attendees:+results.actual_attendees||0, leads_collected:+results.leads_collected||0, summary:results.summary })
      let followUpFailed = false
      if(results.follow_up.trim()) {
        try {

          await uiMutation("/api/tasks", "POST", { title:results.follow_up, type:"call", status:"todo", event_id:resultsId, coordinator_id:coordId,
            due_date:new Date(Date.now()+3*24*60*60*1000).toLocaleDateString("en-CA",{timeZone:"Asia/Jerusalem"}),
            assignees:user?.name ? [user.name] : [] })
        } catch { followUpFailed = true; showError("התוצאות נשמרו, אך לא התקבל אישור ליצירת משימת המעקב. בדקו במסך המשימות לפני ניסיון נוסף.") }
      }
      setResultsId(null)
      if(!followUpFailed) success("התוצאות נשמרו")
      await load()
    } catch(e) { showError(e instanceof Error ? e.message : "התוצאות לא נשמרו") }
    finally { setSaving(false) }
  }

  async function deleteEvent(id:number) {
    const event = events.find(e=>e.id===id)
    if(!confirm(`למחוק לצמיתות את האירוע "${event?.name||id}"?`)) return
    try { await uiMutation(`/api/events/${id}`,"DELETE");setEvents(list=>list.filter(e=>e.id!==id));setSelected(list=>{const next=new Set(list);next.delete(id);return next});if(editId===id)setEditId(null);if(resultsId===id)setResultsId(null);success("האירוע נמחק") }
    catch(e) { showError(e instanceof Error?e.message:"המחיקה לא הושלמה") }
  }

  async function applyBulk(action:"status"|"delete") {
    if(bulkBusy || !selected.size || (action==="status"&&!bulkStatus)) return
    if(action==="delete"&&!confirm(`למחוק לצמיתות ${selected.size} אירועים שנבחרו?`))return
    setBulkBusy(true)
    try { await uiMutation("/api/events/bulk","POST",{ids:[...selected],action,...(action==="status"?{status:bulkStatus}:{})});setSelected(new Set());setBulkStatus("");success(action==="status"?"הסטטוס עודכן":"האירועים נמחקו");await load() }
    catch(e) { showError(e instanceof Error?e.message:"העדכון לא הושלם") }
    finally { setBulkBusy(false) }
  }

  const filtered = filter ? events.filter(e=>e.status===filter) : events
  const editEvent = events.find(e=>e.id===editId) || null
  const resultsEvent = events.find(e=>e.id===resultsId) || null
  const manageEvent = events.find(e=>e.id===manageId) || null
  const pendingCount = events.filter(e=>e.status==="pending_approval"&&!e.approved).length

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={3}/>)}</div>

  return <div className="ui-page ui-personal fade-up">
    <WorkspaceHeader title="האירועים שלי" description={events.length + " אירועים · " + pendingCount + " ממתינים לאישור"} actions={<><button className="ui-btn" onClick={loadInsights}>ביצועים</button><button className="ui-btn ui-btn-primary" onClick={openNew}>+ הצעת אירוע</button></>}/>
    {!coordId && <div className="text-xs text-[#946014] bg-[#faf1e3] rounded-[8px] px-3 py-2 mt-2 mb-3">המשתמש שלך לא מקושר לרשומת רכז — פנה למנהל.</div>}

    <EventInsightsModal open={showInsights} onClose={()=>setShowInsights(false)} insights={insights} mode="coord"/>
    <EventManageModal initialTab={manageTab} event={manageEvent} onClose={()=>setManageId(null)} onChanged={load}/>
    <EventFormModal open={showNew || editId !== null} onClose={()=>{if(!saving){setEditId(null);setShowNew(false)}}}
      editEvent={editEvent} form={form} setForm={setForm} contacts={contacts} saving={saving} onSave={saveEdit} mode="coord"/>
    <EventResultsModal event={resultsEvent} results={results} setResults={setResults} saving={saving} onSave={saveResults} onClose={()=>{if(!saving)setResultsId(null)}}/>

    {/* Filter */}
    <div className="flex gap-2 mt-3 mb-3 overflow-x-auto pb-1">
      {(["","pending_approval","planning","approved","marketing","done","cancelled"] as const).map(s=>(
        <button key={s} onClick={()=>setFilter(s)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${filter===s?"bg-[#193d33] text-white":"bg-white border border-[#e1e8df] text-[#63756b]"}`}>
          {s===""?`הכל (${events.length})`:ST[s]}
        </button>
      ))}
    </div>

    {/* Bulk toolbar — same as admin, minus approval; the API clamps approved/marketing to pending */}
    {selected.size > 0 && (
      <div className="flex items-center gap-2 flex-wrap bg-[#193d33] text-white rounded-[10px] px-3.5 py-2.5 mb-3">
        <span className="text-sm font-semibold">{selected.size} נבחרו</span>
        <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} className="text-xs px-2 py-1.5 rounded-[7px] bg-white/15 text-white border-none outline-none">
          <option value="" className="text-black">שנה סטטוס ל...</option>
          {["planning","pending_approval","done","cancelled"].map(v=><option key={v} value={v} className="text-black">{ST[v]}</option>)}
        </select>
        <button disabled={!bulkStatus||bulkBusy} onClick={()=>applyBulk("status")} className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white text-[#193d33] disabled:opacity-40">{bulkBusy?"מעדכן...":"החל"}</button>
        <button disabled={bulkBusy} onClick={()=>applyBulk("delete")} className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white/15 hover:bg-white/25">מחק</button>
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
          onManage={()=>{setManageTab("attendees");setManageId(e.id)}}
              onRegistration={()=>{setManageTab("registration");setManageId(e.id)}}
          onDuplicate={()=>duplicateEvent(e)}
          onDelete={()=>deleteEvent(e.id)}/>
      ))}
    </div>
  </div>
}
