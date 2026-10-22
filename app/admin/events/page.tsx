"use client"
import { uiMutation } from "@/lib/ui-request"
import WorkspaceHeader from "@/components/ui/WorkspaceHeader"
import { useUrlState } from "@/lib/use-url-state"
import { useQuickAction } from "@/lib/quick-action"
import EmptyState from "@/components/ui/EmptyState"
import { useEffect, useState } from "react"
import Button from "@/components/ui/Button"
import ExportButton from "@/components/ui/ExportButton"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useToast } from "@/components/ui/Toast"
import EventFormModal from "@/components/events/EventFormModal"
import EventResultsModal from "@/components/events/EventResultsModal"
import EventManageModal from "@/components/events/EventManageModal"
import EventInsightsModal from "@/components/events/EventInsightsModal"
import EventCard from "@/components/events/EventCard"
import { STATUS_OPTIONS, ST, EMPTY_FORM, EMPTY_RESULTS, formFromEvent, duplicateForm, resultsFromEvent, formToBody } from "@/components/events/shared"

export default function EventsPage() {
  const { success, error: showError } = useToast()
  const [events, setEvents] = useState<any[]>([])
  const [expenses, setExpenses] = useState<Record<number,number>>({})
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useUrlState("status")
  const [search, setSearch] = useState("")

  // Edit state
  const [editId, setEditId] = useState<number|null>(null)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [saving, setSaving] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)

  // Results state
  const [resultsId, setResultsId] = useState<number|null>(null)
  const [results, setResults] = useState({...EMPTY_RESULTS})

  // Attendees/vendors management
  const [manageId, setManageId] = useState<number|null>(null)
  const [manageTab,setManageTab]=useState<"attendees"|"registration">("attendees")

  // Insights
  const [showInsights, setShowInsights] = useState(false)
  const [insights, setInsights] = useState<any>(null)

  // New event
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [er, ex, cr] = await Promise.all([fetch("/api/events"), fetch("/api/expenses"), fetch("/api/contacts")])
      if (!er.ok) throw new Error()
      const { events } = await er.json()
      const { expenses: exp } = await ex.json()
      const { contacts } = await cr.json().catch(()=>({contacts:[]}))
      setEvents(events||[])
      setContacts(contacts||[])
      const m: Record<number,number> = {}
      ;(exp||[]).forEach((e:any)=>{ if(e.event_id) m[e.event_id]=(m[e.event_id]||0)+(+e.amount||0) })
      setExpenses(m)
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  async function loadInsights() {
    setShowInsights(true)
    if (insights) return
    const res = await fetch("/api/events/insights")
    if (res.ok) setInsights(await res.json())
  }

  function openEdit(e: any) { setEditId(e.id); setForm(formFromEvent(e)); setShowNew(false); setResultsId(null) }
  function duplicateEvent(e: any) { setEditId(null); setForm(duplicateForm(e)); setShowNew(true); setResultsId(null) }
  // "+ הוספה" → אירוע חדש opens the same event form.
  useQuickAction(["event"], () => { setShowNew(true); setEditId(null); setResultsId(null); setForm({...EMPTY_FORM}) })
  function openResults(e: any) { setResultsId(e.id); setResults(resultsFromEvent(e)); setEditId(null); setShowNew(false) }

  async function saveEdit() {
    if (!form.name.trim() || saving) return
    setSaving(true)
    try {
      await uiMutation(editId ? `/api/events/${editId}` : "/api/events", editId ? "PATCH" : "POST", formToBody(form))
      setEditId(null); setShowNew(false)
      success(editId ? "האירוע עודכן" : "האירוע נוצר")
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
          const ev = events.find(e=>e.id===resultsId)
          await uiMutation("/api/tasks", "POST", { title:results.follow_up, type:"call", status:"todo", event_id:resultsId,
            due_date:new Date(Date.now()+3*24*60*60*1000).toLocaleDateString("en-CA",{timeZone:"Asia/Jerusalem"}),
            assignees:ev?.coordinator_name ? [ev.coordinator_name] : [] })
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

  async function approve(id:number) {
    try { await uiMutation(`/api/events/${id}`,"PATCH",{approve:true});setEvents(list=>list.map(e=>e.id===id?{...e,approved:true,status:"marketing"}:e));success("האירוע אושר") }
    catch(e) { showError(e instanceof Error?e.message:"האישור לא הושלם") }
  }
  async function approveAllPending() {
    const pending=events.filter(e=>e.status==="pending_approval"&&!e.approved)
    if(!pending.length||bulkApproving||!confirm(`לאשר ${pending.length} אירועים ממתינים?`))return
    setBulkApproving(true);let count=0
    try {for(const e of pending){await uiMutation(`/api/events/${e.id}`,"PATCH",{approve:true});count++}success(`${count} אירועים אושרו`)}
    catch {showError(`אושרו ${count} מתוך ${pending.length} אירועים. הפעולה נעצרה בעקבות שגיאה.`)}
    finally {setBulkApproving(false);await load()}
  }

  const filtered = events.filter(e=>(!filter||e.status===filter)&&[e.name,e.location,e.coordinator_name].some(v=>String(v||"").includes(search.trim())))
  const editEvent = events.find(e=>e.id===editId) || null
  const resultsEvent = events.find(e=>e.id===resultsId) || null
  const manageEvent = events.find(e=>e.id===manageId) || null

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>

  return (
    <div className="ui-page fade-up">
      <WorkspaceHeader title="אירועים ופעילות" description={events.length + " אירועים · תכנון, משתתפים ותוצאות במקום אחד"}
        actions={<><Button variant="secondary" onClick={loadInsights}>ביצועים מצטברים</Button><ExportButton type="events"/><Button onClick={()=>{setShowNew(true);setEditId(null);setResultsId(null);setForm({...EMPTY_FORM})}}>+ אירוע חדש</Button></>}/>
      <div className="ui-stat-grid">
        <div className="ui-card ui-stat"><small>אירועים בתהליך</small><strong>{events.filter(e=>!["done","cancelled"].includes(e.status)).length}</strong></div>
        <div className="ui-card ui-stat"><small>ממתינים לאישור</small><strong>{events.filter(e=>e.status==="pending_approval"&&!e.approved).length}</strong></div>
        <div className="ui-card ui-stat"><small>אירועים שהושלמו</small><strong>{events.filter(e=>e.status==="done").length}</strong></div>
      </div>
      <div className="ui-event-filters"><input className="ui-input" type="search" aria-label="חיפוש אירוע" placeholder="חיפוש אירוע, מיקום או רכז…" value={search} onChange={e=>setSearch(e.target.value)}/><span className="ui-note">{filtered.length} אירועים בתצוגה</span></div>

      <EventInsightsModal open={showInsights} onClose={()=>setShowInsights(false)} insights={insights}/>
      <EventManageModal initialTab={manageTab} event={manageEvent} onClose={()=>setManageId(null)} onChanged={load}/>
      <EventFormModal open={showNew || editId !== null} onClose={()=>{if(!saving){setEditId(null);setShowNew(false)}}}
        editEvent={editEvent} form={form} setForm={setForm} contacts={contacts} saving={saving} onSave={saveEdit}/>
      <EventResultsModal event={resultsEvent} results={results} setResults={setResults} saving={saving} onSave={saveResults} onClose={()=>{if(!saving)setResultsId(null)}}/>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {["", "planning","pending_approval","approved","marketing","done","cancelled"].map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter===s?"bg-[#28634e] text-white":"bg-white border border-[#e1e8df] text-[#63756b] hover:bg-[#f7f9f5]"}`}>
            {s===""?"הכל":ST[s]}
            {s==="" && <span className="mr-1.5 text-[#94A3B8]">({events.length})</span>}
          </button>
        ))}
        {filter === "pending_approval" && events.some(e=>e.status==="pending_approval"&&!e.approved) && (
          <button onClick={approveAllPending} disabled={bulkApproving}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#eaf1e7] text-[#28634e] border border-[#c8dac7] hover:bg-[#c8dac7] disabled:opacity-50 mr-auto">
            {bulkApproving ? "מאשר..." : "✓ אשר את כל הממתינים"}
          </button>
        )}
      </div>

      {/* Bulk actions toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-[#193d33] text-white rounded-[10px] px-3.5 py-2.5 mb-3">
          <span className="text-sm font-semibold">{selected.size} נבחרו</span>
          <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-[7px] bg-white/15 text-white border-none outline-none">
            <option value="" className="text-black">שנה סטטוס ל...</option>
            {STATUS_OPTIONS.map(s=><option key={s.v} value={s.v} className="text-black">{s.l}</option>)}
          </select>
          <button disabled={!bulkStatus||bulkBusy} onClick={()=>applyBulk("status")}
            className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white text-[#193d33] disabled:opacity-40">
            {bulkBusy?"מעדכן...":"החל"}
          </button>
          <button disabled={bulkBusy} onClick={()=>applyBulk("delete")}
            className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white/15 hover:bg-white/25">
            מחק
          </button>
          <button onClick={()=>setSelected(new Set())} className="mr-auto text-xs text-white/60 hover:text-white">נקה בחירה</button>
        </div>
      )}

      {/* Events list */}
      {loading
        ? <div className="space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={4}/>)}</div>
        : <div className="space-y-3">
            {filtered.length===0 && <EmptyState icon="📅" title={filter?"אין אירועים בסטטוס זה":"אין עדיין אירועים"} hint={filter?undefined:"אירועים הם הדרך המרכזית לאסוף לידים חדשים"} actionLabel={filter?undefined:"+ צור אירוע ראשון"} onAction={()=>{setShowNew(true);setEditId(null);setResultsId(null)}} onClearFilters={filter?()=>setFilter(""):undefined}/>}
            {filtered.map(e=>(
              <EventCard key={e.id} e={e} spent={expenses[e.id]||0}
                isEditing={editId===e.id} isResults={resultsId===e.id}
                selected={selected.has(e.id)}
                onToggleSelect={()=>{ const next=new Set(selected); next.has(e.id)?next.delete(e.id):next.add(e.id); setSelected(next) }}
                onEdit={()=>editId===e.id?setEditId(null):openEdit(e)}
                onResults={()=>resultsId===e.id?setResultsId(null):openResults(e)}
                onApprove={()=>approve(e.id)}
                onManage={()=>{setManageTab("attendees");setManageId(e.id)}}
              onRegistration={()=>{setManageTab("registration");setManageId(e.id)}}
                onDuplicate={()=>duplicateEvent(e)}
                onDelete={()=>deleteEvent(e.id)}
                showCoordinator/>
            ))}
          </div>
      }
    </div>
  )
}
