"use client"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { fd, pct, MONTH_HE } from "@/lib/utils"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { relTime } from "@/components/dashboard/primitives"
import { Icon } from "@/components/shell/icons"
import "@/components/shell/screens.css"

const EVENT_STATUS: Record<string, string> = { planning: "תכנון", pending_approval: "ממתין לאישור", approved: "מאושר", marketing: "בפרסום", done: "בוצע" }
const LEAD_STATUS: Record<string, string> = { new: "חדש", contacted: "יצרתי קשר", advanced: "עבר לשלב", irrelevant: "לא רלוונטי" }
const LEAD_TONE: Record<string, string> = { new: "purple", contacted: "blue", advanced: "", irrelevant: "gray" }

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }))
  return h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : "ערב טוב"
}
const todayLabel = () => new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" })
const initials = (n: string) => (n || "?").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2)

/** "היום שלי" — the coordinator's day: what needs doing now, then the people and events around it. */
export default function CoordHome() {
  const { user } = useAuth()
  const router = useRouter()
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [done, setDone] = useState<Set<number>>(new Set())
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

  async function toggleDone(id: number) {
    const wasDone = done.has(id)
    setDone(s => { const n = new Set(s); wasDone ? n.delete(id) : n.add(id); return n })
    const r = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: wasDone ? "todo" : "done", status_only: true }) }).catch(() => null)
    if (!r || !r.ok) setDone(s => { const n = new Set(s); wasDone ? n.add(id) : n.delete(id); return n })
  }
  function copyLink() {
    if (!d?.coord?.slug) return
    navigator.clipboard.writeText(`${window.location.origin}/j/${d.coord.slug}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    }).catch(() => {})
  }

  if (error) return <div className="ws"><ErrorState retry={load} /></div>
  if (loading || !d) return <div className="ws" aria-busy="true">{[1, 2, 3].map(i => <div key={i} className="mb-3"><SkeletonCard rows={3} /></div>)}</div>
  if (!d.coord) return <div className="ws"><div className="ws-card ws-empty">המשתמש שלך עדיין לא מקושר לרכז. פנו למנהל המערכת.</div></div>

  const m = new Date().getMonth()
  const daysLeft = new Date(new Date().getFullYear(), m + 1, 0).getDate() - new Date().getDate()
  const p = pct(d.leads_this_month, d.target)
  const overdue = d.tasks.overdue
  const today = d.tasks.today
  const later = d.tasks.later.slice(0, 3)
  const openCount = [...overdue, ...today, ...d.tasks.later].filter((t: any) => !done.has(t.id)).length
  const lateOpen = overdue.filter((t: any) => !done.has(t.id)).length
  const nextEvent = d.events[0]

  const TaskItem = ({ t, late }: { t: any; late?: boolean }) => {
    const isDone = done.has(t.id)
    return (
      <div className="ws-item">
        <button type="button" className={`ws-check ${late ? "late" : ""}`} aria-pressed={isDone} aria-label={isDone ? `סמן "${t.title}" כפתוחה` : `סמן "${t.title}" כבוצעה`} onClick={() => toggleDone(t.id)}>
          {isDone && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12l5 5L19 7" /></svg>}
        </button>
        <button type="button" className="ws-open" onClick={() => router.push(`/coord/tasks?open=${t.id}`)}>
          <span className="ws-main" style={isDone ? { opacity: .5, textDecoration: "line-through" } : undefined}>
            <strong>{t.title}</strong>
            <small>
              <span className={late ? "late" : ""}>{t.due_date ? fd(t.due_date) : "ללא תאריך"}</span>
              {t.contact_name && <> · {t.contact_name}</>}
              {t.event_name && <> · {t.event_name}</>}
            </small>
          </span>
          {t.priority === "urgent" && <span className="ws-badge red">דחוף</span>}
          <Icon name="arrow" size={18} className="chev" />
        </button>
      </div>
    )
  }

  return (
    <div className="ws">
      <div className="ws-head">
        <div>
          <h1>{greeting()}, {user?.name?.split(" ")[0]}</h1>
          <div className="ws-sub">
            {todayLabel()}
            {" · "}
            {openCount === 0 ? "אין משימות פתוחות" : <><b>{openCount}</b> משימות פתוחות{lateOpen > 0 && <>, <span className="late">{lateOpen} באיחור</span></>}</>}
          </div>
        </div>
      </div>

      {/* Monthly goal — compact; a missing target is not shown as 0% */}
      <div className="ws-card">
        <div className="ws-goal-top">
          <strong>ההתקדמות החודשית שלך</strong>
          <span>{d.target ? `${d.leads_this_month} מתוך ${d.target}` : `${d.leads_this_month} לידים`}</span>
        </div>
        {d.target ? <div className="ws-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label="התקדמות ליעד החודשי"><i style={{ width: `${Math.min(100, p)}%` }} /></div> : null}
        <div className="ws-goal-foot">
          {d.target ? `${p}% מהיעד · ${MONTH_HE[m]} · נותרו ${daysLeft} ימים` : `טרם הוגדר יעד לחודש ${MONTH_HE[m]}`}
        </div>
      </div>

      <div className="ws-quick">
        <button type="button" className="ws-btn ws-btn-primary" onClick={() => router.push("/coord/leads?new=lead")}>+ ליד חדש</button>
        <button type="button" className="ws-btn" onClick={() => router.push("/coord/contacts?new=interaction")}>תיעוד קשר</button>
        <button type="button" className="ws-btn" onClick={() => router.push("/coord/tasks?new=task")}>+ משימה</button>
      </div>

      {overdue.length > 0 && <>
        <div className="ws-section"><h2 className="late">באיחור <span className="ws-badge red">{overdue.length}</span></h2></div>
        <div className="ws-list">{overdue.map((t: any) => <TaskItem key={t.id} t={t} late />)}</div>
      </>}

      <div className="ws-section">
        <h2>להיום שלך <span className="ws-count">{today.length} משימות</span></h2>
        <button type="button" className="ws-link" onClick={() => router.push("/coord/tasks")}>לכל המשימות</button>
      </div>
      <div className="ws-list">
        {today.map((t: any) => <TaskItem key={t.id} t={t} />)}
        {!today.length && <div className="ws-empty">אין משימות להיום.</div>}
      </div>
      {later.length > 0 && <>
        <div className="ws-section"><h2>בהמשך</h2></div>
        <div className="ws-list">{later.map((t: any) => <TaskItem key={t.id} t={t} />)}</div>
      </>}

      {/* Upcoming event + calendar shortcut */}
      <div className="ws-section">
        <h2>אירוע קרוב</h2>
        <button type="button" className="ws-link" onClick={() => router.push("/coord/calendar")}>ליומן שלי</button>
      </div>
      <div className="ws-list">
        {nextEvent ? (() => {
          const dt = nextEvent.date ? new Date(nextEvent.date) : null
          return (
            <div className="ws-item">
              <button type="button" className="ws-open" onClick={() => router.push("/coord/events")}>
                <span className="ws-date">{dt ? <><b>{dt.getDate()}</b><span>{MONTH_HE[dt.getMonth()]}</span></> : <span>—</span>}</span>
                <span className="ws-main"><strong>{nextEvent.name}</strong><small>{[nextEvent.time?.slice(0, 5), nextEvent.location].filter(Boolean).join(" · ") || "טרם נקבע מקום"}</small></span>
                <span className={`ws-badge ${nextEvent.status === "pending_approval" ? "warn" : ""}`}>{EVENT_STATUS[nextEvent.status] || nextEvent.status}</span>
              </button>
            </div>
          )
        })() : (
          <div className="ws-empty">אין אירועים פתוחים.<br /><button type="button" className="ws-link" onClick={() => router.push("/coord/events?new=event")}>+ הצעת אירוע</button></div>
        )}
        {d.events.length > 1 && <div className="ws-item"><button type="button" className="ws-link" onClick={() => router.push("/coord/events")}>עוד {d.events.length - 1} אירועים ←</button></div>}
      </div>

      {d.contacts_cold.length > 0 && <>
        <div className="ws-section">
          <h2>כדאי ליצור קשר</h2>
          <button type="button" className="ws-link" onClick={() => router.push("/coord/contacts")}>לכל הקשרים</button>
        </div>
        <div className="ws-list">
          {d.contacts_cold.slice(0, 5).map((c: any) => (
            <div className="ws-item" key={c.id}>
              <button type="button" className="ws-open" onClick={() => router.push(`/coord/contacts?open=${c.id}`)}>
                <span className="ws-avatar">{initials(c.name)}</span>
                <span className="ws-main"><strong>{c.name}</strong><small>{c.org || "ללא ארגון"} · {c.last_contact ? `קשר אחרון ${relTime(c.last_contact)}` : "טרם תועד קשר"}</small></span>
                <Icon name="arrow" size={18} className="chev" />
              </button>
            </div>
          ))}
        </div>
      </>}

      {/* Personal link */}
      <div className="ws-linkcard">
        <span className="shell-circle" style={{ background: "#ffffff1a", color: "#fff" }}><Icon name="link" /></span>
        <button type="button" className="ws-open" onClick={() => router.push("/coord/link")}>
          <span className="ws-main"><strong>הלינק האישי שלי</strong><small>{d.link_leads} לידים הגיעו דרכו</small></span>
        </button>
        <button type="button" className="ws-btn" onClick={copyLink} disabled={!d.coord.slug} aria-live="polite">{copied ? "הועתק ✓" : "העתקה"}</button>
      </div>

      <div className="ws-section">
        <h2>הלידים האחרונים שלי</h2>
        <button type="button" className="ws-link" onClick={() => router.push("/coord/leads")}>לכל הלידים</button>
      </div>
      <div className="ws-list">
        {d.latest_leads.map((l: any) => (
          <div className="ws-item" key={l.id}>
            <span className="ws-avatar">{initials(l.name)}</span>
            <span className="ws-main"><strong>{l.name}</strong><small>{l.city || "—"} · {fd(l.created_at)}{l.source === "link" ? " · דרך הלינק" : ""}</small></span>
            <span className={`ws-badge ${LEAD_TONE[l.status] ?? "gray"}`}>{LEAD_STATUS[l.status] || l.status}</span>
          </div>
        ))}
        {!d.latest_leads.length && <div className="ws-empty">עדיין לא הוזנו לידים.<br /><button type="button" className="ws-link" onClick={() => router.push("/coord/leads?new=lead")}>+ הזנת ליד ראשון</button></div>}
      </div>
    </div>
  )
}
