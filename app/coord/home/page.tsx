"use client"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { fd, leadColor, pct } from "@/lib/utils"
import Speedometer from "@/components/ui/Speedometer"
import Badge from "@/components/ui/Badge"

const MONTHS = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"]
const STATUS_LABEL: Record<string, string> = { planning:"תכנון", pending_approval:"ממתין לאישור", approved:"מאושר", marketing:"בפרסום", done:"בוצע" }

export default function CoordHome() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const router = useRouter()
  const [coord, setCoord] = useState<any>(null)
  const [myLeads, setMyLeads] = useState(0)
  const [target, setTarget] = useState(0)
  const [linkCount, setLinkCount] = useState(0)
  const [tasks, setTasks] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [daily, setDaily] = useState("")
  const m = new Date().getMonth() + 1
  const y = new Date().getFullYear()
  const daysLeft = new Date(y, m, 0).getDate() - new Date().getDate()
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true); setError(false)
    try {
      const cRes = await fetch(`/api/coord?user_id=${user!.id}`)
      const { coord: c } = await cRes.json()
      if (!c) return
      setCoord(c)

      const [leadsRes, tasksRes, eventsRes] = await Promise.all([
        fetch(`/api/leads?coordinator_id=${c.id}`),
        fetch(`/api/tasks?name=${encodeURIComponent(user!.name)}`),
        fetch(`/api/events`),
      ])
      const { leads } = await leadsRes.json()
      const { tasks: myTasks } = await tasksRes.json()
      const { events: allEvents } = await eventsRes.json()

      const monthLeads = leads.filter((l: any) => l.created_at?.slice(0, 7) === `${y}-${String(m).padStart(2, "0")}`)
      setMyLeads(monthLeads.length)
      setLinkCount(leads.filter((l: any) => l.source === "link").length)
      setTasks(myTasks.slice(0, 5))

      const month = new Date().getMonth() + 1, yr = new Date().getFullYear()
      const tRes = await fetch(`/api/targets`)
      const { targets } = await tRes.json()
      const myTarget = targets.find((t: any) => t.coordinator_id === c.id)?.target_leads || 0
      setTarget(myTarget)

      const myEvents = allEvents.filter((e: any) => e.coordinator_id === c.id && e.status !== "done").slice(0, 3)
      setEvents(myEvents)
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }

  async function doneTask(id: number) {
    await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "done", status_only: true }) })
    setTasks(t => t.filter(x => x.id !== id))
  }

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={3}/>)}</div>

  return <div className="p-4 max-w-2xl mx-auto">
    <div className="text-xl font-extrabold mb-0.5">שלום {user?.name?.split(" ")[0]},</div>
    <div className="text-sm text-[#64748B] mb-4">יש לך {tasks.length} משימות פתוחות</div>

    <div className="bg-[#0D2744] rounded-[18px] p-5 flex items-center gap-4 mb-3">
      <Speedometer actual={myLeads} target={target} size={104} dark />
      <div className="text-white">
        <div className="text-xs opacity-70">יעד לידים · {MONTHS[new Date().getMonth()]}</div>
        <div style={{ color: leadColor(pct(myLeads, target)) }} className="text-3xl font-extrabold leading-tight">{pct(myLeads, target)}%</div>
        <div className="text-xs opacity-75 mt-1">נותרו {daysLeft} ימים</div>
      </div>
    </div>

    <div onClick={() => router.push("/coord/link")} className="bg-[#00488D] rounded-[16px] p-4 flex items-center justify-between text-white cursor-pointer mb-4">
      <div><div className="text-base font-bold">שתף את הלינק שלי</div><div className="text-xs opacity-80">{linkCount} אנשים מילאו את הטופס</div></div>
      <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">↗</div>
    </div>

    <div className="flex justify-between items-center mb-2.5">
      <div className="text-base font-bold">המשימות שלי</div>
      <div onClick={() => router.push("/coord/tasks")} className="text-xs text-[#00488D] font-semibold cursor-pointer">הכל</div>
    </div>
    <div className="space-y-2 mb-4">
      {tasks.map(t => {
        const late = t.due_date && t.due_date.slice(0, 10) < today
        const accent = late ? "#960010" : t.status === "waiting" ? "#B45309" : "#00488D"
        return <div key={t.id} style={{ borderRight: `3px solid ${accent}` }} className="bg-white border border-[#E2E8F0] rounded-[12px] p-3 flex items-center gap-3">
          <div onClick={() => doneTask(t.id)} style={{ borderColor: accent, color: accent }} className="w-6 h-6 flex-shrink-0 rounded-[7px] border-2 cursor-pointer flex items-center justify-center text-xs font-bold">✓</div>
          <div className="flex-1"><div className="text-sm font-semibold">{t.title}</div><div style={{ color: accent }} className="text-xs font-semibold mt-0.5">{late ? "⚠ " : ""}{fd(t.due_date?.slice(0,10))}</div></div>
        </div>
      })}
      {tasks.length === 0 && <div className="text-sm text-[#94A3B8] text-center py-3">אין משימות פתוחות 🎉</div>}
    </div>

    {events.length > 0 && <>
      <div className="text-base font-bold mb-2.5">האירועים שלי</div>
      <div className="space-y-2 mb-4">
        {events.map(e => {
          const d = new Date(e.date)
          return <div key={e.id} className="bg-white border border-[#E2E8F0] rounded-[12px] p-3 flex items-center gap-3">
            <div className="w-11 text-center flex-shrink-0"><div className="text-base font-extrabold leading-none">{d.getDate()}</div><div className="text-xs text-[#64748B]">{MONTHS[d.getMonth()]}</div></div>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{e.name}</div><div className="text-xs text-[#64748B] truncate">{e.location}</div></div>
            <Badge text={STATUS_LABEL[e.status] || e.status} />
          </div>
        })}
      </div>
    </>}

    <div className="bg-[#DBEAFE] rounded-[16px] p-4">
      <div className="text-sm font-bold text-[#0D2744] mb-2">מה עשית היום לקידום היעד?</div>
      <input value={daily} onChange={e => setDaily(e.target.value)} placeholder="בשורה אחת…" className="w-full px-3 py-2.5 border border-[#BFDBFE] rounded-[10px] text-sm bg-white focus:outline-none focus:border-[#00488D]" />
      <div className="mt-2.5 text-center py-2.5 rounded-[10px] bg-[#0D2744] text-white text-sm font-semibold cursor-pointer">שמור לדיווח השבועי</div>
    </div>
  </div>
}