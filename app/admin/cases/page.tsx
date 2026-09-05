"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

// Design tokens copied from design-tokens/tokens.css (Netivim CRM design
// package) — kept local to this screen rather than touched globally,
// since the rest of the app runs on Heebo + its own existing palette and
// switching that app-wide risks regressing 20+ screens already in daily
// use. This is the one screen built to match the design package closely;
// see DECISIONS_LOG.md for which screens still don't.
const T = {
  navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8",
  slate: "#5A6472", slateBorder: "#CBD3DD", slateBg: "#F7F9FC",
  ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B", breachBg: "#FDECEA",
}

const SLA_HOURS = 24

function hoursSince(d?: string | null) {
  if (!d) return null
  return (Date.now() - new Date(d).getTime()) / 36e5
}
function relTime(hrs: number) {
  if (hrs < 1) return "לפני פחות משעה"
  if (hrs < 24) return `לפני ${Math.round(hrs)} שעות`
  return `לפני ${Math.round(hrs / 24)} ימים`
}
function slaColor(hrs: number | null) {
  if (hrs === null) return T.slate
  if (hrs >= SLA_HOURS) return T.breach
  if (hrs >= SLA_HOURS * 0.6) return T.warn
  return T.ok
}

function KPI({ label, value, dark }: { label: string; value: number; dark?: boolean }) {
  return (
    <div style={{ background: dark ? T.breach : "#fff", border: dark ? "none" : `1px solid ${T.slateBorder}`, borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: dark ? "#FDECEA" : T.slate }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, marginTop: 2, color: dark ? "#fff" : T.navy }}>{value}</div>
    </div>
  )
}

function Col({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ background: T.slateBg, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "14px 16px", background: "#fff", borderBottom: `1px solid ${T.slateBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <span style={{ fontSize: 12, fontWeight: 700, background: T.slateBg, color: T.slate, borderRadius: 10, padding: "2px 9px" }}>{count}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function CaseCard({ c, onOpen }: { c: any; onOpen: () => void }) {
  const hrs = hoursSince(c.first_touch_at || c.created_at)
  const color = slaColor(hrs)
  const breach = hrs !== null && hrs >= SLA_HOURS
  return (
    <div onClick={onOpen} style={{ border: `1px solid ${breach ? T.breach : T.slateBorder}`, background: breach ? T.breachBg : "#fff", borderRadius: 12, padding: 12, cursor: "pointer" }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}{c.age ? `, ${c.age}` : ""}</div>
      <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>מקור: {c.source || "לא ידוע"} · {c.city || ""}</div>
      {hrs !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color, marginTop: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
          {relTime(hrs)}{breach ? " — חריגת SLA" : ""}
        </div>
      )}
    </div>
  )
}

function TaskCard({ t }: { t: any }) {
  const late = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())
  return (
    <div style={{ border: `1px solid ${late ? T.breach : T.slateBorder}`, background: late ? T.breachBg : "#fff", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{t.title}</div>
      <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{t.assigned_to_name || (t.assignees || [])[0] || "לא משויך"}</div>
      {t.due_date && <div style={{ fontSize: 12, fontWeight: 700, color: late ? T.breach : T.slate, marginTop: 8 }}>{late ? "⚠ באיחור" : ""} {String(t.due_date).slice(0, 10)}</div>}
    </div>
  )
}

export default function AdvisorDesk() {
  const router = useRouter()
  const [cases, setCases] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [cr, tr] = await Promise.all([fetch("/api/cases"), fetch("/api/tasks")])
      setCases((await cr.json()).cases || [])
      setTasks((await tr.json()).tasks || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const newInquiries = useMemo(() =>
    cases.filter(c => c.advisor_status === "פנייה חדשה")
      .sort((a, b) => (hoursSince(b.first_touch_at || b.created_at) || 0) - (hoursSince(a.first_touch_at || a.created_at) || 0)),
    [cases])
  const openTasks = useMemo(() => tasks.filter(t => t.status !== "done"), [tasks])
  const followUps = useMemo(() =>
    cases.filter(c => c.advisor_status === "לא פעיל" && ["אין מענה", "לא מעוניין", "לא רלוונטי"].includes(c.inactive_reason)),
    [cases])
  const ongoingSupport = useMemo(() => cases.filter(c => c.advisor_status === "שובץ במסגרת"), [cases])
  const activeCases = useMemo(() => cases.filter(c => !["הסתיים בהצלחה", "לא פעיל"].includes(c.advisor_status)), [cases])
  const overdueTasks = useMemo(() => openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())), [openTasks])
  // "leads" has no updated_at column, so "this month" can't be derived
  // client-side without another query against case_status_history —
  // showing the total currently placed/completed instead, labeled accordingly.
  const placedTotal = useMemo(() =>
    cases.filter(c => c.advisor_status === "שובץ במסגרת" || c.advisor_status === "הסתיים בהצלחה").length,
    [cases])

  if (error) return <ErrorState retry={load} />
  if (loading) return <div className="p-6"><SkeletonCard /></div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.slateBg, minHeight: "100vh", color: T.navy }}>
      <div style={{ padding: "24px 32px 0" }}>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>בית › <span style={{ color: T.navy, fontWeight: 600 }}>מסך העבודה שלי</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>מסך העבודה שלי</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <KPI label="פניות פתוחות" value={newInquiries.length} />
          <KPI label="משימות באיחור" value={overdueTasks.length} dark />
          <KPI label="תיקים פעילים" value={activeCases.length} />
          <KPI label="שיבוצים סה״כ" value={placedTotal} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: T.slateBorder, minHeight: 560 }}>
        <Col title="פניות חדשות" count={newInquiries.length}>
          {newInquiries.map(c => <CaseCard key={c.id} c={c} onOpen={() => router.push(`/admin/cases/${c.id}`)} />)}
          {!newInquiries.length && <div style={{ textAlign: "center", color: T.slate, padding: "24px 0", fontSize: 13 }}>אין פניות חדשות — כל הכבוד! 🎉</div>}
        </Col>
        <Col title="משימות שוטפות" count={openTasks.length}>
          {openTasks.map(t => <TaskCard key={t.id} t={t} />)}
          {!openTasks.length && <div style={{ textAlign: "center", color: T.slate, padding: "24px 0", fontSize: 13 }}>אין משימות פתוחות</div>}
        </Col>
        <Col title="פולו-אפ — לא רלוונטי" count={followUps.length}>
          {followUps.map(c => <CaseCard key={c.id} c={c} onOpen={() => router.push(`/admin/cases/${c.id}`)} />)}
          {!followUps.length && <div style={{ textAlign: "center", color: T.slate, padding: "24px 0", fontSize: 13 }}>אין פולו-אפים ממתינים</div>}
        </Col>
        <Col title="המשך ליווי" count={ongoingSupport.length}>
          {ongoingSupport.map(c => <CaseCard key={c.id} c={c} onOpen={() => router.push(`/admin/cases/${c.id}`)} />)}
          {!ongoingSupport.length && <div style={{ textAlign: "center", color: T.slate, padding: "24px 0", fontSize: 13 }}>אין חניכים בליווי כרגע</div>}
        </Col>
      </div>
    </div>
  )
}
