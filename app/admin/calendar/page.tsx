"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import CalendarPopup from "@/components/ui/CalendarPopup"

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
const DAYS = ["א","ב","ג","ד","ה","ו","ש"]
const STATUS_COLORS: Record<string,string> = {
  planning:"#94A3B8", pending_approval:"#F59E0B", approved:"#10B981",
  marketing:"#3B82F6", done:"#8B5CF6", cancelled:"#EF4444"
}

export default function CalendarPage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const [selected, setSelected] = useState<string|null>(null)
  const [adminToken, setAdminToken] = useState("")
  const router = useRouter()

  useEffect(()=>{
    Promise.all([fetch("/api/events"),fetch("/api/tasks")]).then(async([er,tr])=>{
      const{events}=await er.json(); const{tasks}=await tr.json()
      setEvents(events||[]); setTasks(tasks||[])
    })
  },[])

  useEffect(()=>{
    if (!user) return
    const params = new URLSearchParams()
    if (user.id && user.id !== 0) params.set("user_id", String(user.id))
    if (user.email) params.set("email", user.email)
    fetch(`/api/calendar-token?${params}`)
      .then(r=>r.json()).then(d=>setAdminToken(d.token||"")).catch(()=>{})
  },[user])

  const year=now.getFullYear(), month=now.getMonth()
  const firstDay=new Date(year,month,1).getDay()
  const daysInMonth=new Date(year,month+1,0).getDate()
  const today=new Date().toISOString().slice(0,10)

  function getItemsForDay(d:number){
    const dateStr=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`
    const dayEvents=events.filter(e=>e.date?.slice(0,10)===dateStr)
    const dayTasks=tasks.filter(t=>t.due_date?.slice(0,10)===dateStr&&t.status!=="done")
    return{dateStr,events:dayEvents,tasks:dayTasks}
  }

  const selectedItems=selected?{
    events:events.filter(e=>e.date?.slice(0,10)===selected),
    tasks:tasks.filter(t=>t.due_date?.slice(0,10)===selected&&t.status!=="done")
  }:null

  const cells=Array.from({length:42},(_,i)=>{
    const dayNum=i-firstDay+1
    return dayNum>=1&&dayNum<=daysInMonth?dayNum:null
  })

  return <div className="p-4 md:p-6 lg:p-8 fade-up">
    <div className="flex items-center justify-between mb-5">
      <h1 className="text-2xl font-extrabold text-[#0D2744]">לוח שנה</h1>
      <div className="flex items-center gap-3">
        <button onClick={()=>setNow(new Date(year,month-1,1))} className="w-8 h-8 rounded-[8px] border border-[#E2E8F0] hover:bg-[#F0F7FF] flex items-center justify-center text-[#64748B]">›</button>
        <div className="text-base font-bold min-w-[140px] text-center">{MONTHS[month]} {year}</div>
        <button onClick={()=>setNow(new Date(year,month+1,1))} className="w-8 h-8 rounded-[8px] border border-[#E2E8F0] hover:bg-[#F0F7FF] flex items-center justify-center text-[#64748B]">‹</button>
        <button onClick={()=>setNow(new Date())} className="px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-[8px] hover:bg-[#F0F7FF]">היום</button>
        <CalendarPopup token={adminToken} label="לינק יומן"/>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      {/* Calendar grid */}
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[#E2E8F0]">
          {DAYS.map(d=><div key={d} className="py-2 text-center text-xs font-bold text-[#64748B]">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d,i)=>{
            if(!d) return <div key={i} className="min-h-[80px] border-b border-l border-[#F1F5F9]"/>
            const{dateStr,events:de,tasks:dt}=getItemsForDay(d)
            const isToday=dateStr===today
            const isSelected=dateStr===selected
            const hasItems=de.length>0||dt.length>0
            return <div key={i} onClick={()=>setSelected(dateStr===selected?null:dateStr)}
              className={`min-h-[80px] border-b border-l border-[#F1F5F9] p-1.5 cursor-pointer transition-colors ${isSelected?"bg-[#F0F7FF]":hasItems?"hover:bg-[#F8FAFC]":""}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${isToday?"bg-[#0D2744] text-white":isSelected?"bg-[#DBEAFE] text-[#1E40AF]":"text-[#374151]"}`}>{d}</div>
              <div className="space-y-0.5">
                {de.slice(0,2).map((e:any)=><div key={e.id} style={{background:STATUS_COLORS[e.status]||"#94A3B8"}} className="text-white text-[9px] px-1 py-0.5 rounded truncate">{e.name}</div>)}
                {dt.slice(0,1).map((t:any)=><div key={t.id} className="text-[9px] px-1 py-0.5 rounded truncate bg-[#F0F4F8] text-[#64748B]">✅ {t.title}</div>)}
                {(de.length+dt.length)>3&&<div className="text-[9px] text-[#94A3B8]">+{de.length+dt.length-3} עוד</div>}
              </div>
            </div>
          })}
        </div>
      </div>

      {/* Selected day panel */}
      <div>
        {selected&&selectedItems ? <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4">
          <div className="text-sm font-bold mb-4">{new Date(selected+"T12:00:00").toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"})}</div>
          {selectedItems.events.length===0&&selectedItems.tasks.length===0&&<div className="text-sm text-[#94A3B8] text-center py-4">אין פעילות ביום זה</div>}
          {selectedItems.events.map((e:any)=><div key={e.id} onClick={()=>router.push("/admin/events")} className="flex items-start gap-2.5 py-3 border-b border-[#F1F5F9] last:border-0 cursor-pointer hover:bg-[#F8FAFC] rounded-lg px-2 -mx-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{background:STATUS_COLORS[e.status]||"#94A3B8"}}/>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{e.name}</div><div className="text-xs text-[#64748B]">{e.time} · {e.location}</div></div>
          </div>)}
          {selectedItems.tasks.map((t:any)=><div key={t.id} className="flex items-start gap-2.5 py-3 border-b border-[#F1F5F9] last:border-0">
            <div className="text-sm flex-shrink-0">✅</div>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{t.title}</div><div className="text-xs text-[#64748B]">{t.assignees?.join(", ")}</div></div>
          </div>)}
        </div> : <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4">
          <div className="text-sm text-[#94A3B8] text-center py-8">לחץ על יום לצפייה בפעילות</div>
          <div className="space-y-2">
            <div className="text-xs font-bold text-[#64748B] mb-2">מקרא</div>
            {Object.entries({planning:"תכנון",pending_approval:"ממתין לאישור",approved:"מאושר",marketing:"בפרסום",done:"בוצע"}).map(([k,v])=>(
              <div key={k} className="flex items-center gap-2"><div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:STATUS_COLORS[k]}}/><span className="text-xs">{v}</span></div>
            ))}
          </div>
        </div>}
      </div>
    </div>
  </div>
}