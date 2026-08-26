"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
const DAYS = ["א","ב","ג","ד","ה","ו","ש"]
const STATUS_COLORS: Record<string,string> = {
  planning:"#94A3B8", pending_approval:"#F59E0B", approved:"#10B981",
  marketing:"#3B82F6", done:"#8B5CF6", cancelled:"#EF4444"
}

export default function CalendarPage() {
  const [adminToken, setAdminToken] = useState("")

  useEffect(()=>{
    if (user?.id) {
      fetch(`/api/calendar-token?user_id=${user.id}`).then(r=>r.json()).then(d=>setAdminToken(d.token||""))
    }
  },[user])

  const icsUrl = adminToken ? `${typeof window!=="undefined"?window.location.origin:""}/api/calendar.ics/${adminToken}` : ""
  const googleCalUrl = icsUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(icsUrl)}` : ""

  const [events, setEvents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const [selected, setSelected] = useState<string|null>(null)
  const router = useRouter()

  useEffect(()=>{
    Promise.all([fetch("/api/events"),fetch("/api/tasks")]).then(async([er,tr])=>{
      const{events}=await er.json(); const{tasks}=await tr.json()
      setEvents(events||[]); setTasks(tasks||[])
    })
  },[])

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
      <div className="flex items-center gap-3 flex-wrap">
        <a href={googleCalUrl} target="_blank"
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-[9px] text-xs font-semibold text-[#374151] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          הוסף ל-Google Calendar
        </a>
        <a href="/api/calendar.ics" download
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-[9px] text-xs font-semibold text-[#374151] hover:bg-[#F8FAFC] transition-colors">
          ⬇ ייצוא ICS
        </a>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={()=>setNow(new Date(year,month-1,1))} className="w-8 h-8 rounded-[8px] border border-[#E2E8F0] hover:bg-[#F0F7FF] flex items-center justify-center text-[#64748B]">›</button>
        <div className="text-base font-bold min-w-[140px] text-center">{MONTHS[month]} {year}</div>
        <button onClick={()=>setNow(new Date(year,month+1,1))} className="w-8 h-8 rounded-[8px] border border-[#E2E8F0] hover:bg-[#F0F7FF] flex items-center justify-center text-[#64748B]">‹</button>
        <button onClick={()=>setNow(new Date())} className="px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-[8px] hover:bg-[#F0F7FF]">היום</button>
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