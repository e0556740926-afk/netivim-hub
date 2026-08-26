"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import CalendarPopup from "@/components/ui/CalendarPopup"

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
  const [coord, setCoord] = useState<any>(null)
  const [calToken, setCalToken] = useState("")

  useEffect(() => {
    if (!user) return
    // Load coord + token
    fetch(`/api/coord?user_id=${user.id}`).then(r=>r.json()).then(async ({coord}) => {
      if (!coord) return
      setCoord(coord)
      // Load events and tasks
      const [er, tr] = await Promise.all([
        fetch("/api/events"),
        fetch(`/api/tasks?name=${encodeURIComponent(user.name)}`)
      ])
      const { events } = await er.json()
      const { tasks } = await tr.json()
      setEvents((events||[]).filter((e:any) => e.coordinator_id === coord.id && e.status !== "cancelled"))
      setTasks(tasks||[])
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

    return (
    <div className="p-4 pb-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xl font-extrabold">לוח שנה</div>
        <CalendarPopup token={calToken} label="לינק יומן"/>
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