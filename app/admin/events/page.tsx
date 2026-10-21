"use client"
import { useUrlState } from "@/lib/use-url-state"
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
  const { success } = useToast()
  const [events, setEvents] = useState<any[]>([])
  const [expenses, setExpenses] = useState<Record<number,number>>({})
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useUrlState("status")

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
  function openResults(e: any) { setResultsId(e.id); setResults(resultsFromEvent(e)); setEditId(null); setShowNew(false) }

  async function saveEdit() {
    if (!form.name.trim()) return
    setSaving(true)
    const body = formToBody(form)
    if (editId) {
      await fetch(`/api/events/${editId}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) })
    } else {
      await fetch("/api/events", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) })
    }
    setSaving(false); setEditId(null); setShowNew(false); load()
    success(editId ? "האירוע עודכן" : "האירוע נוצר")
  }

  async function saveResults() {
    if (!resultsId) return
    setSaving(true)
    await fetch(`/api/events/${resultsId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ results: true, actual_attendees: +results.actual_attendees||0, leads_collected: +results.leads_collected||0, summary: results.summary })
    })
    if (results.follow_up.trim()) {
      const ev = events.find(e=>e.id===resultsId)
      await fetch("/api/tasks", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          title: results.follow_up, type: "call", status: "todo", event_id: resultsId,
          due_date: new Date(Date.now()+3*24*60*60*1000).toISOString().slice(0,10),
          assignees: ev?.coordinator_name ? [ev.coordinator_name] : []
        })
      })
    }
    setSaving(false); setResultsId(null); load()
    success("התוצאות נשמרו")
  }

  async function approve(id: number) {
    await fetch(`/api/events/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({approve:true}) })
    setEvents(e=>e.map(x=>x.id===id?{...x,approved:true,status:"marketing"}:x))
  }

  async function approveAllPending() {
    const pending = events.filter(e => e.status === "pending_approval" && !e.approved)
    if (!pending.length) return
    if (!confirm(`לאשר ${pending.length} אירועים ממתינים?`)) return
    setBulkApproving(true)
    // Reuses the existing single-event endpoint (with all its
    // notification logic) once per event, rather than duplicating
    // that logic in a separate bulk route.
    for (const e of pending) {
      await fetch(`/api/events/${e.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({approve:true}) })
    }
    setBulkApproving(false)
    success(`${pending.length} אירועים אושרו`)
    load()
  }

  async function deleteEvent(id: number) {
    if (!confirm("למחוק אירוע זה לצמיתות?")) return
    await fetch(`/api/events/${id}`, { method:"DELETE" })
    setEvents(e=>e.filter(x=>x.id!==id))
    if (editId===id) setEditId(null)
    if (resultsId===id) setResultsId(null)
  }

  const filtered = filter ? events.filter(e=>e.status===filter) : events
  const editEvent = events.find(e=>e.id===editId) || null
  const resultsEvent = events.find(e=>e.id===resultsId) || null
  const manageEvent = events.find(e=>e.id===manageId) || null

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">ניהול אירועים</h1>
          <div className="text-sm text-[#64748B] mt-0.5">{events.length} אירועים סה"כ</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={loadInsights}>📊 ביצועים מצטברים</Button>
          <ExportButton type="events"/>
          <Button onClick={()=>{setShowNew(true);setEditId(null);setResultsId(null);setForm({...EMPTY_FORM})}}>+ אירוע חדש</Button>
        </div>
      </div>

      <EventInsightsModal open={showInsights} onClose={()=>setShowInsights(false)} insights={insights}/>
      <EventManageModal event={manageEvent} onClose={()=>setManageId(null)} onChanged={load}/>
      <EventFormModal open={showNew || editId !== null} onClose={()=>{setEditId(null);setShowNew(false)}}
        editEvent={editEvent} form={form} setForm={setForm} contacts={contacts} saving={saving} onSave={saveEdit}/>
      <EventResultsModal event={resultsEvent} results={results} setResults={setResults} saving={saving} onSave={saveResults} onClose={()=>setResultsId(null)}/>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {["", "planning","pending_approval","approved","marketing","done","cancelled"].map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter===s?"bg-[#00488D] text-white":"bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"}`}>
            {s===""?"הכל":ST[s]}
            {s==="" && <span className="mr-1.5 text-[#94A3B8]">({events.length})</span>}
          </button>
        ))}
        {filter === "pending_approval" && events.some(e=>e.status==="pending_approval"&&!e.approved) && (
          <button onClick={approveAllPending} disabled={bulkApproving}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0] hover:bg-[#BBF7D0] disabled:opacity-50 mr-auto">
            {bulkApproving ? "מאשר..." : "✓ אשר את כל הממתינים"}
          </button>
        )}
      </div>

      {/* Bulk actions toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-[#0D2744] text-white rounded-[10px] px-3.5 py-2.5 mb-3">
          <span className="text-sm font-semibold">{selected.size} נבחרו</span>
          <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-[7px] bg-white/15 text-white border-none outline-none">
            <option value="" className="text-black">שנה סטטוס ל...</option>
            {STATUS_OPTIONS.map(s=><option key={s.v} value={s.v} className="text-black">{s.l}</option>)}
          </select>
          <button disabled={!bulkStatus||bulkBusy} onClick={async ()=>{
              setBulkBusy(true)
              await fetch("/api/events/bulk",{method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({ ids:[...selected], action:"status", status:bulkStatus })})
              setBulkBusy(false); setSelected(new Set()); setBulkStatus(""); success("הסטטוס עודכן"); load()
            }}
            className="px-3 py-1.5 rounded-[7px] text-xs font-bold bg-white text-[#0D2744] disabled:opacity-40">
            {bulkBusy?"מעדכן...":"החל"}
          </button>
          <button disabled={bulkBusy} onClick={async ()=>{
              if (!confirm(`למחוק ${selected.size} אירועים?`)) return
              setBulkBusy(true)
              await fetch("/api/events/bulk",{method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({ ids:[...selected], action:"delete" })})
              setBulkBusy(false); setSelected(new Set()); success("נמחקו"); load()
            }}
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
                onManage={()=>setManageId(e.id)}
                onDuplicate={()=>duplicateEvent(e)}
                onDelete={()=>deleteEvent(e.id)}
                showCoordinator/>
            ))}
          </div>
      }
    </div>
  )
}
