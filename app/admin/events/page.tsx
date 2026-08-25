"use client"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import ExportButton from "@/components/ui/ExportButton"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

const ST: Record<string,string> = {
  planning:"תכנון ראשוני", pending_approval:"ממתין לאישור",
  approved:"מאושר", marketing:"בפרסום", done:"בוצע", cancelled:"בוטל"
}

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [expenses, setExpenses] = useState<Record<number,number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [debriefId, setDebriefId] = useState<number|null>(null)
  const [form, setForm] = useState({ name:"", date:"", time:"", location:"", budget_planned:0, target_attendees:0 })
  const [debrief, setDebrief] = useState({ actual_attendees:0, leads_collected:0, summary:"", follow_up:"" })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [er, ex] = await Promise.all([fetch("/api/events"), fetch("/api/expenses")])
      if (!er.ok) throw new Error()
      const { events } = await er.json()
      const { expenses } = await ex.json()
      setEvents(events||[])
      const m: Record<number,number> = {}
      ;(expenses||[]).forEach((e:any)=>{ if(e.event_id) m[e.event_id]=(m[e.event_id]||0)+(+e.amount||0) })
      setExpenses(m)
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  async function approve(id: number) {
    await fetch(`/api/events/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({approve:true})})
    setEvents(e=>e.map(x=>x.id===id?{...x,approved:true,status:"marketing"}:x))
  }

  async function createEvent() {
    if (!form.name) return
    setSaving(true)
    await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)})
    setSaving(false); setShowForm(false); setForm({name:"",date:"",time:"",location:"",budget_planned:0,target_attendees:0}); load()
  }

  async function submitDebrief(e: any) {
    setSaving(true)
    await fetch("/api/events/debrief",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...debrief, id:debriefId, event_name:e.name, assignees:[e.coordinator_name||""]})})
    setSaving(false); setDebriefId(null); setDebrief({actual_attendees:0,leads_collected:0,summary:"",follow_up:""}); load()
  }

  async function deleteEvent(id: number) {
    if (!confirm("למחוק אירוע זה?")) return
    await fetch(`/api/events/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({delete:true})})
    setEvents(e=>e.filter(x=>x.id!==id))
  }

  const filtered = filter ? events.filter(e=>e.status===filter) : events
  const debriefEvent = events.find(e=>e.id===debriefId)

  if (error) return <div className="p-4 md:p-6"><ErrorState retry={load}/></div>

  return <div className="p-4 md:p-6 lg:p-8 fade-up">
    <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0D2744]">ניהול אירועים</h1>
        <div className="text-sm text-[#64748B] mt-0.5">{events.length} אירועים</div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <ExportButton type="events"/>
        <Button onClick={()=>setShowForm(true)}>+ אירוע חדש</Button>
      </div>
    </div>

    {/* New event form */}
    {showForm && <Card className="mb-5 border-2 border-[#00488D]"><div className="p-5">
      <div className="text-sm font-bold text-[#00488D] mb-4">אירוע חדש</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div><label className="text-xs font-semibold block mb-1">שם *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">מיקום</label><input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">תאריך</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">שעה</label><input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">תקציב (₪)</label><input type="number" value={form.budget_planned||""} onChange={e=>setForm(f=>({...f,budget_planned:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">יעד משתתפים</label><input type="number" value={form.target_attendees||""} onChange={e=>setForm(f=>({...f,target_attendees:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
      </div>
      <div className="flex gap-2"><Button onClick={createEvent} disabled={saving}>{saving?"יוצר...":"צור אירוע"}</Button><Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button></div>
    </div></Card>}

    {/* Debrief modal */}
    {debriefId && debriefEvent && <Card className="mb-5 border-2 border-[#166534]"><div className="p-5">
      <div className="text-sm font-bold text-[#166534] mb-1">📋 תחקיר אירוע — {debriefEvent.name}</div>
      <div className="text-xs text-[#64748B] mb-4">מלא את הפרטים לסגירת האירוע ויצירת סיכום</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div><label className="text-xs font-semibold block mb-1">משתתפים בפועל</label><input type="number" value={debrief.actual_attendees||""} onChange={e=>setDebrief(d=>({...d,actual_attendees:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#166534]"/></div>
        <div><label className="text-xs font-semibold block mb-1">לידים שנאספו</label><input type="number" value={debrief.leads_collected||""} onChange={e=>setDebrief(d=>({...d,leads_collected:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#166534]"/></div>
      </div>
      <div className="mb-3"><label className="text-xs font-semibold block mb-1">סיכום האירוע</label><textarea value={debrief.summary} onChange={e=>setDebrief(d=>({...d,summary:e.target.value}))} rows={3} placeholder="מה הלך טוב? מה ניתן לשפר? תובנות..." className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm resize-none focus:outline-none focus:border-[#166534]"/></div>
      <div className="mb-4"><label className="text-xs font-semibold block mb-1">פעולת מעקב <span className="text-[#64748B] font-normal">(תיצור משימה אוטומטית)</span></label><input value={debrief.follow_up} onChange={e=>setDebrief(d=>({...d,follow_up:e.target.value}))} placeholder="לדוגמה: ליצור קשר עם כל הלידים שנאספו" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#166534]"/></div>
      <div className="flex gap-2">
        <Button onClick={()=>submitDebrief(debriefEvent)} disabled={saving}>{saving?"שומר...":"סגור אירוע ✓"}</Button>
        <Button variant="secondary" onClick={()=>setDebriefId(null)}>ביטול</Button>
      </div>
    </div></Card>}

    {/* Filter */}
    <div className="flex gap-2 mb-4 flex-wrap">
      {["","planning","pending_approval","approved","marketing","done","cancelled"].map(s=>(
        <button key={s} onClick={()=>setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter===s?"bg-[#00488D] text-white":"bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"}`}>
          {s===""?"הכל":ST[s]}
        </button>
      ))}
    </div>

    {loading && <div className="space-y-3">{Array.from({length:3}).map((_,i)=><SkeletonCard key={i} rows={4}/>)}</div>}

    {!loading && <div className="space-y-3">
      {filtered.map(e=>{
        const spent=expenses[e.id]||0; const bp=e.budget_planned>0?Math.round(spent/e.budget_planned*100):0
        const roi = e.leads_collected>0&&spent>0 ? Math.round(spent/e.leads_collected) : null
        const needsDebrief = e.status!=="done"&&e.status!=="cancelled"&&e.date&&e.date<new Date().toISOString().slice(0,10)
        return <div key={e.id} className="bg-white border border-[#E2E8F0] rounded-[14px] p-4">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <div className="text-base font-bold flex items-center gap-2">
                {e.name}
                {needsDebrief&&<span className="text-xs font-normal px-2 py-0.5 bg-[#FEF3C7] text-[#B45309] rounded-full animate-pulse">⏰ מחכה לתחקיר</span>}
              </div>
              <div className="text-xs text-[#64748B] mt-1">📅 {fd(e.date)} {e.time&&e.time} &nbsp;📍 {e.location}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge text={ST[e.status]||e.status}/>
              {!e.approved&&e.status==="pending_approval"&&<button onClick={()=>approve(e.id)} className="px-3 py-1 bg-[#DCFCE7] text-[#166534] text-xs font-bold rounded-lg hover:bg-[#BBF7D0]">✓ אשר</button>}
              {needsDebrief&&<button onClick={()=>{setDebriefId(e.id);setDebrief({actual_attendees:e.target_attendees||0,leads_collected:0,summary:"",follow_up:""})}} className="px-3 py-1 bg-[#FEF3C7] text-[#B45309] text-xs font-bold rounded-lg hover:bg-[#FDE68A]">📋 תחקיר</button>}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-center">
            <div className="bg-[#F8FAFC] rounded-[9px] p-2"><div className="text-sm font-bold">₪{(+e.budget_planned||0).toLocaleString()}</div><div className="text-[10px] text-[#64748B]">תקציב</div></div>
            <div className="bg-[#F8FAFC] rounded-[9px] p-2"><div className="text-sm font-bold">{e.target_attendees||0}→{e.actual_attendees||0}</div><div className="text-[10px] text-[#64748B]">יעד / בפועל</div></div>
            <div className="bg-[#F8FAFC] rounded-[9px] p-2"><div className="text-sm font-bold text-[#00488D]">{e.leads_collected||0}</div><div className="text-[10px] text-[#64748B]">לידים</div></div>
            <div className="bg-[#F8FAFC] rounded-[9px] p-2"><div className="text-sm font-bold">{roi?`₪${roi}`:"—"}</div><div className="text-[10px] text-[#64748B]">עלות/ליד</div></div>
          </div>
          {e.budget_planned>0&&<div><div className="flex justify-between text-xs mb-1"><span className="text-[#64748B]">₪{spent.toLocaleString()} / ₪{(+e.budget_planned).toLocaleString()}</span><span style={{color:bp>90?"#960010":bp>70?"#B45309":"#64748B"}}>{bp}%</span></div><div className="h-1.5 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${Math.min(bp,100)}%`,background:bp>90?"#960010":bp>70?"#B45309":"#00488D"}} className="h-full rounded-full"/></div></div>}
          {e.summary&&<div className="mt-3 text-xs text-[#475569] bg-[#F9FAFB] rounded-[9px] p-3">📝 {e.summary}</div>}
        </div>
      })}
      {filtered.length===0&&<div className="text-center py-12 text-sm text-[#94A3B8]">אין אירועים</div>}
    </div>}
  </div>
}