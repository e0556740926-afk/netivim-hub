"use client"
import { useEffect, useState, use, useCallback } from "react"
import { useRouter } from "next/navigation"
import ExportButton from "@/components/ui/ExportButton"
import { MTG_TYPE } from "@/components/admin/MeetingForm"
import MeetingDialog from "@/components/coordinators/MeetingDialog"
import TargetsEditor from "@/components/coordinators/TargetsEditor"
import Modal from "@/components/ui/Modal"
import {
  ym, ymLabel, monthOptions, weekLabel, day, dayFull, ago, initials, lightReason, LIGHT_UI,
  TASK_STATUS, LEAD_STATUS, EV_STATUS, ENTITY, ACTION,
} from "@/components/coordinators/model"
import "@/components/coordinators/coord.css"

type Tab = "overview" | "activity" | "tasks" | "leads" | "events" | "reports" | "meetings" | "targets"
const TABS: [Tab, string][] = [["overview", "סקירה"], ["activity", "פעילות"], ["tasks", "משימות"], ["leads", "לידים"], ["events", "אירועים"], ["reports", "דיווחים"], ["meetings", "פגישות"], ["targets", "יעדים"]]
const SECTION_HE: Record<string, string> = { tasks: "משימות", leads: "לידים", events: "אירועים", reports: "דיווחים", meetings: "פגישות", feed: "פעילות", feedCount: "ספירת פעילות", feedTypes: "סוגי פעילות" }

function param(name: string) { return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name) }
function dt(d: string) { const x = new Date(d); return `${dayFull(d)} · ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}` }

export default function CoordinatorCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tab, setTabState] = useState<Tab>(() => { const t = param("tab") as Tab | null; return t && TABS.some(x => x[0] === t) ? t : "overview" })
  const [month, setMonthState] = useState(() => { const m = param("month"); return m && /^\d{4}-\d{2}$/.test(m) ? m : ym() })
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedType, setFeedType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [mtgOpen, setMtgOpen] = useState(false)
  const [openReport, setOpenReport] = useState<any>(null)
  const [openMeeting, setOpenMeeting] = useState<any>(null)
  const [delMeeting, setDelMeeting] = useState<any>(null)
  const [busyTask, setBusyTask] = useState<number | null>(null)

  function syncUrl(t: Tab, m: string) {
    const u = new URL(window.location.href)
    if (t === "overview") u.searchParams.delete("tab"); else u.searchParams.set("tab", t)
    if (m === ym()) u.searchParams.delete("month"); else u.searchParams.set("month", m)
    window.history.replaceState(null, "", u.toString())
  }
  function setTab(t: Tab) { setTabState(t); syncUrl(t, month) }
  function setMonth(m: string) { setMonthState(m); syncUrl(tab, m) }

  const load = useCallback(async () => {
    setError(null)
    try {
      const qs = new URLSearchParams({ month, feed_type: feedType, from, to, page: String(page) })
      const r = await fetch(`/api/admin/coordinators/${id}?${qs}`)
      if (r.status === 404) { setError("הרכז לא נמצא."); return }
      if (r.status === 401 || r.status === 403) { setError("אין הרשאה לצפות בכרטיס הזה."); return }
      if (!r.ok) throw new Error(String(r.status))
      setData(await r.json())
    } catch { setError("לא ניתן לטעון את כרטיס הרכז כרגע.") }
    finally { setLoading(false) }
  }, [id, month, feedType, from, to, page])
  useEffect(() => { load() }, [load])

  async function toggleTask(t: any) {
    setBusyTask(t.id)
    try {
      await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, status: t.status === "done" ? "todo" : "done", status_only: true }) })
      await load()
    } finally { setBusyTask(null) }
  }
  async function deleteMeeting() {
    if (!delMeeting) return
    await fetch("/api/meetings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: delMeeting.id }) })
    setDelMeeting(null); load()
  }

  const backTo = () => router.push("/admin/reports")

  if (error && !data) return (
    <div className="coord-ws">
      <div className="c-breadcrumb"><button onClick={backTo}>ניהול רכזים</button></div>
      <div className="c-card"><div className="c-empty">{error}<br /><button className="c-textbtn" onClick={() => { setLoading(true); load() }}>ניסיון חוזר</button></div></div>
    </div>
  )
  if (loading || !data) return <div className="coord-ws"><div className="c-card"><div className="c-empty">טוען את כרטיס הרכז…</div></div></div>

  const c = data.coordinator
  const ui = LIGHT_UI[c.light] || LIGHT_UI.yellow
  const today = new Date().toISOString().slice(0, 10)
  const feed = data.feed
  const pages = Math.max(1, Math.ceil(feed.total / feed.page_size))
  const failed: string[] = data.failed || []
  const openTasks = data.tasks.filter((t: any) => t.status !== "done")
  const nextMeeting = data.meetings[0]?.next_meeting_date || null
  const lastReport = data.reports[0] || null
  const p = c.target_leads ? Math.min(100, Math.round(c.leads_month / c.target_leads * 100)) : null
  const counts: Partial<Record<Tab, number>> = { activity: feed.total, tasks: openTasks.length, leads: data.leads.length, events: data.events.length, reports: data.reports.length, meetings: data.meetings.length }

  return (
    <div className="coord-ws">
      <div className="c-breadcrumb"><button onClick={backTo}>ניהול רכזים</button> / {c.name}</div>

      <header className="c-profilehead">
        <div className="c-person" style={{ gap: 16 }}>
          <span className="c-avatar">{initials(c.name)}</span>
          <div>
            <h2>{c.name}</h2>
            <div className="c-sub">{c.area || "ללא אזור"}{c.phone ? ` · ${c.phone}` : ""}{c.email ? ` · ${c.email}` : ""}</div>
            <div className="c-sub">כניסה אחרונה: {ago(c.last_login_at)} · פעילות אחרונה: {ago(c.last_active_at)}</div>
          </div>
        </div>
        <div>
          <div className="c-sub">לידים / יעד · {ymLabel(month)}</div>
          <div className="c-big">{c.leads_month}<span>{c.target_leads ? ` / ${c.target_leads}` : " · ללא יעד"}</span></div>
          {p !== null && <div className="c-progress" style={{ width: 140, background: "#ffffff22" }}><i style={{ width: `${p}%`, background: "#9fc49a" }} /></div>}
        </div>
      </header>

      <div className="c-profiletools">
        <label className="c-periodlabel">תוצאות לחודש
          <select className="c-period" value={month} onChange={e => setMonth(e.target.value)}>
            {monthOptions().map(m => <option key={m} value={m}>{ymLabel(m)}</option>)}
          </select>
        </label>
        <button className="c-secondary" onClick={() => window.open(`/admin/reports/weekly?coordinator_id=${c.id}&week=${today}`, "_blank")}>דוח שבועי</button>
        <button className="c-secondary" onClick={() => window.open(`/admin/reports/monthly?month=${month}`, "_blank")}>דוח חודשי</button>
        <button className="c-primary" onClick={() => setMtgOpen(true)}>+ סיכום פגישה</button>
      </div>

      {failed.length > 0 && <div className="c-warn">חלק מהנתונים לא נטענו ({failed.map(f => SECTION_HE[f] || f).join(", ")}). שאר הכרטיס תקין. <button className="c-textbtn" onClick={load}>ניסיון חוזר</button></div>}

      <div className="c-stats">
        <div className="c-stat"><span>תיעודי קשר</span><b>{c.interactions_month}</b><small>{ymLabel(month)} · פעילות עסקית, לא כניסות</small></div>
        <button className="c-stat" onClick={() => setTab("tasks")}><span>באיחור / משימות פתוחות</span><b>{c.tasks_overdue} / {c.tasks_open}</b><small>מצב נוכחי, מכל התקופות{c.avg_close_days != null ? ` · סגירה ממוצעת ${c.avg_close_days} ימים (90 יום)` : ""}</small></button>
        <button className="c-stat" onClick={() => setTab("leads")}><span>לידים דרך הקישור</span><b>{c.leads_via_link_month}</b><small>{ymLabel(month)} · מתוך {c.leads_month} לידים בחודש</small></button>
      </div>

      <nav className="c-tabs" aria-label="לשוניות כרטיס רכז">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{l}{counts[k] != null && <em>{counts[k]}</em>}</button>)}
      </nav>

      {/* ===== OVERVIEW ===== */}
      {tab === "overview" && (
        <>
          <div className="c-split">
            <section className="c-card">
              <h3>מה דורש טיפול?</h3>
              <div className="c-row"><div><strong>{c.tasks_overdue ? `${c.tasks_overdue} משימות באיחור` : "אין משימות באיחור"}</strong><small>מתוך {c.tasks_open} שיוכי משימות פתוחות כעת</small></div><button className="c-textbtn" onClick={() => setTab("tasks")}>למשימות ←</button></div>
              <div className="c-row"><div><strong>דיווח לשבוע {weekLabel(c.report_week_start)}</strong><small>{c.report_this_week ? "הוגש" : "טרם הוגש"}{lastReport ? ` · דיווח אחרון ב־${dayFull(lastReport.submitted_at)}` : " · אין דיווחים קודמים"}</small></div><button className="c-textbtn" onClick={() => setTab("reports")}>לדיווחים ←</button></div>
              <div className="c-row"><div><strong>{c.target_leads ? `יעד ${ymLabel(month)}: ${c.leads_month} מתוך ${c.target_leads}` : `לא הוגדר יעד ל${ymLabel(month)}`}</strong><small>{c.target_leads ? "ההתקדמות מוצגת בנפרד ממעורבות במערכת" : "אין להסיק אחוז ביצוע לפני הגדרת יעד"}</small></div><button className="c-textbtn" onClick={() => setTab("targets")}>ליעדים ←</button></div>
            </section>
            <section className="c-card">
              <h3>מעורבות במערכת · 7 ימים</h3>
              <span className={`c-badge ${ui.tone === "green" ? "" : ui.tone}`}>{ui.label}</span>
              <p className="c-text" style={{ margin: "12px 0" }}>{lightReason(c)}</p>
              <div className="c-meta"><span>{c.logins_7d} כניסות</span><span>{c.actions_7d} פעולות מתועדות</span></div>
              <p className="c-note">זהו הרמזור הקיים עם סיבה גלויה. אין בו לבדו הערכה של איכות עבודת השטח.</p>
              <button className="c-textbtn" onClick={() => setTab("activity")}>לפעולות שתועדו ←</button>
            </section>
          </div>
          <div className="c-sectionhead"><h3>להמשך פגישת הליווי</h3></div>
          <section className="c-card">
            <div className="c-row">
              <div><strong>{nextMeeting ? `פגישה הבאה: ${dayFull(nextMeeting)}${String(nextMeeting).slice(0, 10) < today ? " (המועד עבר)" : ""}` : "פגישת המשך טרם נקבעה"}</strong><small>{data.meetings[0] ? `פגישה אחרונה: ${dayFull(data.meetings[0].date)} · ${MTG_TYPE[data.meetings[0].type] || data.meetings[0].type}` : "אין פגישות מתועדות"} · נושאים מוצעים: חסמים, משימות קודמות והתקדמות מול היעד.</small></div>
              <button className="c-primary" onClick={() => setMtgOpen(true)}>תיעוד סיכום פגישה</button>
            </div>
          </section>
        </>
      )}

      {/* ===== ACTIVITY ===== */}
      {tab === "activity" && (
        <>
          <div className="c-filterbar">
            <select value={feedType} onChange={e => { setFeedType(e.target.value); setPage(1) }} aria-label="סוג פעולה">
              <option value="">כל הפעולות</option>
              {(feed.types || []).map((t: any) => <option key={t.entity_type} value={t.entity_type}>{ENTITY[t.entity_type] || t.entity_type} ({t.n})</option>)}
            </select>
            <label className="c-periodlabel">מתאריך<input className="c-period" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} /></label>
            <label className="c-periodlabel">עד תאריך<input className="c-period" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} /></label>
            {(feedType || from || to) && <button className="c-textbtn" onClick={() => { setFeedType(""); setFrom(""); setTo(""); setPage(1) }}>ניקוי</button>}
            <span className="c-sub" style={{ marginInlineStart: "auto" }}>{feed.total} פעולות</span>
            <ExportButton type="coord-activity" label="ייצוא פעילות" params={{ coordinator_id: c.id }} />
          </div>
          <div className="c-scope">פעולות במערכת אינן תיעודי קשר עם שותפים. המסנן כאן חל על הפיד בלבד.</div>
          <div className="c-card" style={{ padding: 0 }}>
            {feed.rows.length === 0 ? <div className="c-empty">אין פעילות מתועדת{feedType || from || to ? " בסינון הזה" : ""}</div> : (
              <div className="c-timeline">
                {feed.rows.map((a: any) => (
                  <div key={a.id} className="c-tl">
                    <span className="c-sub">{dt(a.created_at)}</span>
                    <strong>{a.action === "login" ? ACTION.login : `${ENTITY[a.entity_type] || a.entity_type} ${ACTION[a.action] || a.action}`}</strong>
                    {a.summary && <p>{a.summary}</p>}
                  </div>
                ))}
              </div>
            )}
            {pages > 1 && (
              <div className="c-pager">
                <button className="c-secondary" disabled={page <= 1} onClick={() => setPage(x => x - 1)}>הקודם</button>
                <span className="c-sub">עמוד {page} מתוך {pages}</span>
                <button className="c-secondary" disabled={page >= pages} onClick={() => setPage(x => x + 1)}>הבא</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== TASKS ===== */}
      {tab === "tasks" && (
        <>
          <div className="c-scope">כל המשימות המשויכות לרכז (כולל משימות משותפות), מכל התקופות · עד 100 אחרונות. פתוחות קודם.</div>
          <div className="c-card list">
            {data.tasks.length === 0 && <div className="c-empty">אין משימות</div>}
            {data.tasks.map((t: any) => {
              const due = t.due_date ? String(t.due_date).slice(0, 10) : ""
              const late = t.status !== "done" && due && due < today
              return (
                <div key={t.id} className="c-row">
                  <button className={`c-taskcheck ${t.status === "done" ? "done" : ""}`} disabled={busyTask === t.id} onClick={() => toggleTask(t)} aria-label={t.status === "done" ? `פתיחה מחדש של ${t.title}` : `השלמת ${t.title}`}>{t.status === "done" ? "✓" : ""}</button>
                  <div className="c-grow">
                    <strong style={t.status === "done" ? { textDecoration: "line-through", color: "#93a296" } : undefined}>{t.title}</strong>
                    <small>{due ? dayFull(due) : "ללא מועד"} · {TASK_STATUS[t.status] || t.status}{t.priority === "urgent" ? " · דחוף" : ""}{t.contact_name ? ` · ${t.contact_name}` : ""}{t.event_name ? ` · ${t.event_name}` : ""}</small>
                  </div>
                  {late && <span className="c-badge red">באיחור</span>}
                  <button className="c-textbtn" onClick={() => router.push(`/admin/tasks?open=${t.id}`)}>פתיחה</button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ===== LEADS ===== */}
      {tab === "leads" && (
        <>
          <div className="c-scope">לידים אחרונים מכל התקופות · עד 100. הספירה החודשית מופיעה בראש הכרטיס.</div>
          <div className="c-card list">
            {data.leads.length === 0 && <div className="c-empty">אין לידים</div>}
            {data.leads.map((l: any) => (
              <div key={l.id} className="c-row clickable" onClick={() => router.push(`/admin/leads?open=${l.id}`)}>
                <div className="c-grow"><strong>{l.name}</strong><small>{dayFull(l.created_at)}{l.city ? ` · ${l.city}` : ""} · {l.source === "link" ? "דרך הקישור" : l.source === "event" ? "אירוע" : "ידני"}</small></div>
                <span className="c-badge grey">{LEAD_STATUS[l.status] || l.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== EVENTS ===== */}
      {tab === "events" && (
        <div className="c-card list">
          {data.events.length === 0 && <div className="c-empty">אין אירועים</div>}
          {data.events.map((e: any) => (
            <div key={e.id} className="c-row clickable" onClick={() => router.push("/admin/events")}>
              <div className="c-grow"><strong>{e.name}</strong><small>{e.date ? dayFull(e.date) : "ללא תאריך"}{e.location ? ` · ${e.location}` : ""}{e.actual_attendees != null ? ` · ${e.actual_attendees} משתתפים` : ""}{e.leads_collected ? ` · ${e.leads_collected} לידים` : ""}</small></div>
              <span className={`c-badge ${e.status === "cancelled" ? "red" : e.status === "pending_approval" ? "yellow" : "grey"}`}>{EV_STATUS[e.status] || e.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* ===== REPORTS ===== */}
      {tab === "reports" && (
        <>
          <div className="c-scope">הנתון בדיווח הוא דיווח ידני של הרכז ואינו מתווסף לספירת הלידים שנוצרו במערכת.</div>
          <div className="c-card list">
            {data.reports.length === 0 && <div className="c-empty">אין דיווחים שבועיים</div>}
            {data.reports.map((r: any) => (
              <div key={r.id} className="c-row">
                <div className="c-grow"><strong>שבוע {weekLabel(String(r.week_start).slice(0, 10))}</strong><small>הוגש ב־{dayFull(r.submitted_at)} · דיווח ידני: {r.leads_count ?? 0} לידים</small></div>
                <button className="c-textbtn" onClick={() => setOpenReport(r)}>פתיחת דיווח ←</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== MEETINGS ===== */}
      {tab === "meetings" && (
        <>
          <div className="c-sectionhead"><h3>{data.meetings.length} פגישות ליווי</h3><button className="c-primary" onClick={() => setMtgOpen(true)}>+ סיכום פגישה</button></div>
          {data.meetings.length === 0 && <div className="c-card"><div className="c-empty">אין פגישות מתועדות עדיין</div></div>}
          {data.meetings.map((m: any) => (
            <article key={m.id} className="c-card c-meeting">
              <header>
                <div><strong style={{ fontSize: 13 }}>{dayFull(m.date)} · {MTG_TYPE[m.type] || m.type}</strong></div>
                <span className={`c-badge ${m.next_meeting_date ? "" : "yellow"}`}>{m.next_meeting_date ? `המשך: ${dayFull(m.next_meeting_date)}` : "טרם נקבע המשך"}</span>
              </header>
              {m.agenda && <p className="c-text" style={{ marginTop: 10 }}><b>נושאים:</b> {m.agenda}</p>}
              <p className="c-text" style={{ marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.summary}</p>
              <footer>
                <button className="c-textbtn" onClick={() => setOpenMeeting(m)}>פתיחת הסיכום</button>
                <button className="c-textbtn danger" onClick={() => setDelMeeting(m)}>מחיקה…</button>
              </footer>
            </article>
          ))}
        </>
      )}

      {/* ===== TARGETS ===== */}
      {tab === "targets" && (
        <>
          {month !== ym() && <div className="c-warn">בראש הכרטיס נבחר {ymLabel(month)} ({c.target_leads ? `יעד שנשמר: ${c.target_leads}` : "לא נשמר יעד"}). העריכה כאן חלה על החודש הנוכחי בלבד.</div>}
          <TargetsEditor onlyId={c.id} onSaved={load} />
          <button className="c-textbtn" onClick={() => router.push("/admin/reports?tab=targets")}>כל היעדים ←</button>
        </>
      )}

      <MeetingDialog open={mtgOpen} coordinators={[{ id: c.id, name: c.name }]} coordinatorId={c.id} onClose={() => setMtgOpen(false)} onSaved={() => { setMtgOpen(false); load() }} />

      <Modal open={!!openReport} onClose={() => setOpenReport(null)} title={openReport ? `דיווח שבועי · ${c.name}` : ""} subtitle={openReport ? `שבוע ${weekLabel(String(openReport.week_start).slice(0, 10))} · הוגש ב־${dayFull(openReport.submitted_at)}` : ""} accent="#27634e" width="680px"
        footer={<div className="coord-dialog flex gap-2"><button className="c-secondary" onClick={() => setOpenReport(null)}>חזרה</button>{openReport && <button className="c-secondary" onClick={() => window.open(`/admin/reports/weekly?coordinator_id=${c.id}&week=${String(openReport.week_start).slice(0, 10)}`, "_blank")}>דוח שבועי להדפסה</button>}</div>}>
        {openReport && <div className="coord-dialog">
          <div className="c-meta"><span>דיווח ידני: {openReport.leads_count ?? 0} לידים</span><span>אינו מתווסף לספירת הלידים במערכת</span></div>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "4px 0 8px" }}>הישגים</h3><p className="c-text">{openReport.achievements || "—"}</p>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 8px" }}>אתגרים</h3><p className="c-text">{openReport.challenges || "—"}</p>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 8px" }}>תכנון לשבוע הבא</h3><p className="c-text">{openReport.next_week_plan || "—"}</p>
        </div>}
      </Modal>

      <Modal open={!!openMeeting} onClose={() => setOpenMeeting(null)} title="סיכום פגישה" subtitle={openMeeting ? `${dayFull(openMeeting.date)} · ${MTG_TYPE[openMeeting.type] || openMeeting.type}` : ""} accent="#27634e" width="680px"
        footer={<div className="coord-dialog"><button className="c-secondary" onClick={() => setOpenMeeting(null)}>חזרה</button></div>}>
        {openMeeting && <div className="coord-dialog">
          {openMeeting.agenda && <><h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>נושאים</h3><p className="c-text">{openMeeting.agenda}</p></>}
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 8px" }}>סיכום</h3><p className="c-text">{openMeeting.summary || "—"}</p>
          <div className="c-meta" style={{ marginTop: 16 }}><span>{openMeeting.next_meeting_date ? `פגישה הבאה: ${dayFull(openMeeting.next_meeting_date)}` : "לא נקבעה פגישת המשך"}</span></div>
        </div>}
      </Modal>

      <Modal open={!!delMeeting} onClose={() => setDelMeeting(null)} title="מחיקת סיכום פגישה" subtitle={delMeeting ? dayFull(delMeeting.date) : ""} accent="#9b6250"
        footer={<div className="coord-dialog flex gap-2"><button className="c-primary" style={{ background: "#9b6250", borderColor: "#9b6250" }} onClick={deleteMeeting}>מחיקה</button><button className="c-secondary" onClick={() => setDelMeeting(null)}>ביטול</button></div>}>
        <div className="coord-dialog"><p className="c-text">הסיכום יימחק לצמיתות. משימות שנוצרו ממנו נשארות במערכת.</p></div>
      </Modal>
    </div>
  )
}
