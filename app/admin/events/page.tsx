"use client"
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

const EMPTY_FORM = { name:"", date:"", time:"", location:"", budget_planned:"", target_attendees:"", status:"planning", approved:false }
const EMPTY_RESULTS = { actual_attendees:"", leads_collected:"", summary:"", follow_up:"" }

export default function EventsPage() {
  const { success } = useToast()
  const [events, setEvents] = useState<any[]>([])
  const [expenses, setExpenses] = useState<Record<number,number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useUrlState("status")

  // Edit state
  const [editId, setEditId] = useState<number|null>(null)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [saving, setSaving] = useState(false)

  // Results state
  const [resultsId, setResultsId] = useState<number|null>(null)
  const [results, setResults] = useState({...EMPTY_RESULTS})

  // New event
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [er, ex] = await Promise.all([fetch("/api/events"), fetch("/api/expenses")])
      if (!er.ok) throw new Error()
      const { events } = await er.json()
      const { expenses: exp } = await ex.json()
      setEvents(events||[])
      const m: Record<number,number> = {}
      ;(exp||[]).forEach((e:any)=>{ if(e.event_id) m[e.event_id]=(m[e.event_id]||0)+(+e.amount||0) })
      setExpenses(m)
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  // Open edit for existing event
  function openEdit(e: any) {
    setEditId(e.id)
    setForm({
      name: e.name||"", date: e.date?.slice(0,10)||"", time: e.time||"",
      location: e.location||"", budget_planned: e.budget_planned||"",
      target_attendees: e.target_attendees||"", status: e.status||"planning",
      approved: e.approved||false
    })
    setShowNew(false); setResultsId(null)
    // Scroll to top
    window.scrollTo({top:0,behavior:"smooth"})
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
    window.scrollTo({top:0,behavior:"smooth"})
  }

  async function saveEdit() {
    if (!form.name.trim()) return
    setSaving(true)
    if (editId) {
      await fetch(`/api/events/${editId}`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, budget_planned:+form.budget_planned||0, target_attendees:+form.target_attendees||0 })
      })
    } else {
      await fetch("/api/events", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, budget_planned:+form.budget_planned||0, target_attendees:+form.target_attendees||0 })
      })
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
          <ExportButton type="events"/>
          <Button onClick={()=>{setShowNew(true);setEditId(null);setResultsId(null);setForm({...EMPTY_FORM})}}>+ אירוע חדש</Button>
        </div>
      </div>

      {/* NEW / EDIT FORM */}
      {(showNew || editId) && (
        <Card className="mb-5 border-2 border-[#00488D]">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold text-[#00488D]">
                {editId ? `✎ עריכת אירוע — ${editEvent?.name||""}` : "אירוע חדש"}
              </div>
              <button onClick={()=>{setEditId(null);setShowNew(false)}} className="text-[#94A3B8] hover:text-[#374151] text-lg leading-none">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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
            <div className="flex gap-2">
              <Button onClick={saveEdit} disabled={saving}>{saving?"שומר...":"שמור שינויים"}</Button>
              <Button variant="secondary" onClick={()=>{setEditId(null);setShowNew(false)}}>ביטול</Button>
            </div>
          </div>
        </Card>
      )}

      {/* RESULTS PANEL */}
      {resultsId && resultsEvent && (
        <Card className="mb-5 border-2 border-[#166534]">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-bold text-[#166534]">📊 עדכון תוצאות — {resultsEvent.name}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{fd(resultsEvent.date)} · {resultsEvent.location}</div>
              </div>
              <button onClick={()=>setResultsId(null)} className="text-[#94A3B8] hover:text-[#374151] text-lg leading-none">✕</button>
            </div>

            {/* Before/After comparison */}
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
                    <span className="text-[#64748B]">לידים</span>
                    <input type="number" value={results.leads_collected} onChange={e=>setResults(r=>({...r,leads_collected:e.target.value}))}
                      className="w-20 px-2 py-0.5 border border-[#BBF7D0] rounded-[7px] text-sm text-center focus:outline-none focus:border-[#166534] font-bold text-[#00488D]" placeholder="0"/>
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

            <div className="mb-4">
              <label className="text-xs font-semibold block mb-1">
                משימת מעקב <span className="text-[#64748B] font-normal">(תיצור משימה אוטומטית — אופציונלי)</span>
              </label>
              <input value={results.follow_up} onChange={e=>setResults(r=>({...r,follow_up:e.target.value}))}
                placeholder='לדוגמה: "ליצור קשר עם 31 הלידים תוך 3 ימים"'
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#166534]"/>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveResults} disabled={saving}>{saving?"שומר...":"שמור תוצאות ✓"}</Button>
              <Button variant="secondary" onClick={()=>setResultsId(null)}>ביטול</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["", "planning","pending_approval","approved","marketing","done","cancelled"].map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter===s?"bg-[#00488D] text-white":"bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"}`}>
            {s===""?"הכל":ST[s]}
            {s==="" && <span className="mr-1.5 text-[#94A3B8]">({events.length})</span>}
          </button>
        ))}
      </div>

      {/* Events list */}
      {loading
        ? <div className="space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={4}/>)}</div>
        : <div className="space-y-3">
            {filtered.length===0 && <EmptyState icon="📅" title={filter?"אין אירועים בסטטוס זה":"אין עדיין אירועים"} hint={filter?undefined:"אירועים הם הדרך המרכזית לאסוף לידים חדשים"} actionLabel={filter?undefined:"+ צור אירוע ראשון"} onAction={()=>{setShowNew(true);setEditId(null);setResultsId(null)}} onClearFilters={filter?()=>setFilter(""):undefined}/>}
            {filtered.map(e=>{
              const spent=expenses[e.id]||0
              const bp=e.budget_planned>0?Math.round(spent/e.budget_planned*100):0
              const roi=e.leads_collected>0&&spent>0?Math.round(spent/e.leads_collected):null
              const isEditing=editId===e.id
              const isResults=resultsId===e.id
              const today=new Date().toISOString().slice(0,10)
              const isPast=e.date&&e.date<today&&e.status!=="done"&&e.status!=="cancelled"

              return (
                <div key={e.id} className={`bg-white border rounded-[14px] transition-all ${isEditing?"border-[#00488D] shadow-md":isResults?"border-[#166534] shadow-md":isPast?"border-[#FDE68A]":"border-[#E2E8F0] hover:border-[#CBD5E1]"}`}>
                  <div className="p-4">
                    {/* Top row */}
                    <div className="flex items-start gap-3 mb-3">
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
                          {e.actual_attendees>0 && <span className="text-[#166534]">/{e.actual_attendees}</span>}
                        </div>
                        <div className="text-[10px] text-[#64748B]">יעד/בפועל</div>
                      </div>
                      <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
                        <div className="text-sm font-bold text-[#00488D]">{e.leads_collected||0}</div>
                        <div className="text-[10px] text-[#64748B]">לידים</div>
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