"use client"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { fd, leadColor, pct, MONTH_HE } from "@/lib/utils"
import Speedometer from "@/components/ui/Speedometer"
import Badge from "@/components/ui/Badge"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { Chip, Empty, relTime, DoneCheck, BLUE, BAD, WARN } from "@/components/dashboard/primitives"

const STATUS_LABEL: Record<string, string> = { planning: "תכנון", pending_approval: "ממתין לאישור", approved: "מאושר", marketing: "בפרסום", done: "בוצע" }
const LEAD_STATUS: Record<string, string> = { new: "חדש", contacted: "יצרתי קשר", advanced: "עבר לשלב", irrelevant: "לא רלוונטי" }

export default function CoordHome() {
  const { user } = useAuth()
  const router = useRouter()
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [gone, setGone] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch("/api/dashboard/coord")
      if (!r.ok) throw new Error()
      setD(await r.json())
    } catch { setError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (user) load() }, [user, load])

  async function doneTask(id: number) {
    setGone(s => new Set(s).add(id))
    await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "done", status_only: true }) })
  }
  function copyLink() {
    if (!d?.coord?.slug) return
    navigator.clipboard.writeText(`${window.location.origin}/j/${d.coord.slug}`)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  if (error) return <div className="p-6"><ErrorState retry={load} /></div>
  if (loading || !d) return <div className="p-4 max-w-2xl mx-auto space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} rows={3} />)}</div>
  if (!d.coord) return <div className="p-6"><Empty text="המשתמש שלך לא מקושר לרכז — פנה למנהל" /></div>

  const m = new Date().getMonth()
  const daysLeft = new Date(new Date().getFullYear(), m + 1, 0).getDate() - new Date().getDate()
  const p = pct(d.leads_this_month, d.target)
  const overdue = d.tasks.overdue.filter((t: any) => !gone.has(t.id))
  const today = d.tasks.today.filter((t: any) => !gone.has(t.id))
  const later = d.tasks.later.filter((t: any) => !gone.has(t.id)).slice(0, 4)
  const openCount = overdue.length + today.length + d.tasks.later.filter((t: any) => !gone.has(t.id)).length

  const TaskRow = ({ t, accent }: { t: any; accent: string }) => (
    <div style={{ borderRightColor: accent }} className="bg-white border border-[#E2E8F0] border-r-[3px] rounded-[12px] p-3 flex items-center gap-3">
      <DoneCheck onDone={() => doneTask(t.id)} color={accent} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#0D2744] truncate">{t.title}</div>
        <div className="text-xs mt-0.5 flex gap-2 flex-wrap">
          <span style={{ color: accent }} className="font-semibold">{t.due_date ? fd(t.due_date) : "ללא תאריך"}</span>
          {t.contact_name && <span className="text-[#64748B]">👤 {t.contact_name}</span>}
          {t.event_name && <span className="text-[#64748B]">🎪 {t.event_name}</span>}
        </div>
      </div>
      {t.priority === "urgent" && <Chip tone="bad">דחוף</Chip>}
    </div>
  )

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto fade-up">
      <div className="text-xl font-extrabold mb-0.5">שלום {user?.name?.split(" ")[0]},</div>
      <div className="text-sm text-[#64748B] mb-4">
        {openCount === 0 ? "אין לך משימות פתוחות 🎉" : <>יש לך <b className="text-[#0D2744]">{openCount}</b> משימות פתוחות{overdue.length > 0 && <>, <span className="text-[#960010] font-bold">{overdue.length} באיחור</span></>}</>}
      </div>

      {/* Target */}
      <div className="bg-[#0D2744] rounded-[18px] p-5 flex items-center gap-4 mb-3">
        <Speedometer actual={d.leads_this_month} target={d.target} size={104} dark />
        <div className="text-white flex-1">
          <div className="text-xs opacity-70">יעד לידים · {MONTH_HE[m]}</div>
          <div style={{ color: leadColor(p) }} className="text-3xl font-extrabold leading-tight">{d.target ? `${p}%` : d.leads_this_month}</div>
          <div className="text-xs opacity-75 mt-1">{d.target ? `חסרים ${Math.max(0, d.target - d.leads_this_month)} · ` : ""}נותרו {daysLeft} ימים</div>
        </div>
      </div>

      {/* Personal link */}
      <div className="bg-[#00488D] rounded-[16px] p-4 flex items-center justify-between text-white mb-4">
        <div onClick={() => router.push("/coord/link")} className="cursor-pointer flex-1">
          <div className="text-base font-bold">הלינק האישי שלי</div>
          <div className="text-xs opacity-80">{d.link_leads} לידים הגיעו דרכו</div>
        </div>
        <button onClick={copyLink} className="text-xs font-bold bg-white/15 hover:bg-white/25 px-3 py-2 rounded-lg transition-[background-color,transform] active:scale-95">{copied ? "הועתק ✓" : "העתק"}</button>
      </div>

      {/* Tasks */}
      {overdue.length > 0 && <>
        <div className="text-sm font-bold text-[#960010] mb-2">באיחור · {overdue.length}</div>
        <div className="space-y-2 mb-4">{overdue.map((t: any) => <TaskRow key={t.id} t={t} accent={BAD} />)}</div>
      </>}
      <div className="flex justify-between items-center mb-2">
        <div className="text-base font-bold">היום · {today.length}</div>
        <div onClick={() => router.push("/coord/tasks")} className="text-xs text-[#00488D] font-semibold cursor-pointer">כל המשימות</div>
      </div>
      <div className="space-y-2 mb-4">
        {today.map((t: any) => <TaskRow key={t.id} t={t} accent={t.priority === "urgent" ? WARN : BLUE} />)}
        {!today.length && <div className="text-sm text-[#94A3B8] bg-white border border-dashed border-[#E2E8F0] rounded-[12px] p-3 text-center">אין משימות להיום</div>}
        {later.length > 0 && <>
          <div className="text-xs font-bold text-[#64748B] pt-1">בהמשך</div>
          {later.map((t: any) => <TaskRow key={t.id} t={t} accent="#94A3B8" />)}
        </>}
      </div>

      {/* Events */}
      <div className="flex justify-between items-center mb-2">
        <div className="text-base font-bold">האירועים שלי</div>
        <div onClick={() => router.push("/coord/events")} className="text-xs text-[#00488D] font-semibold cursor-pointer">הכל</div>
      </div>
      <div className="space-y-2 mb-4">
        {d.events.map((e: any) => {
          const dt = e.date ? new Date(e.date) : null
          return (
            <div key={e.id} onClick={() => router.push("/coord/events")} className="bg-white border border-[#E2E8F0] rounded-[12px] p-3 flex items-center gap-3 cursor-pointer active:scale-[.99] transition-transform">
              <div className="w-11 text-center flex-shrink-0">{dt ? <><div className="text-base font-extrabold leading-none">{dt.getDate()}</div><div className="text-xs text-[#64748B]">{MONTH_HE[dt.getMonth()]}</div></> : <div className="text-xs text-[#94A3B8]">—</div>}</div>
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{e.name}</div><div className="text-xs text-[#64748B] truncate">{e.location || "—"}</div></div>
              <Badge text={STATUS_LABEL[e.status] || e.status} />
            </div>
          )
        })}
        {!d.events.length && <div className="text-sm text-[#94A3B8] bg-white border border-dashed border-[#E2E8F0] rounded-[12px] p-3 text-center">אין אירועים פתוחים — <span className="text-[#00488D] font-semibold" onClick={() => router.push("/coord/events")}>צור אירוע</span></div>}
      </div>

      {/* Contacts needing touch */}
      {d.contacts_cold.length > 0 && <>
        <div className="flex justify-between items-center mb-2">
          <div className="text-base font-bold">שותפים שדורשים מגע</div>
          <div onClick={() => router.push("/coord/contacts")} className="text-xs text-[#00488D] font-semibold cursor-pointer">הכל</div>
        </div>
        <div className="space-y-1.5 mb-4">
          {d.contacts_cold.map((c: any) => (
            <div key={c.id} onClick={() => router.push(`/coord/contacts?open=${c.id}`)} className="bg-white border border-[#E2E8F0] rounded-[12px] px-3 py-2.5 flex items-center justify-between cursor-pointer">
              <div className="min-w-0"><div className="text-sm font-semibold truncate">{c.name}</div><div className="text-xs text-[#64748B] truncate">{c.org || "—"}</div></div>
              <span className="text-xs text-[#B45309] font-semibold whitespace-nowrap">{c.last_contact ? relTime(c.last_contact) : "ללא מגע"}</span>
            </div>
          ))}
        </div>
      </>}

      {/* Latest leads */}
      <div className="flex justify-between items-center mb-2">
        <div className="text-base font-bold">הלידים האחרונים שלי</div>
        <div onClick={() => router.push("/coord/leads")} className="text-xs text-[#00488D] font-semibold cursor-pointer">הכל</div>
      </div>
      <div className="space-y-1.5">
        {d.latest_leads.map((l: any) => (
          <div key={l.id} className="bg-white border border-[#E2E8F0] rounded-[12px] px-3 py-2.5 flex items-center justify-between">
            <div className="min-w-0"><div className="text-sm font-semibold truncate">{l.name}</div><div className="text-xs text-[#64748B]">{l.city || "—"} · {fd(l.created_at)}{l.source === "link" ? " · דרך הלינק" : ""}</div></div>
            <Chip tone={l.status === "advanced" ? "ok" : l.status === "contacted" ? "blue" : l.status === "irrelevant" ? "gray" : "purple"}>{LEAD_STATUS[l.status] || l.status}</Chip>
          </div>
        ))}
        {!d.latest_leads.length && <div className="text-sm text-[#94A3B8] bg-white border border-dashed border-[#E2E8F0] rounded-[12px] p-3 text-center">עדיין לא הזנת לידים — <span className="text-[#00488D] font-semibold" onClick={() => router.push("/coord/leads")}>הזן ליד ראשון</span></div>}
      </div>
    </div>
  )
}
