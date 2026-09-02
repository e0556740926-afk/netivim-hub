"use client"
import Modal from "@/components/ui/Modal"
import { useUrlState } from "@/lib/use-url-state"
import EmptyState from "@/components/ui/EmptyState"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import ExportButton from "@/components/ui/ExportButton"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useToast } from "@/components/ui/Toast"

const STATUS_OPTIONS = [
  { v:"planning", l:"תכנון ראשוני" },
  { v:"pending_approval", l:"ממתין לאישור" },
  { v:"approved", l:"מאושר" },
  { v:"marketing", l:"בפרסום" },
  { v:"done", l:"בוצע" },
  { v:"cancelled", l:"בוטל" },
]
const ST: Record<string,string> = Object.fromEntries(STATUS_OPTIONS.map(s=>[s.v,s.l]))

const EMPTY_FORM = { name:"", date:"", time:"", location:"", budget_planned:"", target_attendees:"", capacity:"", partner_contact_id:"", status:"planning", approved:false }
const EMPTY_RESULTS = { actual_attendees:"", leads_collected:"", summary:"", follow_up:"" }
const EMPTY_ATTENDEE = { name:"", phone:"", email:"" }
const EMPTY_VENDOR = { name:"", category:"other", contact:"", amount:"", deposit_paid:false, notes:"" }
const VENDOR_CATEGORIES: Record<string,string> = { venue:"אולם/מיקום", catering:"קייטרינג", marketing:"שיווק/פרסום", materials:"חומרים", other:"אחר" }

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

  // Attendees/vendors management state
  const [manageId, setManageId] = useState<number|null>(null)
  const [manageTab, setManageTab] = useState<"attendees"|"vendors">("attendees")
  const [attendees, setAttendees] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [newAttendee, setNewAttendee] = useState({...EMPTY_ATTENDEE})
  const [newVendor, setNewVendor] = useState({...EMPTY_VENDOR})
  const [manageBusy, setManageBusy] = useState(false)

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

  // Open edit for existing event
  function openEdit(e: any) {
    setEditId(e.id)
    setForm({
      name: e.name||"", date: e.date?.slice(0,10)||"", time: e.time||"",
      location: e.location||"", budget_planned: e.budget_planned||"",
      target_attendees: e.target_attendees||"", capacity: e.capacity||"",
      partner_contact_id: e.partner_contact_id||"", status: e.status||"planning",
      approved: e.approved||false
    })
    setShowNew(false); setResultsId(null)
  }

  // Duplicate an event into a fresh "new event" form, pre-filled.
  function duplicateEvent(e: any) {
    setEditId(null)
    setForm({
      name: `${e.name} (עותק)`, date: "", time: e.time||"",
      location: e.location||"", budget_planned: e.budget_planned||"",
      target_attendees: e.target_attendees||"", capacity: e.capacity||"",
      partner_contact_id: e.partner_contact_id||"", status: "planning",
      approved: false
    })
    setShowNew(true); setResultsId(null)
  }

  // Open attendees/vendors management modal
  async function openManage(e: any, tab: "attendees"|"vendors" = "attendees") {
    setManageId(e.id); setManageTab(tab)
    setNewAttendee({...EMPTY_ATTENDEE}); setNewVendor({...EMPTY_VENDOR})
    const [ar, vr] = await Promise.all([fetch(`/api/events/${e.id}/attendees`), fetch(`/api/events/${e.id}/vendors`)])
    setAttendees((await ar.json()).attendees||[])
    setVendors((await vr.json()).vendors||[])
  }

  async function addAttendee() {
    if (!manageId || !newAttendee.name.trim()) return
    setManageBusy(true)
    const res = await fetch(`/api/events/${manageId}/attendees`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(newAttendee)})
    const d = await res.json()
    setManageBusy(false); setNewAttendee({...EMPTY_ATTENDEE})
    if (d.waitlisted) success("נוסף לרשימת המתנה — הקיבולת מלאה")
    openManage({id:manageId})
    load()
  }
  async function toggleCheckin(a: any) {
    await fetch(`/api/events/${manageId}/attendees`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id, checked_in: !a.checked_in})})
    setAttendees(list=>list.map(x=>x.id===a.id?{...x,checked_in:!x.checked_in}:x))
    load()
  }
  async function promoteAttendee(a: any) {
    await fetch(`/api/events/${manageId}/attendees`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id, promote:true})})
    openManage({id:manageId}); load()
  }
  async function removeAttendee(id: number) {
    await fetch(`/api/events/${manageId}/attendees`, {method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})})
    setAttendees(list=>list.filter(x=>x.id!==id)); load()
  }

  async function addVendor() {
    if (!manageId || !newVendor.name.trim()) return
    setManageBusy(true)
    await fetch(`/api/events/${manageId}/vendors`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...newVendor, amount:+newVendor.amount||0})})
    setManageBusy(false); setNewVendor({...EMPTY_VENDOR})
    openManage({id:manageId})
  }
  async function toggleDeposit(v: any) {
    await fetch(`/api/events/${manageId}/vendors`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...v, deposit_paid:!v.deposit_paid})})
    setVendors(list=>list.map(x=>x.id===v.id?{...x,deposit_paid:!x.deposit_paid}:x))
  }
  async function removeVendor(id: number) {
    await fetch(`/api/events/${manageId}/vendors`, {method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})})
    setVendors(list=>list.filter(x=>x.id!==id))
  }

  // Open results panel
  function openResults(e: any) {
    setResultsId(e.id)
    setResults({
      actual_attendees: e.actual_attendees||"",
      leads_collected: e.leads_collected||"",
      summary: e.summary||"",
      follow_up: ""
    })
    setEditId(null); setShowNew(false)
  }

  async function saveEdit() {
    if (!form.name.trim()) return
    setSaving(true)
    const body = { ...form, budget_planned:+form.budget_planned||0, target_attendees:+form.target_attendees||0,
      capacity: form.capacity?+form.capacity:null, partner_contact_id: form.partner_contact_id?+form.partner_contact_id:null }
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
    // Update results
    await fetch(`/api/events/${resultsId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        results: true,
        actual_attendees: +results.actual_attendees||0,
        leads_collected: +results.leads_collected||0,
        summary: results.summary
      })
    })
    // Create follow-up task if filled
    if (results.follow_up.trim()) {
      const ev = events.find(e=>e.id===resultsId)
      await fetch("/api/tasks", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          title: results.follow_up,
          type: "call",
          status: "todo",
          event_id: resultsId,
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
  const editEvent = events.find(e=>e.id===editId)
  const resultsEvent = events.find(e=>e.id===resultsId)

  const InputClass = "w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"

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

      {/* Insights modal */}
      <Modal open={showInsights} onClose={()=>setShowInsights(false)} title="📊 ביצועי אירועים — מצטבר" width="640px">
        {!insights ? <div className="text-sm text-[#94A3B8] text-center py-6">טוען...</div> : <>
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-[#F8FAFC] rounded-[10px] p-3 text-center"><div className="text-lg font-extrabold">{insights.totals.events}</div><div className="text-[10px] text-[#64748B]">אירועים שבוצעו</div></div>
            <div className="bg-[#F8FAFC] rounded-[10px] p-3 text-center"><div className="text-lg font-extrabold text-[#00488D]">{insights.totals.leads}</div><div className="text-[10px] text-[#64748B]">לידים סה"כ</div></div>
            <div className="bg-[#F8FAFC] rounded-[10px] p-3 text-center"><div className="text-lg font-extrabold">₪{insights.totals.spent.toLocaleString()}</div><div className="text-[10px] text-[#64748B]">הוצאה כוללת</div></div>
            <div className="bg-[#F8FAFC] rounded-[10px] p-3 text-center"><div className="text-lg font-extrabold text-[#166534]">{insights.totals.costPerLead?`₪${insights.totals.costPerLead}`:"—"}</div><div className="text-[10px] text-[#64748B]">עלות/ליד ממוצעת</div></div>
          </div>
          <div className="text-xs font-bold mb-2">מגמה חודשית (אירועים שבוצעו)</div>
          <div className="space-y-1.5 mb-4">
            {insights.byMonth.length===0 && <div className="text-xs text-[#94A3B8]">אין עדיין אירועים שבוצעו</div>}
            {insights.byMonth.map((m:any)=>(
              <div key={m.month} className="flex items-center gap-2 text-xs">
                <div className="w-16 text-[#64748B]">{m.month}</div>
                <div className="flex-1 h-2 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${Math.min(100,m.leads*5)}%`}} className="h-full bg-[#5B21B6] rounded-full"/></div>
                <div className="w-20 text-left font-semibold">{m.leads} לידים · {m.events} אירועים</div>
              </div>
            ))}
          </div>
          <div className="text-xs font-bold mb-2">לפי רכז (אירועים שבוצעו)</div>
          <div className="space-y-1">
            {insights.byCoordinator.filter((c:any)=>c.coordinator_name).map((c:any)=>(
              <div key={c.coordinator_name} className="flex items-center justify-between text-xs py-1 border-b border-[#F1F5F9] last:border-0">
                <span className="font-medium">{c.coordinator_name}</span>
                <span className="text-[#64748B]">{c.events} אירועים · <b className="text-[#00488D]">{c.leads}</b> לידים</span>
              </div>
            ))}
          </div>
        </>}
      </Modal>

      {/* Attendees / vendors management modal */}
      <Modal open={manageId!==null} onClose={()=>setManageId(null)}
        title={`👥 ניהול — ${events.find(e=>e.id===manageId)?.name||""}`} width="560px">
        <div className="flex gap-2 p-1 bg-[#F0F4F8] rounded-[10px] mb-3">
          <button onClick={()=>setManageTab("attendees")} className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${manageTab==="attendees"?"bg-white text-[#0D2744] shadow-sm":"text-[#64748B]"}`}>נרשמים ({attendees.length})</button>
          <button onClick={()=>setManageTab("vendors")} className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${manageTab==="vendors"?"bg-white text-[#0D2744] shadow-sm":"text-[#64748B]"}`}>ספקים ({vendors.length})</button>
        </div>

        {manageTab === "attendees" ? <>
          <div className="flex gap-2 mb-3">
            <input value={newAttendee.name} onChange={e=>setNewAttendee(a=>({...a,name:e.target.value}))} placeholder="שם *" className={InputClass}/>
            <input value={newAttendee.phone} onChange={e=>setNewAttendee(a=>({...a,phone:e.target.value}))} placeholder="טלפון" className={InputClass}/>
            <button onClick={addAttendee} disabled={manageBusy||!newAttendee.name.trim()} className="px-3 py-2 bg-[#0D2744] text-white rounded-[9px] text-sm font-bold disabled:opacity-50 whitespace-nowrap">+ הוסף</button>
          </div>
          {attendees.length===0 ? <div className="text-xs text-[#94A3B8] text-center py-4">אין עדיין נרשמים</div> : (
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {attendees.map((a:any)=>(
                <div key={a.id} className={`flex items-center gap-2 px-3 py-2 rounded-[9px] border ${a.waitlisted?"border-[#FDE68A] bg-[#FFFBEB]":"border-[#E2E8F0]"}`}>
                  <input type="checkbox" checked={a.checked_in} disabled={a.waitlisted} onChange={()=>toggleCheckin(a)} className="accent-[#166534] w-4 h-4"/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{a.name}</div>
                    <div className="text-xs text-[#94A3B8]">{a.phone}{a.waitlisted?" · ברשימת המתנה":a.checked_in?" · הגיע/ה ✓":""}</div>
                  </div>
                  {a.waitlisted && <button onClick={()=>promoteAttendee(a)} className="text-xs px-2 py-1 rounded-[6px] border border-[#00488D] text-[#00488D]">קדם</button>}
                  <button onClick={()=>removeAttendee(a.id)} className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] text-[#94A3B8] hover:text-[#960010]">✕</button>
                </div>
              ))}
            </div>
          )}
        </> : <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={newVendor.name} onChange={e=>setNewVendor(v=>({...v,name:e.target.value}))} placeholder="שם ספק *" className={InputClass}/>
            <select value={newVendor.category} onChange={e=>setNewVendor(v=>({...v,category:e.target.value}))} className={InputClass+" bg-white"}>
              {Object.entries(VENDOR_CATEGORIES).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
            <input value={newVendor.contact} onChange={e=>setNewVendor(v=>({...v,contact:e.target.value}))} placeholder="איש קשר / טלפון" className={InputClass}/>
            <input type="number" value={newVendor.amount} onChange={e=>setNewVendor(v=>({...v,amount:e.target.value}))} placeholder="סכום (₪)" className={InputClass}/>
          </div>
          <button onClick={addVendor} disabled={manageBusy||!newVendor.name.trim()} className="w-full py-2 bg-[#0D2744] text-white rounded-[9px] text-sm font-bold disabled:opacity-50 mb-3">+ הוסף ספק</button>
          {vendors.length===0 ? <div className="text-xs text-[#94A3B8] text-center py-4">אין עדיין ספקים</div> : (
            <div className="space-y-1.5">
              {vendors.map((v:any)=>(
                <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-[9px] border border-[#E2E8F0]">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{v.name} <span className="text-xs text-[#94A3B8]">· {VENDOR_CATEGORIES[v.category]||v.category}</span></div>
                    <div className="text-xs text-[#94A3B8]">{v.contact}{v.amount>0?` · ₪${(+v.amount).toLocaleString()}`:""}</div>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-[#64748B]">
                    <input type="checkbox" checked={v.deposit_paid} onChange={()=>toggleDeposit(v)} className="accent-[#166534] w-3.5 h-3.5"/> מקדמה שולמה
                  </label>
                  <button onClick={()=>removeVendor(v.id)} className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] text-[#94A3B8] hover:text-[#960010]">✕</button>
                </div>
              ))}
            </div>
          )}
        </>}
      </Modal>

      {/* NEW / EDIT FORM */}
      <Modal
        open={showNew || editId !== null}
        onClose={() => { setEditId(null); setShowNew(false) }}
        title={editId ? `✎ עריכת אירוע — ${editEvent?.name||""}` : "אירוע חדש"}
        footer={<>
          <Button onClick={saveEdit} disabled={saving}>{saving?"שומר...":"שמור שינויים"}</Button>
          <Button variant="secondary" onClick={()=>{setEditId(null);setShowNew(false)}}>ביטול</Button>
        </>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold block mb-1">שם האירוע *</label>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className={InputClass} placeholder="לדוגמה: יריד תעסוקה בני ברק"/>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">תאריך</label>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className={InputClass}/>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">שעה</label>
            <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} className={InputClass}/>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold block mb-1">מיקום</label>
            <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} className={InputClass} placeholder="עיר / אולם"/>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">תקציב מתוכנן (₪)</label>
            <input type="number" value={form.budget_planned} onChange={e=>setForm(f=>({...f,budget_planned:e.target.value}))} className={InputClass} placeholder="0"/>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">יעד משתתפים</label>
            <input type="number" value={form.target_attendees} onChange={e=>setForm(f=>({...f,target_attendees:e.target.value}))} className={InputClass} placeholder="0"/>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">קיבולת מקסימלית (לא חובה)</label>
            <input type="number" value={form.capacity} onChange={e=>setForm(f=>({...f,capacity:e.target.value}))} className={InputClass} placeholder="ללא הגבלה"/>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">שותף מארח (לא חובה)</label>
            <select value={form.partner_contact_id} onChange={e=>setForm(f=>({...f,partner_contact_id:e.target.value}))} className={InputClass+" bg-white"}>
              <option value="">— ללא —</option>
              {contacts.map((c:any)=><option key={c.id} value={c.id}>{c.name}{c.org?` · ${c.org}`:""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">סטטוס</label>
            <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className={InputClass+" bg-white"}>
              {STATUS_OPTIONS.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={form.approved} onChange={e=>setForm(f=>({...f,approved:e.target.checked}))} className="accent-[#00488D] w-4 h-4"/>
            <label className="text-sm font-medium text-[#374151]">מאושר על ידי הנהלה</label>
          </div>
        </div>
        {editId && editEvent?.slug && (
          <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex items-center gap-3">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&margin=6&data=${encodeURIComponent(`${typeof window!=="undefined"?window.location.origin:""}/j/event/${editEvent.slug}`)}`}
              alt="QR לקליטת לידים" width={64} height={64} className="rounded-[8px] flex-shrink-0"/>
            <div className="text-xs text-[#64748B] leading-relaxed">
              קישור לקליטת לידים באירוע — לידים שנכנסים דרכו מתויגים אוטומטית לאירוע הזה.
              <div className="font-mono text-[#00488D] mt-1 break-all">/j/event/{editEvent.slug}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* RESULTS PANEL */}
      <Modal
        open={resultsId !== null}
        onClose={() => setResultsId(null)}
        title={`📊 עדכון תוצאות — ${resultsEvent?.name||""}`}
        subtitle={resultsEvent ? `${fd(resultsEvent.date)} · ${resultsEvent.location||""}` : undefined}
        accent="#166534"
        footer={<>
          <Button onClick={()=>resultsEvent&&saveResults()} disabled={saving}>{saving?"שומר...":"שמור תוצאות ✓"}</Button>
          <Button variant="secondary" onClick={()=>setResultsId(null)}>ביטול</Button>
        </>}
      >
        {resultsEvent && <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#F0F4F8] rounded-[11px] p-3">
              <div className="text-xs font-bold text-[#64748B] mb-2">יעדים מקוריים</div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-[#64748B]">משתתפים יעד</span><span className="font-bold">{resultsEvent.target_attendees||0}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#64748B]">תקציב</span><span className="font-bold">₪{(+resultsEvent.budget_planned||0).toLocaleString()}</span></div>
              </div>
            </div>
            <div className="bg-[#F0FFF4] border border-[#BBF7D0] rounded-[11px] p-3">
              <div className="text-xs font-bold text-[#166534] mb-2">תוצאות בפועל</div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-[#64748B]">משתתפים</span>
                  <input type="number" value={results.actual_attendees} onChange={e=>setResults(r=>({...r,actual_attendees:e.target.value}))}
                    className="w-20 px-2 py-0.5 border border-[#BBF7D0] rounded-[7px] text-sm text-center focus:outline-none focus:border-[#166534] font-bold" placeholder="0"/>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-[#64748B]">לידים (תיקון ידני)</span>
                  <input type="number" value={results.leads_collected} onChange={e=>setResults(r=>({...r,leads_collected:e.target.value}))}
                    className="w-20 px-2 py-0.5 border border-[#BBF7D0] rounded-[7px] text-sm text-center focus:outline-none focus:border-[#166534] font-bold text-[#00488D]" placeholder="0"/>
                </div>
                <div className="text-[10px] text-[#64748B] text-left pt-1">
                  {resultsEvent.leads_from_event > 0
                    ? <>המערכת סופרת <b className="text-[#00488D]">{resultsEvent.leads_from_event}</b> לידים אמיתיים המשויכים לאירוע — זה מה שיוצג ברשימה, אין צורך למלא ידנית.</>
                    : "אין עדיין לידים משויכים לאירוע זה (event_id) — השדה כאן משמש רק כגיבוי ידני."}
                </div>
              </div>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs font-semibold block mb-1">סיכום האירוע</label>
            <textarea value={results.summary} onChange={e=>setResults(r=>({...r,summary:e.target.value}))} rows={3}
              placeholder="מה הלך טוב? מה ניתן לשפר? תובנות לאירוע הבא..."
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm resize-none focus:outline-none focus:border-[#166534]"/>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">
              משימת מעקב <span className="text-[#64748B] font-normal">(תיצור משימה אוטומטית — אופציונלי)</span>
            </label>
            <input value={results.follow_up} onChange={e=>setResults(r=>({...r,follow_up:e.target.value}))}
              placeholder='לדוגמה: "ליצור קשר עם 31 הלידים תוך 3 ימים"'
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#166534]"/>
          </div>
        </>}
      </Modal>

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
            {filtered.map(e=>{
              const spent=expenses[e.id]||0
              const bp=e.budget_planned>0?Math.round(spent/e.budget_planned*100):0
              const realLeads = e.leads_from_event>0 ? e.leads_from_event : (e.leads_collected||0)
              const roi=realLeads>0&&spent>0?Math.round(spent/realLeads):null
              const isEditing=editId===e.id
              const isResults=resultsId===e.id
              const today=new Date().toISOString().slice(0,10)
              const isPast=e.date&&e.date<today&&e.status!=="done"&&e.status!=="cancelled"

              return (
                <div key={e.id} className={`bg-white border rounded-[14px] transition-all ${isEditing?"border-[#00488D] shadow-md":isResults?"border-[#166534] shadow-md":selected.has(e.id)?"border-[#00488D] bg-[#F0F7FF]":isPast?"border-[#FDE68A]":"border-[#E2E8F0] hover:border-[#CBD5E1]"}`}>
                  <div className="p-4">
                    {/* Top row */}
                    <div className="flex items-start gap-3 mb-3">
                      <input type="checkbox" checked={selected.has(e.id)} onClick={ev=>ev.stopPropagation()}
                        onChange={()=>{
                          const next = new Set(selected)
                          next.has(e.id) ? next.delete(e.id) : next.add(e.id)
                          setSelected(next)
                        }}
                        className="accent-[#00488D] w-4 h-4 mt-1 flex-shrink-0"/>
                      {/* Date box */}
                      {e.date && <div className="text-center flex-shrink-0 w-12 bg-[#F0F7FF] rounded-[10px] py-2">
                        <div className="text-base font-extrabold leading-none text-[#0D2744]">{new Date(e.date).getDate()}</div>
                        <div className="text-[10px] text-[#64748B]">{["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"][new Date(e.date).getMonth()]}</div>
                      </div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-base font-bold text-[#0D2744]">{e.name}</div>
                          {isPast && <span className="text-[10px] px-2 py-0.5 bg-[#FEF3C7] text-[#B45309] rounded-full font-semibold">⏰ דורש עדכון תוצאות</span>}
                          {e.status==="done" && <span className="text-[10px] px-2 py-0.5 bg-[#DCFCE7] text-[#166534] rounded-full font-semibold">✓ בוצע</span>}
                        </div>
                        <div className="text-xs text-[#64748B] mt-0.5 flex gap-2 flex-wrap">
                          {e.time && <span>🕐 {e.time}</span>}
                          {e.location && <span>📍 {e.location}</span>}
                          {e.partner_name && <span>🤝 {e.partner_name}</span>}
                          {e.waitlist_count>0 && <span className="text-[#B45309]">⏳ {e.waitlist_count} בהמתנה</span>}
                        </div>
                      </div>
                      <Badge text={ST[e.status]||e.status}/>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
                        <div className="text-sm font-bold">₪{(+e.budget_planned||0).toLocaleString()}</div>
                        <div className="text-[10px] text-[#64748B]">תקציב</div>
                      </div>
                      <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
                        <div className="text-sm font-bold">{e.target_attendees||0}
                          {(e.attendee_count>0||e.actual_attendees>0) && <span className="text-[#166534]">/{e.attendee_count||e.actual_attendees}</span>}
                        </div>
                        <div className="text-[10px] text-[#64748B]">יעד/בפועל</div>
                      </div>
                      <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
                        <div className="text-sm font-bold text-[#00488D]">{realLeads}</div>
                        <div className="text-[10px] text-[#64748B]">{e.leads_from_event>0?"לידים ✓":"לידים"}</div>
                      </div>
                      <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
                        <div className="text-sm font-bold">{roi?`₪${roi}`:"—"}</div>
                        <div className="text-[10px] text-[#64748B]">עלות/ליד</div>
                      </div>
                    </div>

                    {/* Budget bar */}
                    {e.budget_planned>0 && <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#64748B]">ניצול תקציב · ₪{spent.toLocaleString()} מתוך ₪{(+e.budget_planned).toLocaleString()}</span>
                        <span style={{color:bp>90?"#960010":bp>70?"#B45309":"#64748B"}} className="font-semibold">{bp}%</span>
                      </div>
                      <div className="h-1.5 bg-[#F0F4F8] rounded-full overflow-hidden">
                        <div style={{width:`${Math.min(bp,100)}%`,background:bp>90?"#960010":bp>70?"#B45309":"#00488D"}} className="h-full rounded-full transition-all"/>
                      </div>
                    </div>}

                    {/* Summary */}
                    {e.summary && <div className="text-xs text-[#475569] bg-[#F9FAFB] rounded-[9px] p-3 mb-3">📝 {e.summary}</div>}

                    {/* Action buttons */}
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={()=>isEditing?setEditId(null):openEdit(e)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${isEditing?"bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]":"border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE]"}`}>
                        ✎ עריכה
                      </button>
                      <button onClick={()=>isResults?setResultsId(null):openResults(e)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${isResults?"bg-[#DCFCE7] border-[#BBF7D0] text-[#166534]":isPast?"bg-[#FEF3C7] border-[#FDE68A] text-[#B45309] animate-pulse":"border-[#E2E8F0] hover:bg-[#F0FFF4] hover:border-[#BBF7D0] hover:text-[#166534]"}`}>
                        📊 עדכון תוצאות
                      </button>
                      {!e.approved && e.status==="pending_approval" && (
                        <button onClick={()=>approve(e.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0] hover:bg-[#BBF7D0] transition-colors">
                          ✓ אשר אירוע
                        </button>
                      )}
                      <button onClick={()=>openManage(e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
                        👥 ניהול{e.checked_in_count>0?` (${e.checked_in_count} הגיעו)`:""}
                      </button>
                      <button onClick={()=>duplicateEvent(e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
                        ⧉ שכפל
                      </button>
                      <button onClick={()=>deleteEvent(e.id)} className="mr-auto flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] text-[#94A3B8] hover:bg-[#FFF0F0] hover:text-[#960010] hover:border-[#FECACA] transition-colors">
                        ✕ מחק
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
      }
    </div>
  )
}