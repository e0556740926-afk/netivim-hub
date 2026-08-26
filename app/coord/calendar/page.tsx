"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
const DAYS_HE = ["א","ב","ג","ד","ה","ו","ש"]
const STATUS_COLORS: Record<string,string> = {
  planning:"#94A3B8", pending_approval:"#F59E0B", approved:"#10B981",
  marketing:"#3B82F6", done:"#8B5CF6", cancelled:"#EF4444"
}
const STATUS_LABEL: Record<string,string> = {
  planning:"תכנון", pending_approval:"ממתין לאישור",
  approved:"מאושר", marketing:"בפרסום", done:"בוצע"
}

export default function CoordCalendar() {
  const { user } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const [selected, setSelected] = useState<string|null>(null)
  const [calToken, setCalToken] = useState("")
  const [copied, setCopied] = useState(false)
  const [coord, setCoord] = useState<any>(null)

  useEffect(() => {
    if (!user) return
    // Load coord + token
    fetch(`/api/coord?user_id=${user.id}`).then(r=>r.json()).then(async ({coord}) => {
      if (!coord) return
      setCoord(coord)
      // Load events and tasks
      const [er, tr, tok] = await Promise.all([
        fetch("/api/events"),
        fetch(`/api/tasks?name=${encodeURIComponent(user.name)}`),
        fetch(`/api/calendar-token?user_id=${user.id}`)
      ])
      const { events } = await er.json()
      const { tasks } = await tr.json()
      const { token } = await tok.json()
      // Filter events for this coordinator
      setEvents((events||[]).filter((e:any) => e.coordinator_id === coord.id && e.status !== "cancelled"))
      setTasks(tasks||[])
      setCalToken(token||"")
    })
  }, [user])

  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const today = new Date().toISOString().slice(0,10)

  function getDay(d: number) {
    const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`
    return {
      ds,
      events: events.filter(e => e.date?.slice(0,10) === ds),
      tasks: tasks.filter(t => t.due_date?.slice(0,10) === ds && t.status !== "done")
    }
  }

  const cells = Array.from({length:42}, (_,i) => {
    const d = i - firstDay + 1
    return d >= 1 && d <= daysInMonth ? d : null
  })

  const selectedItems = selected ? {
    events: events.filter(e => e.date?.slice(0,10) === selected),
    tasks: tasks.filter(t => t.due_date?.slice(0,10) === selected && t.status !== "done")
  } : null

  const icsUrl = calToken && typeof window !== "undefined"
    ? `${window.location.origin}/api/calendar.ics/${calToken}` : ""
  const googleUrl = icsUrl
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(icsUrl)}` : ""

  async function copyLink() {
    if (!icsUrl) return
    await navigator.clipboard.writeText(icsUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="p-4 pb-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-xl font-extrabold mb-3">לוח שנה</div>

      {/* Google Calendar connection */}
      <div className="bg-[#0D2744] rounded-[16px] p-4 mb-4">
        <div className="text-white text-sm font-bold mb-1">📅 חיבור ליומן Google</div>
        <div className="text-[#60A5FA] text-xs mb-3">האירועים והמשימות שלך יופיעו ביומן שלך אוטומטית</div>
        <div className="flex gap-2 mb-3">
          <a href={googleUrl} target="_blank"
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 bg-white rounded-[10px] text-xs font-bold text-[#0D2744] hover:bg-[#F0F7FF] transition-colors ${!googleUrl?"opacity-50 pointer-events-none":""}`}>
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            הוסף ל-Google Calendar
          </a>
        </div>
        {/* Copy link section */}
        <div className="bg-white/10 rounded-[10px] p-3">
          <div className="text-white/70 text-[10px] mb-1.5">הלינק האישי שלך (לשימוש ב-Apple / Outlook / יומן אחר)</div>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/10 rounded-[8px] px-2.5 py-1.5 text-[10px] text-white/60 font-mono truncate">
              {icsUrl || "טוען..."}
            </div>
            <button onClick={copyLink}
              className="flex-shrink-0 px-3 py-1.5 bg-[#60A5FA] text-[#0D2744] text-xs font-bold rounded-[8px] hover:bg-[#93C5FD] transition-colors">
              {copied ? "✓ הועתק" : "העתק"}
            </button>
          </div>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setNow(new Date(year, month-1, 1))}
          className="w-8 h-8 rounded-[8px] border border-[#E2E8F0] bg-white hover:bg-[#F0F7FF] flex items-center justify-center text-[#64748B]">›</button>
        <div className="text-base font-bold">{MONTHS[month]} {year}</div>
        <button onClick={() => setNow(new Date(year, month+1, 1))}
          className="w-8 h-8 rounded-[8px] border border-[#E2E8F0] bg-white hover:bg-[#F0F7FF] flex items-center justify-center text-[#64748B]">‹</button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] overflow-hidden mb-4">
        <div className="grid grid-cols-7 border-b border-[#E2E8F0]">
          {DAYS_HE.map(d => (
            <div key={d} className="py-2 text-center text-xs font-bold text-[#64748B]">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-[70px] border-b border-l border-[#F1F5F9]"/>
            const { ds, events: de, tasks: dt } = getDay(d)
            const isToday = ds === today
            const isSelected = ds === selected
            const hasItems = de.length > 0 || dt.length > 0
            return (
              <div key={i} onClick={() => setSelected(ds === selected ? null : ds)}
                className={`min-h-[70px] border-b border-l border-[#F1F5F9] p-1 cursor-pointer transition-colors ${
                  isSelected ? "bg-[#F0F7FF]" : hasItems ? "hover:bg-[#F8FAFC]" : ""
                }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                  isToday ? "bg-[#0D2744] text-white" : isSelected ? "bg-[#DBEAFE] text-[#1E40AF]" : "text-[#374151]"
                }`}>{d}</div>
                <div className="space-y-0.5">
                  {de.slice(0,2).map((e:any) => (
                    <div key={e.id} style={{background:STATUS_COLORS[e.status]||"#94A3B8"}}
                      className="text-white text-[9px] px-1 py-0.5 rounded truncate">{e.name}</div>
                  ))}
                  {dt.slice(0,1).map((t:any) => (
                    <div key={t.id} className="text-[9px] px-1 py-0.5 rounded truncate bg-[#F0F4F8] text-[#64748B]">
                      ✅ {t.title}
                    </div>
                  ))}
                  {(de.length + dt.length) > 3 && (
                    <div className="text-[9px] text-[#94A3B8]">+{de.length+dt.length-3} עוד</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected day panel */}
      {selected && selectedItems && (
        <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4 fade-up">
          <div className="text-sm font-bold mb-3">
            {new Date(selected+"T12:00:00").toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          {selectedItems.events.length === 0 && selectedItems.tasks.length === 0 && (
            <div className="text-sm text-[#94A3B8] text-center py-3">אין פעילות ביום זה</div>
          )}
          {selectedItems.events.map((e:any) => (
            <div key={e.id} className="flex items-start gap-3 py-2.5 border-b border-[#F1F5F9] last:border-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                style={{background:STATUS_COLORS[e.status]||"#94A3B8"}}/>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{e.name}</div>
                <div className="text-xs text-[#64748B]">
                  {e.time && `🕐 ${e.time} · `}📍 {e.location}
                </div>
                <div className="text-xs mt-0.5">
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{background:STATUS_COLORS[e.status]+"22",color:STATUS_COLORS[e.status]}}>
                    {STATUS_LABEL[e.status]||e.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {selectedItems.tasks.map((t:any) => (
            <div key={t.id} className="flex items-start gap-3 py-2.5 border-b border-[#F1F5F9] last:border-0">
              <div className="text-base">✅</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{t.title}</div>
                <div className="text-xs text-[#64748B]">
                  {({"call":"שיחה","meeting":"פגישה","materials":"חומרים","backoffice":"בק-אופיס"} as Record<string,string>)[t.type]||t.type}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(STATUS_LABEL).map(([k,v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{background:STATUS_COLORS[k]}}/>
            <span className="text-xs text-[#64748B]">{v}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="text-xs">✅</span>
          <span className="text-xs text-[#64748B]">משימה</span>
        </div>
      </div>
    </div>
  )
}