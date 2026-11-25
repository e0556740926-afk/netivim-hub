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
import InvitesPanel from "@/components/events/InvitesPanel"
import Modal from "@/components/ui/Modal"
import ExportButton from "@/components/ui/ExportButton"
import { STATUS_OPTIONS, ST, EMPTY_FORM, EMPTY_RESULTS, formFromEvent, duplicateForm, resultsFromEvent, formToBody } from "@/components/events/shared"

/**
 * Coordinator events — since Nov 2026 coordinators have the manager's
 * full event permissions: every event (not only their own), full form,
 * approval, registration form, attendees/vendors, bulk status/delete,
 * export. Kept as its own screen for the coordinator layout and the
 * personal-invitations strip.
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
  const [search, setSearch] = useState("")
  const [bulkApproving, setBulkApproving] = useState(false)

  const [showNew, setShowNew] = useState(false)
  const [editId, setEditId] = useState<number|null>(null)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [saving, setSaving] = useState(false)

  const [resultsId, setResultsId] = useState<number|null>(null)
  const [results, setResults] = useState({...EMPTY_RESULTS})
  const [manageId, setManageId] = useState<number|null>(null)
  const [manageTab,setManageTab]=useState<"attendees"|"registration">("attendees")

  const [inviteEvents, setInviteEvents] = useState<any[]>([])
  const [inviteFor, setInviteFor] = useState<any|null>(null)
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
      // All events — coordinators share the manager's event permissions.
      setEvents(events||[])
      // Org events with the conference design: every coordinator invites their own partners.
      const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Jerusalem"})
      setInviteEvents((events||[]).filter((e:any)=>e.page_design==="veida"&&!["done","cancelled"].includes(e.status)&&(!e.date||String(e.date).slice(0,10)>=today)))
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

  function openNew() { setEditId(null); setResultsId(null); setForm({...EMPTY_FORM}); setShowNew(true) }
  function openEdit(e: any) { setEditId(e.id); setForm(formFromEvent(e)); setShowNew(false); setResultsId(null) }
  function duplicateEvent(e: any) { setEditId(null); setForm(duplicateForm(e)); setShowNew(true); setResultsId(null) }
  // "+ הוספה" → הצעת אירוע opens the same proposal form.
  useQuickAction(["event"], openNew, !loading)
  function openResults(e: any) { setResultsId(e.id); setResults(resultsFromEvent(e)); setEditId(null); setShowNew(false) }

  async function saveEdit() {
    if (!form.name.trim() || saving) return
    setSaving(true)
    try {
      // New events default to me as coordinator; editing never reassigns the owner.
      await uiMutation(editId ? `/api/events/${editId}` : "/api/events", editId ? "PATCH" : "POST", editId ? formToBody(form) : { ...formToBody(form), coordinator_id: coordId })
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
          await uiMutation("/api/tasks", "POST", { title:results.follow_up, type:"call", status:"todo", event_id:resultsId, coordinator_id:ev?.coordinator_id||coordId,
            due_date:new Date(Date.now()+3*24*60*60*1000).toLocaleDateString("en-CA",{timeZone:"Asia/Jerusalem"}),
            assignees:ev?.coordinator_name ? [ev.coordinator_name] : user?.name ? [user.name] : [] })
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
  const pendingCount = events.filter(e=>e.status==="pending_approval"&&!e.approved).length

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={3}/>)}</div>

  return <div className="ui-page ui-personal fade-up">
    <WorkspaceHeader title="אירועים" description={events.length + " אירועים · " + pendingCount + " ממתינים לאישור"} actions={<><button className="ui-btn" onClick={loadInsights}>ביצועים</button><ExportButton type="events"/><button className="ui-btn ui-btn-primary" onClick={openNew}>+ אירוע חדש</button></>}/>
    {!coordId && <div className="text-xs text-[#946014] bg-[#faf1e3] rounded-[8px] px-3 py-2 mt-2 mb-3">המשתמש שלך לא מקושר לרשומת רכז — פנה למנהל.</div>}

    <EventInsightsModal open={showInsights} onClose={()=>setShowInsights(false)} insights={insights} mode="coord"/>
    <EventManageModal initialTab={manageTab} event={manageEvent} onClose={()=>setManageId(null)} onChanged={load}/>
    <EventFormModal open={showNew || editId !== null} onClose={()=>{if(!saving){setEditId(null);setShowNew(false)}}}
      editEvent={editEvent} form={form} setForm={setForm} contacts={contacts} saving={saving} onSave={saveEdit}/>
    <EventResultsModal event={resultsEvent} results={results} setResults={setResults} saving={saving} onSave={saveResults} onClose={()=>{if(!saving)setResultsId(null)}}/>

    <Modal open={!!inviteFor} onClose={()=>setInviteFor(null)} title={`ההזמנות שלי · ${inviteFor?.name||""}`} width="640px">{inviteFor&&<InvitesPanel eventId={inviteFor.id}/>}</Modal>
    {inviteEvents.map(e=><div key={e.id} className="flex items-center justify-between gap-3 mt-3 px-4 py-3 rounded-[12px] bg-[#00262B] text-[#F8F4ED]">
      <div className="min-w-0"><div className="text-xs text-[#C9A25E] font-semibold">הזמנות אישיות</div><div className="font-bold truncate">{e.name}</div><div className="text-xs opacity-75">שלחו לשותפים שלכם את הקישור האישי בוואטסאפ</div></div>
      <button className="px-3 py-2 rounded-[9px] bg-[#F8F4ED] text-[#00262B] text-xs font-bold whitespace-nowrap" onClick={()=>setInviteFor(e)}>ההזמנות שלי</button>
    </div>)}

    <div className="ui-event-filters mt-3"><input className="ui-input" type="search" aria-label="חיפוש אירוע" placeholder="חיפוש אירוע, מיקום או רכז…" value={search} onChange={e=>setSearch(e.target.value)}/><span className="ui-note">{filtered.length} אירועים בתצוגה</span></div>

    {/* Filter */}
    <div className="flex gap-2 mt-3 mb-3 overflow-x-auto pb-1 items-center">
      {(["","pending_approval","planning","approved","marketing","done","cancelled"] as const).map(s=>(
        <button key={s} onClick={()=>setFilter(s)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${filter===s?"bg-[#193d33] text-white":"bg-white border border-[#e1e8df] text-[#63756b]"}`}>
          {s===""?`הכל (${events.length})`:ST[s]}
        </button>
      ))}
      {filter === "pending_approval" && pendingCount > 0 && (
        <button onClick={approveAllPending} disabled={bulkApproving}
          className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 bg-[#eaf1e7] text-[#28634e] border border-[#c8dac7] disabled:opacity-50">
          {bulkApproving ? "מאשר..." : "✓ אשר את כל הממתינים"}
        </button>
      )}
    </div>

    {/* Bulk toolbar — same as admin */}
    {selected.size > 0 && (
      <div className="flex items-center gap-2 flex-wrap bg-[#193d33] text-white rounded-[10px] px-3.5 py-2.5 mb-3">
        <span className="text-sm font-semibold">{selected.size} נבחרו</span>
        <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} className="text-xs px-2 py-1.5 rounded-[7px] bg-white/15 text-white border-none outline-none">
          <option value="" className="text-black">שנה סטטוס ל...</option>
          {STATUS_OPTIONS.map(s=><option key={s.v} value={s.v} className="text-black">{s.l}</option>)}
        </select>
        <button disabled={!bulkStatus||bulkBusy} onClick={()=>applyBulk("status")} className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white text-[#193d33] disabled:opacity-40">{bulkBusy?"מעדכן...":"החל"}</button>
        <button disabled={bulkBusy} onClick={()=>applyBulk("delete")} className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white/15 hover:bg-white/25">מחק</button>
        <button onClick={()=>setSelected(new Set())} className="mr-auto text-xs text-white/60 hover:text-white">נקה בחירה</button>
      </div>
    )}

    {/* Events list */}
    <div className="space-y-3">
      {filtered.length===0 && <EmptyState icon="📅" title={filter?"אין אירועים בסטטוס זה":"אין אירועים"} hint={filter?undefined:"אירועים הם הדרך המרכזית לאסוף לידים חדשים"} actionLabel={filter?undefined:"+ אירוע חדש"} onAction={openNew} onClearFilters={filter?()=>setFilter(""):undefined}/>}
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
  </div>
}
