"use client"
import { useEffect, useState, use, useCallback } from "react"
import { useRouter } from "next/navigation"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"
import ExportButton from "@/components/ui/ExportButton"
import Speedometer from "@/components/ui/Speedometer"
import { fd, ds, ini, pct, leadColor, MONTH_HE } from "@/lib/utils"
import MeetingForm, { MTG_TYPE } from "@/components/admin/MeetingForm"
import EngagementLight, { LIGHT } from "@/components/admin/EngagementLight"

type Tab = "activity" | "tasks" | "leads" | "events" | "reports" | "meetings" | "targets"
const TABS: [Tab, string][] = [["activity", "פעילות"], ["tasks", "משימות"], ["leads", "לידים"], ["events", "אירועים"], ["reports", "דיווחים שבועיים"], ["meetings", "פגישות"], ["targets", "יעדים"]]
const TASK_STATUS: Record<string, string> = { todo: "לביצוע", inprogress: "בתהליך", waiting: "ממתין לתשובה", done: "בוצע" }
const LEAD_STATUS: Record<string, string> = { new: "חדש", contacted: "יצרתי קשר", advanced: "עבר לשלב", irrelevant: "לא רלוונטי" }
const EV_STATUS: Record<string, string> = { planning: "תכנון", pending_approval: "ממתין לאישור", approved: "מאושר", marketing: "בפרסום", done: "בוצע", cancelled: "בוטל" }
const ENTITY: Record<string, { label: string; icon: string }> = {
  lead: { label: "ליד", icon: "⭐" }, task: { label: "משימה", icon: "✅" }, event: { label: "אירוע", icon: "🎪" }, contact: { label: "איש קשר", icon: "👥" },
  user: { label: "כניסה", icon: "🔑" }, custom_field: { label: "שדה", icon: "🧩" }, setting: { label: "הגדרה", icon: "⚙️" }, organization: { label: "ארגון", icon: "🏢" },
}
const ACTION: Record<string, string> = { create: "יצר", update: "עדכן", delete: "מחק", restore: "שחזר", view: "צפה", login: "נכנס למערכת" }

function ym(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` }
function ymLabel(s: string) { const [y, m] = s.split("-"); return `${MONTH_HE[Number(m) - 1]} ${y}` }
function shiftYm(s: string, by: number) { const [y, m] = s.split("-").map(Number); return ym(new Date(y, m - 1 + by, 1)) }
function ago(d?: string | null) {
  if (!d) return "אף פעם"
  const days = ds(d)
  return days <= 0 ? "היום" : days === 1 ? "אתמול" : `לפני ${days} ימים`
}
function dt(d: string) { const x = new Date(d); return `${fd(d)} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}` }

function Tile({ label, value, sub, color, onClick }: { label: string; value: string | number; sub?: string; color?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`bg-white border border-[#E2E8F0] rounded-[12px] p-3.5 ${onClick ? "cursor-pointer hover:border-[#00488D] transition-colors" : ""}`}>
      <div className="text-[11px] font-semibold text-[#64748B]">{label}</div>
      <div className="text-2xl font-extrabold mt-0.5 tabular-nums" style={{ color: color || "#0D2744" }}>{value}</div>
      {sub && <div className="text-[11px] text-[#94A3B8] mt-0.5">{sub}</div>}
    </div>
  )
}

export default function CoordinatorCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "activity"
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null
    return t && TABS.some(x => x[0] === t) ? t : "activity"
  })
  const [month, setMonth] = useState(ym())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // activity feed filters
  const [feedType, setFeedType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [showMtgForm, setShowMtgForm] = useState(false)
  const [openReport, setOpenReport] = useState<number | null>(null)
  const [targetInput, setTargetInput] = useState("")
  const [savingTarget, setSavingTarget] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const qs = new URLSearchParams({ month, feed_type: feedType, from, to, page: String(page) })
      const r = await fetch(`/api/admin/coordinators/${id}?${qs}`)
      if (!r.ok) throw new Error()
      const d = await r.json()
      setData(d)
      setTargetInput(String(d.coordinator.target_leads || 0))
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [id, month, feedType, from, to, page])
  useEffect(() => { load() }, [load])

  async function doneTask(taskId: number) {
    await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: taskId, status: "done", status_only: true }) })
    load()
  }
  async function saveTarget() {
    setSavingTarget(true)
    await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinator_id: Number(id), target_leads: Number(targetInput) || 0 }) })
    setSavingTarget(false); load()
  }

  if (error) return <div className="p-6"><ErrorState retry={load} /></div>
  if (loading || !data) return <div className="p-4 md:p-6 lg:p-8 space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} rows={4} />)}</div>

  const c = data.coordinator
  const l = LIGHT[c.light] || LIGHT.yellow
  const p = pct(c.leads_month, c.target_leads)
  const today = new Date().toISOString().slice(0, 10)
  const feed = data.feed
  const pages = Math.max(1, Math.ceil(feed.total / feed.page_size))
  const isCurrentMonth = month === ym()

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      <div className="text-xs text-[#64748B] mb-3"><span onClick={() => router.push("/admin/reports")} className="cursor-pointer hover:text-[#00488D]">ניהול רכזים</span> › <span className="text-[#0D2744] font-semibold">{c.name}</span></div>

      {/* Header */}
      <div className="bg-[#0D2744] rounded-[18px] p-5 mb-4 text-white flex items-center gap-5 flex-wrap" style={{ borderRight: `6px solid ${l.dot}` }}>
        <div className="w-14 h-14 rounded-full bg-[#60A5FA] text-[#0D2744] flex items-center justify-center text-lg font-extrabold flex-shrink-0">{ini(c.name)}</div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="text-xl font-extrabold">{c.name}</div>
            <EngagementLight light={c.light} withLabel size="md" />
          </div>
          <div className="text-xs opacity-75 mt-1">{c.area || "ללא אזור"}{c.email && ` · ${c.email}`}{c.phone && ` · ${c.phone}`}</div>
          <div className="text-xs opacity-75 mt-1">כניסה אחרונה: <b>{ago(c.last_login_at)}</b> · פעילות אחרונה: <b>{ago(c.last_active_at)}</b> · דיווח אחרון: <b>{ago(c.last_report_at)}</b></div>
        </div>
        <div className="flex items-center gap-4">
          <Speedometer actual={c.leads_month} target={c.target_leads} size={92} dark />
          <div>
            <div className="text-[11px] opacity-70">לידים · {ymLabel(month)}</div>
            <div className="text-3xl font-extrabold leading-tight" style={{ color: leadColor(p) }}>{p}%</div>
            <div className="text-[11px] opacity-75">{c.leads_month} מתוך {c.target_leads || "—"}</div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 bg-white/10 rounded-[9px] p-0.5">
            <button onClick={() => setMonth(m => shiftYm(m, -1))} className="w-7 h-7 rounded-[7px] hover:bg-white/15">›</button>
            <span className="px-2 text-xs font-bold min-w-[90px] text-center">{ymLabel(month)}</span>
            <button onClick={() => setMonth(m => shiftYm(m, 1))} disabled={isCurrentMonth} className="w-7 h-7 rounded-[7px] hover:bg-white/15 disabled:opacity-30">‹</button>
          </div>
          <button onClick={() => window.open(`/admin/reports/weekly?coordinator_id=${c.id}&week=${today}`, "_blank")} className="text-[11px] bg-white/10 hover:bg-white/20 rounded-[9px] px-2 py-1.5">📋 דו״ח שבועי להדפסה</button>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Tile label="משימות פתוחות" value={c.tasks_open} sub={`${c.tasks_done_month} בוצעו החודש`} onClick={() => setTab("tasks")} />
        <Tile label="באיחור" value={c.tasks_overdue} color={c.tasks_overdue > 0 ? "#960010" : "#166534"} sub={c.avg_close_days != null ? `סגירה ממוצעת ${c.avg_close_days} ימים` : "אין נתוני סגירה"} onClick={() => setTab("tasks")} />
        <Tile label="לידים דרך הלינק" value={c.leads_via_link_month} sub="החודש" onClick={() => setTab("leads")} />
        <Tile label="אינטראקציות" value={c.interactions_month} sub="עם אנשי קשר החודש" />
        <Tile label="אירועים" value={c.events_month} sub="החודש" onClick={() => setTab("events")} />
        <Tile label="מעורבות 7 ימים" value={`${c.logins_7d} / ${c.actions_7d}`} sub="כניסות / פעולות" color={l.fg} onClick={() => setTab("activity")} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#E2E8F0] overflow-x-auto">
        {TABS.map(([key, label]) => {
          const count = key === "tasks" ? data.tasks.filter((t: any) => t.status !== "done").length : key === "leads" ? data.leads.length : key === "events" ? data.events.length : key === "reports" ? data.reports.length : key === "meetings" ? data.meetings.length : key === "activity" ? feed.total : null
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${tab === key ? "border-[#00488D] text-[#00488D]" : "border-transparent text-[#475569] hover:text-[#0D2744]"}`}>
              {label}{count != null && <span className="mr-1.5 text-[11px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded-full">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* ===== ACTIVITY FEED ===== */}
      {tab === "activity" && (
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <select value={feedType} onChange={e => { setFeedType(e.target.value); setPage(1) }} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
              <option value="">כל הפעולות</option>
              {(feed.types || []).map((t: any) => <option key={t.entity_type} value={t.entity_type}>{ENTITY[t.entity_type]?.label || t.entity_type} ({t.n})</option>)}
            </select>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} className="px-2.5 py-1.5 border border-[#E2E8F0] rounded-[9px] text-xs bg-white" />
            <span className="text-xs text-[#94A3B8]">עד</span>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} className="px-2.5 py-1.5 border border-[#E2E8F0] rounded-[9px] text-xs bg-white" />
            {(feedType || from || to) && <button onClick={() => { setFeedType(""); setFrom(""); setTo(""); setPage(1) }} className="text-xs text-[#00488D] font-semibold">נקה</button>}
            <span className="text-xs text-[#94A3B8] mr-auto">{feed.total} פעולות</span>
            <ExportButton type="coord-activity" label="ייצוא דוח פעילות" params={{ coordinator_id: c.id }} />
          </div>
          <Card>
            {feed.rows.length === 0 && <div className="py-12 text-center text-sm text-[#94A3B8]">אין פעילות מתועדת{feedType || from || to ? " בסינון הזה" : " עדיין — הפעולות נרשמות מרגע השימוש במערכת"}</div>}
            <div className="divide-y divide-[#F1F5F9]">
              {feed.rows.map((a: any) => {
                const e = ENTITY[a.entity_type] || { label: a.entity_type, icon: "📝" }
                return (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#F8FAFC] transition-colors">
                    <div className="w-8 h-8 rounded-full bg-[#F0F7FF] flex items-center justify-center text-sm flex-shrink-0">{e.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#0D2744]"><b>{ACTION[a.action] || a.action}</b> {a.action !== "login" && e.label}{a.summary && <span className="text-[#475569]"> · {a.summary}</span>}</div>
                      <div className="text-[11px] text-[#94A3B8] mt-0.5">{dt(a.created_at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-center gap-2 py-3 border-t border-[#F1F5F9] text-xs">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded-lg border border-[#E2E8F0] disabled:opacity-40">הקודם</button>
                <span className="text-[#64748B]">{page} / {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded-lg border border-[#E2E8F0] disabled:opacity-40">הבא</button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===== TASKS ===== */}
      {tab === "tasks" && (
        <Card>
          {data.tasks.length === 0 && <div className="py-12 text-center text-sm text-[#94A3B8]">אין משימות</div>}
          <div className="divide-y divide-[#F1F5F9]">
            {data.tasks.map((t: any) => {
              const late = t.status !== "done" && t.due_date && String(t.due_date).slice(0, 10) < today
              const accent = t.status === "done" ? "#166534" : late ? "#960010" : t.status === "waiting" ? "#B45309" : "#00488D"
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderRight: `3px solid ${accent}` }}>
                  {t.status !== "done"
                    ? <div onClick={() => doneTask(t.id)} title="סמן כבוצע" style={{ borderColor: accent, color: accent }} className="w-6 h-6 flex-shrink-0 rounded-[7px] border-2 cursor-pointer flex items-center justify-center text-xs font-bold hover:bg-[#F0F7FF]">✓</div>
                    : <div className="w-6 h-6 flex-shrink-0 rounded-[7px] bg-[#DCFCE7] text-[#166534] flex items-center justify-center text-xs font-bold">✓</div>}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${t.status === "done" ? "line-through text-[#94A3B8]" : ""}`}>{t.title}</div>
                    <div className="text-xs text-[#64748B]">{TASK_STATUS[t.status] || t.status}{t.due_date && ` · ${late ? "⚠ " : ""}${fd(String(t.due_date).slice(0, 10))}`}{t.priority === "urgent" && " · דחוף"}{t.contact_name && ` · ${t.contact_name}`}{t.event_name && ` · ${t.event_name}`}</div>
                  </div>
                  <div className="text-[11px] text-[#94A3B8]">{fd(t.created_at)}</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ===== LEADS ===== */}
      {tab === "leads" && (
        <Card>
          {data.leads.length === 0 && <div className="py-12 text-center text-sm text-[#94A3B8]">אין לידים</div>}
          <div className="divide-y divide-[#F1F5F9]">
            {data.leads.map((ld: any) => (
              <div key={ld.id} onClick={() => router.push(`/admin/leads?open=${ld.id}`)} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#F8FAFC]">
                <div className="w-8 h-8 rounded-full bg-[#F0F7FF] text-[#00488D] flex items-center justify-center text-xs font-bold">{ld.name?.[0]}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{ld.name}</div><div className="text-xs text-[#64748B]">{ld.phone}{ld.city && ` · ${ld.city}`} · {ld.source === "link" ? "דרך הלינק" : ld.source === "event" ? "אירוע" : "ידני"}</div></div>
                <Badge text={LEAD_STATUS[ld.status] || ld.status} />
                <div className="text-[11px] text-[#94A3B8]">{fd(ld.created_at)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ===== EVENTS ===== */}
      {tab === "events" && (
        <Card>
          {data.events.length === 0 && <div className="py-12 text-center text-sm text-[#94A3B8]">אין אירועים</div>}
          <div className="divide-y divide-[#F1F5F9]">
            {data.events.map((e: any) => {
              const d = e.date ? new Date(e.date) : null
              return (
                <div key={e.id} onClick={() => router.push("/admin/events")} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#F8FAFC]">
                  <div className="w-11 text-center flex-shrink-0">{d ? <><div className="text-base font-extrabold leading-none">{d.getDate()}</div><div className="text-[11px] text-[#64748B]">{MONTH_HE[d.getMonth()]}</div></> : <div className="text-xs text-[#94A3B8]">—</div>}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{e.name}</div><div className="text-xs text-[#64748B]">{e.location}{e.actual_attendees != null && ` · ${e.actual_attendees} משתתפים`}{e.leads_collected ? ` · ${e.leads_collected} לידים` : ""}</div></div>
                  <Badge text={EV_STATUS[e.status] || e.status} />
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ===== WEEKLY REPORTS ===== */}
      {tab === "reports" && (
        <div className="space-y-3">
          {data.reports.length === 0 && <div className="py-12 text-center text-sm text-[#94A3B8]">אין דיווחים שבועיים</div>}
          {data.reports.map((r: any) => (
            <Card key={r.id}>
              <div onClick={() => setOpenReport(openReport === r.id ? null : r.id)} className="p-4 flex items-center gap-4 cursor-pointer hover:bg-[#F8FAFC]">
                <div className="flex-1"><div className="text-sm font-semibold">שבוע {fd(r.week_start)}</div><div className="text-xs text-[#64748B]">הוגש {new Date(r.submitted_at).toLocaleDateString("he-IL")}</div></div>
                <div className="text-sm font-bold text-[#00488D]">{r.leads_count} לידים</div>
                <span className="text-[#94A3B8] text-sm">{openReport === r.id ? "▲" : "▼"}</span>
              </div>
              {openReport === r.id && (
                <div className="border-t border-[#E2E8F0] p-4 bg-[#F8FAFC] grid grid-cols-2 gap-4">
                  <div><div className="text-xs font-bold text-[#374151] mb-1">הישגים מרכזיים</div><div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.achievements || "—"}</div></div>
                  <div><div className="text-xs font-bold text-[#374151] mb-1">אתגרים</div><div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.challenges || "—"}</div></div>
                  <div className="col-span-2"><div className="text-xs font-bold text-[#374151] mb-1">תכנון שבוע הבא</div><div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.next_week_plan || "—"}</div></div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ===== MEETINGS ===== */}
      {tab === "meetings" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-[#64748B]">{data.meetings.length} פגישות עם {c.name}</div>
            <Button onClick={() => setShowMtgForm(true)}>+ סיכום פגישה</Button>
          </div>
          {showMtgForm && <MeetingForm coordinators={[{ id: c.id, name: c.name }]} fixedCoordinatorId={c.id} onSaved={() => { setShowMtgForm(false); load() }} onCancel={() => setShowMtgForm(false)} />}
          <div className="space-y-3">
            {data.meetings.length === 0 && !showMtgForm && <div className="py-12 text-center text-sm text-[#94A3B8]">אין פגישות מתועדות עדיין</div>}
            {data.meetings.map((m: any) => (
              <Card key={m.id}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-xs text-[#64748B]"><b className="text-[#0D2744]">{MTG_TYPE[m.type] || m.type}</b> · {fd(m.date)}</div>
                    <div className="flex items-center gap-2">
                      {m.next_meeting_date && <div className="text-xs text-[#00488D] bg-[#F0F7FF] px-2 py-1 rounded-lg">פגישה הבאה: {fd(m.next_meeting_date)}</div>}
                      <button onClick={async () => { if (confirm("למחוק?")) { await fetch("/api/meetings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id }) }); load() } }} className="text-[#CBD5E1] hover:text-[#960010] text-xs">✕</button>
                    </div>
                  </div>
                  {m.agenda && <div className="text-xs font-semibold text-[#374151] mb-1">נושאים: <span className="font-normal text-[#475569]">{m.agenda}</span></div>}
                  <div className="text-sm text-[#475569] bg-[#F9FAFB] rounded-[9px] p-3 whitespace-pre-wrap">{m.summary}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ===== TARGETS ===== */}
      {tab === "targets" && (
        <Card>
          <div className="p-5">
            <div className="text-sm font-bold text-[#0D2744] mb-1">יעד לידים חודשי · {ymLabel(ym())}</div>
            <div className="text-xs text-[#64748B] mb-4">היעד נשמר לחודש הנוכחי. יעד שנתי משוער: {(Number(targetInput) || 0) * 12}</div>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="number" value={targetInput} onChange={e => setTargetInput(e.target.value)} className="w-28 px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm text-center focus:outline-none focus:border-[#00488D]" />
              <Button onClick={saveTarget} disabled={savingTarget}>{savingTarget ? "שומר..." : "שמור יעד"}</Button>
              <span className="text-xs text-[#94A3B8]">ביצוע החודש: <b className="text-[#0D2744]">{isCurrentMonth ? c.leads_month : "—"}</b></span>
              <button onClick={() => router.push("/admin/reports?tab=targets")} className="text-xs text-[#00488D] font-semibold mr-auto">כל היעדים ›</button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
