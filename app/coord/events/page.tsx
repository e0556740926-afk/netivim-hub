"use client"
import EmptyState from "@/components/ui/EmptyState"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd } from "@/lib/utils"

const STATUS_LABEL: Record<string,string> = {
  planning:"תכנון", pending_approval:"ממתין לאישורי", approved:"מאושר",
  marketing:"בפרסום", done:"בוצע", cancelled:"בוטל"
}
const STATUS_COLORS: Record<string,{bg:string,color:string}> = {
  planning:{bg:"#F3F4F6",color:"#374151"},
  pending_approval:{bg:"#FEF3C7",color:"#B45309"},
  approved:{bg:"#DCFCE7",color:"#166534"},
  marketing:{bg:"#DBEAFE",color:"#1E40AF"},
  done:{bg:"#EDE9FE",color:"#5B21B6"},
  cancelled:{bg:"#FEE2E2",color:"#991B1B"},
}
const MONTHS = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"]

export default function CoordEvents() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  const [expenses, setExpenses] = useState<Record<number,number>>({})
  const [coordId, setCoordId] = useState<number|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState("")
  const [form, setForm] = useState({ name:"", date:"", time:"", location:"", budget_planned:0, target_attendees:0 })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      if (!user) return
      const [cr, er, ex] = await Promise.all([
        fetch(`/api/coord?user_id=${user.id}`), fetch("/api/events"), fetch("/api/expenses")
      ])
      const { coord } = await cr.json()
      setCoordId(coord?.id || null)
      const { events } = await er.json()
      const { expenses } = await ex.json()
      setEvents(events||[])
      const m: Record<number,number> = {}
      ;(expenses||[]).forEach((e:any)=>{ if(e.event_id) m[e.event_id]=(m[e.event_id]||0)+(+e.amount||0) })
      setExpenses(m)
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(()=>{ if(user) load() },[user])

  async function create() {
    if (!form.name.trim()) return
    setSaving(true)
    await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,status:"pending_approval",approved:false,coordinator_id:coordId})})
    setSaving(false); setShowForm(false); setForm({name:"",date:"",time:"",location:"",budget_planned:0,target_attendees:0}); load()
  }

  const filtered = filter ? events.filter(e=>e.status===filter) : events

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={3}/>)}</div>

  return <div className="p-4">
    <div className="flex items-center justify-between mb-3">
      <div className="text-lg font-extrabold">אירועים</div>
      <button onClick={()=>setShowForm(true)} className="px-3 py-1.5 bg-[#0D2744] text-white rounded-[9px] text-sm font-semibold">+ הצע אירוע</button>
    </div>

    {/* New event form */}
    {showForm&&<div className="bg-white border-2 border-[#00488D] rounded-[14px] p-4 mb-4 fade-up">
      <div className="text-sm font-bold text-[#00488D] mb-1">הצעת אירוע חדש</div>
      <div className="text-xs text-[#B45309] bg-[#FEF3C7] rounded-[8px] px-3 py-2 mb-3">האירוע ישלח לאישור המנהל לפני הביצוע</div>
      <div className="space-y-2.5">
        <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="שם האירוע *" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="מיקום" className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <input type="number" value={form.budget_planned||""} onChange={e=>setForm(f=>({...f,budget_planned:+e.target.value}))} placeholder="תקציב מבוקש (₪)" className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          <input type="number" value={form.target_attendees||""} onChange={e=>setForm(f=>({...f,target_attendees:+e.target.value}))} placeholder="יעד משתתפים" className="px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={create} disabled={saving} className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50">{saving?"שולח...":"שלח לאישור"}</button>
          <button onClick={()=>setShowForm(false)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-[10px] text-sm">ביטול</button>
        </div>
      </div>
    </div>}

    {/* Filter */}
    <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
      {(["","pending_approval","planning","approved","marketing","done"] as const).map(s=>(
        <button key={s} onClick={()=>setFilter(s)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${filter===s?"bg-[#0D2744] text-white":"bg-white border border-[#E2E8F0] text-[#475569]"}`}>
          {s===""?"הכל":STATUS_LABEL[s]}
        </button>
      ))}
    </div>

    {/* Events list */}
    <div className="space-y-3">
      {filtered.length===0&&<EmptyState icon="📅" title={filter?"אין אירועים בסטטוס זה":"אין אירועים"} hint={filter?undefined:"תוכל להציע אירוע חדש — הוא יישלח לאישור המנהל"} actionLabel={filter?undefined:"+ הצע אירוע"} onAction={()=>setShowForm(true)} onClearFilters={filter?()=>setFilter(""):undefined}/>}
      {filtered.map(e=>{
        const d=new Date(e.date)
        const spent=expenses[e.id]||0
        const bp=e.budget_planned>0?Math.round(spent/e.budget_planned*100):0
        const sc=STATUS_COLORS[e.status]||{bg:"#F3F4F6",color:"#374151"}
        return <div key={e.id} className="bg-white border border-[#E2E8F0] rounded-[14px] p-4">
          <div className="flex items-start gap-3 mb-3">
            {e.date&&<div className="text-center flex-shrink-0 w-12 bg-[#F0F7FF] rounded-[10px] py-1.5">
              <div className="text-lg font-extrabold leading-none text-[#0D2744]">{d.getDate()}</div>
              <div className="text-[10px] text-[#64748B]">{MONTHS[d.getMonth()]}</div>
            </div>}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{e.name}</div>
              <div className="text-xs text-[#64748B] mt-0.5">{e.time&&`${e.time} · `}{e.location}</div>
              {e.coordinator_name && e.coordinator_name!==user?.name && <div className="text-[10px] text-[#94A3B8] mt-0.5">הוצע ע"י {e.coordinator_name}</div>}
            </div>
            <span style={sc} className="px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap">{STATUS_LABEL[e.status]||e.status}</span>
          </div>

          {e.status==="pending_approval"&&<div className="flex items-center gap-2 text-xs text-[#B45309] bg-[#FEF3C7] rounded-[8px] px-3 py-2 mb-3">
            ⏳ מחכה לאישור המנהל
          </div>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center mb-3">
            <div className="bg-[#F8FAFC] rounded-[8px] p-2"><div className="text-sm font-bold">₪{e.budget_planned?.toLocaleString()||0}</div><div className="text-[10px] text-[#64748B]">תקציב</div></div>
            <div className="bg-[#F8FAFC] rounded-[8px] p-2"><div className="text-sm font-bold">{e.target_attendees||0}{e.attendee_count>0?`/${e.attendee_count}`:""}</div><div className="text-[10px] text-[#64748B]">יעד/נרשמו</div></div>
            <div className="bg-[#F8FAFC] rounded-[8px] p-2"><div className="text-sm font-bold text-[#00488D]">{e.leads_from_event>0?e.leads_from_event:(e.leads_collected||0)}</div><div className="text-[10px] text-[#64748B]">לידים</div></div>
          </div>
          {e.waitlist_count>0 && <div className="text-xs text-[#B45309] bg-[#FEF3C7] rounded-[8px] px-3 py-2 mb-3">⏳ {e.waitlist_count} ברשימת המתנה</div>}

          {e.budget_planned>0&&<div>
            <div className="flex justify-between text-xs mb-1"><span className="text-[#64748B]">₪{spent.toLocaleString()} מתוך ₪{e.budget_planned?.toLocaleString()}</span><span style={{color:bp>90?"#960010":bp>70?"#B45309":"#166534"}}>{bp}%</span></div>
            <div className="h-1.5 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${Math.min(bp,100)}%`,background:bp>90?"#960010":bp>70?"#B45309":"#00488D"}} className="h-full rounded-full"/></div>
          </div>}
        </div>
      })}
    </div>
  </div>
}