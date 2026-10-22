"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Modal from "@/components/ui/Modal"
import ExportButton from "@/components/ui/ExportButton"
import { MTG_TYPE } from "@/components/admin/MeetingForm"
import MeetingDialog from "@/components/coordinators/MeetingDialog"
import TargetsEditor from "@/components/coordinators/TargetsEditor"
import { ym, ymLabel, monthOptions, weekLabel, dayFull, day, initials, lightReason, LIGHT_UI, EXTRA_COLS } from "@/components/coordinators/model"
import "@/components/coordinators/coord.css"

type Tab = "team" | "meetings" | "reports" | "targets"
const TABS: [Tab, string][] = [["team", "תמונת צוות"], ["meetings", "פגישות ליווי"], ["reports", "דיווחים שבועיים"], ["targets", "יעדי לידים"]]
const COLS_KEY = "coord-extra-cols"

function readTab(): Tab {
  if (typeof window === "undefined") return "team"
  const t = new URLSearchParams(window.location.search).get("tab")
  return t === "meetings" || t === "reports" || t === "targets" ? t : "team"
}

export default function CoordManagementPage() {
  const router = useRouter()
  const [tab, setTabState] = useState<Tab>(readTab)
  const [month, setMonth] = useState(ym())
  const [compare, setCompare] = useState<any>(null)
  const [compareErr, setCompareErr] = useState(false)
  const [meetings, setMeetings] = useState<any[] | null>(null)
  const [reports, setReports] = useState<any[] | null>(null)
  const [listErr, setListErr] = useState(false)
  const [q, setQ] = useState("")
  const [area, setArea] = useState("")
  const [light, setLight] = useState("")
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "light", dir: 1 })
  const [cols, setCols] = useState<string[]>([])
  const [colsOpen, setColsOpen] = useState(false)
  const [mtgOpen, setMtgOpen] = useState(false)
  const [delMeeting, setDelMeeting] = useState<any>(null)
  const [openMeeting, setOpenMeeting] = useState<any>(null)
  const [openReport, setOpenReport] = useState<any>(null)
  const [rFilter, setRFilter] = useState("")

  function setTab(t: Tab) {
    setTabState(t)
    const u = new URL(window.location.href)
    if (t === "team") u.searchParams.delete("tab"); else u.searchParams.set("tab", t)
    window.history.replaceState(null, "", u.toString())
  }

  useEffect(() => { try { const s = localStorage.getItem(COLS_KEY); if (s) setCols(JSON.parse(s)) } catch {} }, [])
  function saveCols(next: string[]) { setCols(next); try { localStorage.setItem(COLS_KEY, JSON.stringify(next)) } catch {} }

  async function loadCompare(m: string) {
    setCompareErr(false)
    try {
      const r = await fetch(`/api/admin/coordinators/compare?month=${m}`)
      if (!r.ok) throw new Error()
      setCompare(await r.json())
    } catch { setCompareErr(true) }
  }
  async function loadLists() {
    setListErr(false)
    try {
      const [mr, rr] = await Promise.all([fetch("/api/meetings"), fetch("/api/reports")])
      if (!mr.ok || !rr.ok) throw new Error()
      setMeetings((await mr.json()).meetings || [])
      setReports((await rr.json()).reports || [])
    } catch { setListErr(true); setMeetings(m => m || []); setReports(r => r || []) }
  }
  useEffect(() => { loadCompare(month) }, [month])
  useEffect(() => { loadLists() }, [])

  const all: any[] = compare?.coordinators || []
  const areas = useMemo(() => [...new Set(all.map(r => r.area).filter(Boolean))] as string[], [all])
  const coordsForForm = all.map(c => ({ id: c.id, name: c.name }))

  const LIGHT_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2 }
  const rows = useMemo(() => {
    const needle = q.trim()
    return all
      .filter(r => !needle || `${r.name} ${r.area}`.includes(needle))
      .filter(r => !area || r.area === area)
      .filter(r => !light || r.light === light)
      .sort((a, b) => {
        const k = sort.key
        const val = (x: any) => k === "light" ? LIGHT_ORDER[x.light] : k === "name" ? x.name : k === "next_meeting_date" || k === "last_active_at" ? (x[k] ? new Date(x[k]).getTime() : -Infinity) : k === "report_this_week" ? (x.report_this_week ? 1 : 0) : (x[k] ?? -Infinity)
        const av = val(a), bv = val(b)
        if (av === bv) return a.name.localeCompare(b.name, "he")
        if (typeof av === "string") return av.localeCompare(bv, "he") * sort.dir
        return (av > bv ? 1 : -1) * sort.dir
      })
  }, [all, q, area, light, sort])
  function sortBy(key: string) { setSort(s => s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "light" ? 1 : -1 }) }

  // Summary tiles — kept honest about what each number covers.
  const withTarget = all.filter(r => r.target_leads > 0)
  const leadsWithTarget = withTarget.reduce((s, r) => s + r.leads_month, 0)
  const targetSum = withTarget.reduce((s, r) => s + r.target_leads, 0)
  const leadsNoTarget = all.filter(r => !r.target_leads).reduce((s, r) => s + r.leads_month, 0)
  const overdue = all.reduce((s, r) => s + r.tasks_overdue, 0)
  const open = all.reduce((s, r) => s + r.tasks_open, 0)
  const reported = all.filter(r => r.report_this_week).length
  const weekStart = all[0]?.report_week_start || null

  function exportCsv() {
    const head = ["רכז", "אזור", "חודש תוצאות", "מעורבות במערכת", "סיבה", "לידים", "יעד", "% יעד", "לידים דרך הקישור", "משימות פתוחות (עכשיו)", "באיחור (עכשיו)", "נסגרו בחודש", "זמן סגירה ממוצע (ימים, עד 90 יום)", "תיעודי קשר", "אירועים", "דיווחים בחודש", `דיווח לשבוע ${weekLabel(weekStart)}`, "פגישות בחודש", "פגישה הבאה", "כניסות 7 ימים", "פעולות 7 ימים", "כניסה אחרונה", "פעילות אחרונה"]
    const lines = rows.map(r => [r.name, r.area, ymLabel(month), LIGHT_UI[r.light]?.label, lightReason(r), r.leads_month, r.target_leads || "", r.target_leads ? Math.round(r.leads_month / r.target_leads * 100) + "%" : "", r.leads_via_link_month, r.tasks_open, r.tasks_overdue, r.tasks_done_month, r.avg_close_days ?? "", r.interactions_month, r.events_month, r.reports_month, r.report_this_week ? "הוגש" : "טרם הוגש", r.meetings_month, r.next_meeting_date ? dayFull(r.next_meeting_date) : "", r.logins_7d, r.actions_7d, r.last_login_at ? dayFull(r.last_login_at) : "", r.last_active_at ? dayFull(r.last_active_at) : ""])
    const csv = "﻿" + [head, ...lines].map(l => l.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `coordinators-${month}.csv`; a.click()
  }

  async function deleteMeeting() {
    if (!delMeeting) return
    await fetch("/api/meetings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: delMeeting.id }) })
    setDelMeeting(null); loadLists(); loadCompare(month)
  }

  const th = (label: string, key: string, sub?: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button onClick={() => sortBy(key)}>{label}{sort.key === key && <span style={{ color: "#27634e" }}> {sort.dir === 1 ? "↑" : "↓"}</span>}{sub && <><br />{sub}</>}</button>
    </th>
  )

  const filteredReports = (reports || []).filter(r => !rFilter || String(r.coordinator_id) === rFilter)
  const reportCoords = [...new Map((reports || []).map(r => [String(r.coordinator_id), r.coordinator_name])).entries()]

  return (
    <div className="coord-ws">
      <header className="c-heading">
        <div>
          <h1>ניהול רכזים</h1>
          <div className="c-sub">תוצאות, הקשר והצעד הבא עם כל רכז.</div>
        </div>
        <div className="c-actions">
          {tab === "team" && (
            <label className="c-periodlabel">תוצאות לחודש
              <select className="c-period" value={month} onChange={e => setMonth(e.target.value)}>
                {monthOptions().map(m => <option key={m} value={m}>{ymLabel(m)}</option>)}
              </select>
            </label>
          )}
          <button className="c-primary" onClick={() => setMtgOpen(true)}>+ סיכום פגישה</button>
        </div>
      </header>

      <nav className="c-tabs" aria-label="ניהול רכזים">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{l}</button>)}
      </nav>

      {/* ===== TEAM ===== */}
      {tab === "team" && (
        <>
          {compareErr && <div className="c-warn">לא ניתן לטעון את נתוני הצוות. <button className="c-textbtn" onClick={() => loadCompare(month)}>ניסיון חוזר</button></div>}
          <div className="c-stats">
            <div className="c-stat">
              <span>לידים בקרב רכזים עם יעד</span>
              <b>{compare ? (targetSum ? `${leadsWithTarget} / ${targetSum}` : "—") : "…"}</b>
              <small>{ymLabel(month)} · {withTarget.length} רכזים עם יעד{leadsNoTarget ? `; ${leadsNoTarget} לידים נוספים ללא יעד` : ""}</small>
            </div>
            <div className="c-stat">
              <span>שיוכי משימות באיחור</span>
              <b>{compare ? `${overdue} מתוך ${open}` : "…"}</b>
              <small>מצב נוכחי · משימה משותפת יכולה להופיע אצל כמה רכזים</small>
            </div>
            <div className="c-stat">
              <span>דיווח שבועי הוגש</span>
              <b>{compare ? `${reported} מתוך ${all.length}` : "…"}</b>
              <small>לשבוע {weekLabel(weekStart)}</small>
            </div>
          </div>

          <div className="c-filterbar">
            <input className="c-search" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש רכז או אזור…" aria-label="חיפוש רכז או אזור" />
            <select value={area} onChange={e => setArea(e.target.value)} aria-label="אזור"><option value="">כל האזורים</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}</select>
            <select value={light} onChange={e => setLight(e.target.value)} aria-label="מעורבות"><option value="">כל מצבי המעורבות</option>{Object.entries(LIGHT_UI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <button className="c-secondary" onClick={() => setColsOpen(true)}>עמודות{cols.length ? ` (${cols.length})` : ""}</button>
            <button className="c-secondary" onClick={() => window.open(`/admin/reports/monthly?month=${month}`, "_blank")}>דוח חודשי</button>
            <button className="c-secondary" onClick={exportCsv} disabled={!rows.length}>ייצוא CSV</button>
          </div>

          <div className="c-tablebox">
            <div className="c-scroll">
              <table className="c-table">
                <thead>
                  <tr>
                    {th("רכז / אזור", "name")}
                    {th("לידים / יעד", "leads_month", ymLabel(month))}
                    {th("באיחור / פתוחות", "tasks_overdue", "עכשיו")}
                    {th("דיווח לשבוע", "report_this_week", weekLabel(weekStart))}
                    {th("פגישה הבאה", "next_meeting_date")}
                    {th("מעורבות במערכת", "light", "7 ימים אחרונים")}
                    {cols.map(k => { const c = EXTRA_COLS.find(x => x.key === k); return c ? <th key={k}><button onClick={() => sortBy(k)}>{c.label}{sort.key === k && <span style={{ color: "#27634e" }}> {sort.dir === 1 ? "↑" : "↓"}</span>}<br />{c.period}</button></th> : null })}
                    <th><span className="sr-only">פתיחה</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!compare && !compareErr && <tr><td colSpan={7 + cols.length}><div className="c-empty">טוען…</div></td></tr>}
                  {compare && rows.length === 0 && <tr><td colSpan={7 + cols.length}><div className="c-empty">{all.length ? "אין רכזים שמתאימים לסינון" : "אין רכזים במערכת"}</div></td></tr>}
                  {rows.map(r => {
                    const p = r.target_leads ? Math.min(100, Math.round(r.leads_month / r.target_leads * 100)) : null
                    const ui = LIGHT_UI[r.light] || LIGHT_UI.yellow
                    const nextFuture = r.next_meeting_date && String(r.next_meeting_date).slice(0, 10) >= new Date().toISOString().slice(0, 10)
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="c-person">
                            <span className="c-avatar">{initials(r.name)}</span>
                            <div><button className="c-name" onClick={() => router.push(`/admin/reports/${r.id}?month=${month}`)}>{r.name}</button><small>{r.area || "ללא אזור"}</small></div>
                          </div>
                        </td>
                        <td>
                          {r.target_leads ? <><span className="c-num"><b>{r.leads_month}</b> / {r.target_leads}</span><div className="c-progress"><i style={{ width: `${p}%` }} /></div></>
                            : <><span className="c-num"><b>{r.leads_month}</b> / לא הוגדר</span><small>דורש הגדרת יעד</small></>}
                        </td>
                        <td><span className="c-num"><b>{r.tasks_overdue}</b> / {r.tasks_open}</span><small>שיוכי משימות</small></td>
                        <td><span className={`c-badge ${r.report_this_week ? "" : "yellow"}`}>{r.report_this_week ? "הוגש" : "טרם הוגש"}</span><small>{r.last_report_at ? `אחרון: ${dayFull(r.last_report_at)}` : "אין דיווחים"}</small></td>
                        <td>{r.next_meeting_date ? <><span className="c-num">{day(r.next_meeting_date)}</span>{!nextFuture && <small>המועד עבר</small>}</> : <span className="c-sub">לא נקבעה</span>}</td>
                        <td><span className={`c-badge ${ui.tone === "green" ? "" : ui.tone}`}>{ui.label}</span><small>{lightReason(r)}</small></td>
                        {cols.map(k => { const c = EXTRA_COLS.find(x => x.key === k); return c ? <td key={k}><span className="c-num">{c.fmt ? c.fmt(r) : r[k]}</span></td> : null })}
                        <td><button className="c-textbtn" onClick={() => router.push(`/admin/reports/${r.id}?month=${month}`)}>לכרטיס ←</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="c-legend">
              הרמזור מתאר מעורבות מתועדת במערכת, לא הערכת עובד כוללת: <b>פעילה</b> = 2+ כניסות, 5+ פעולות ופחות מ־25% משימות באיחור · <b>דורש תשומת לב</b> = ללא כניסה ב־7 ימים או 50%+ מהמשימות באיחור · <b>חלקית</b> = כל השאר. יעד חסר אינו 0% ביצוע. מדדים נוספים זמינים בבחירת העמודות.
            </div>
          </div>
        </>
      )}

      {/* ===== MEETINGS ===== */}
      {tab === "meetings" && (
        <>
          <div className="c-scope">פגישות ליווי אחרונות מכל התקופות. לכל רכז מוצג מועד ההמשך שנקבע בפגישה האחרונה.</div>
          {listErr && <div className="c-warn">חלק מהנתונים לא נטענו. <button className="c-textbtn" onClick={loadLists}>ניסיון חוזר</button></div>}
          {meetings === null && <div className="c-card"><div className="c-empty">טוען…</div></div>}
          {meetings?.length === 0 && <div className="c-card"><div className="c-empty">אין פגישות מתועדות עדיין.<br /><button className="c-textbtn" onClick={() => setMtgOpen(true)}>תיעוד סיכום פגישה ראשון</button></div></div>}
          {meetings?.map(m => (
            <article key={m.id} className="c-card c-meeting">
              <header>
                <div className="c-person">
                  <span className="c-avatar">{initials(m.coordinator_name)}</span>
                  <div>
                    <button className="c-name" onClick={() => router.push(`/admin/reports/${m.coordinator_id}?tab=meetings`)}>{m.coordinator_name}</button>
                    <div className="c-sub">{dayFull(m.date)} · {MTG_TYPE[m.type] || m.type}{m.area ? ` · ${m.area}` : ""}</div>
                  </div>
                </div>
                <span className={`c-badge ${m.next_meeting_date ? "" : "yellow"}`}>{m.next_meeting_date ? `המשך: ${dayFull(m.next_meeting_date)}` : "טרם נקבע המשך"}</span>
              </header>
              {m.agenda && <p className="c-text" style={{ marginTop: 12 }}><b>נושאים:</b> {m.agenda}</p>}
              <p className="c-text" style={{ marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.summary}</p>
              <footer>
                <button className="c-textbtn" onClick={() => setOpenMeeting(m)}>פתיחת הסיכום</button>
                <button className="c-textbtn danger" onClick={() => setDelMeeting(m)}>מחיקה…</button>
              </footer>
            </article>
          ))}
        </>
      )}

      {/* ===== REPORTS ===== */}
      {tab === "reports" && (
        <>
          <div className="c-scope">הדיווח השבועי הוא מה שהרכז כתב. מספר הלידים שדווח ידנית מוצג בנפרד ואינו מתווסף ללידים שנוצרו במערכת.</div>
          <div className="c-filterbar">
            <select value={rFilter} onChange={e => setRFilter(e.target.value)} aria-label="רכז"><option value="">כל הרכזים</option>{reportCoords.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
            <span className="c-sub">{filteredReports.length} דיווחים</span>
            <span style={{ marginInlineStart: "auto" }} />
            <ExportButton type="reports" label="ייצוא דיווחים" />
          </div>
          {reports === null && <div className="c-card"><div className="c-empty">טוען…</div></div>}
          {reports && filteredReports.length === 0 && <div className="c-card"><div className="c-empty">אין דיווחים</div></div>}
          {filteredReports.map(r => (
            <article key={r.id} className="c-card" style={{ marginBottom: 12 }}>
              <div className="c-row">
                <div className="c-person">
                  <span className="c-avatar">{initials(r.coordinator_name)}</span>
                  <div><button className="c-name" onClick={() => router.push(`/admin/reports/${r.coordinator_id}?tab=reports`)}>{r.coordinator_name}</button><small>שבוע {weekLabel(String(r.week_start).slice(0, 10))} · הוגש ב־{dayFull(r.submitted_at)}</small></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="c-badge grey">דיווח ידני: {r.leads_count ?? 0} לידים</span>
                  <button className="c-textbtn" onClick={() => setOpenReport(r)}>פתיחת דיווח ←</button>
                </div>
              </div>
            </article>
          ))}
        </>
      )}

      {/* ===== TARGETS ===== */}
      {tab === "targets" && <TargetsEditor onSaved={() => loadCompare(month)} />}

      {/* ===== DIALOGS ===== */}
      <MeetingDialog open={mtgOpen} coordinators={coordsForForm} onClose={() => setMtgOpen(false)} onSaved={() => { setMtgOpen(false); loadLists(); loadCompare(month) }} />

      <Modal open={colsOpen} onClose={() => setColsOpen(false)} title="בחירת עמודות" subtitle="המדדים המשניים נשמרים זמינים; כל עמודה מסומנת בתקופה שלה" accent="#27634e"
        footer={<div className="coord-dialog flex gap-2"><button className="c-primary" onClick={() => setColsOpen(false)}>סיום</button><button className="c-secondary" onClick={() => saveCols([])}>איפוס</button></div>}>
        <div className="coord-dialog c-columns">
          {EXTRA_COLS.map(c => (
            <label key={c.key}><input type="checkbox" checked={cols.includes(c.key)} onChange={e => saveCols(e.target.checked ? [...cols, c.key] : cols.filter(x => x !== c.key))} />{c.label} <span className="c-sub">· {c.period}</span></label>
          ))}
        </div>
      </Modal>

      <Modal open={!!openMeeting} onClose={() => setOpenMeeting(null)} title={openMeeting ? `סיכום פגישה · ${openMeeting.coordinator_name}` : ""} subtitle={openMeeting ? `${dayFull(openMeeting.date)} · ${MTG_TYPE[openMeeting.type] || openMeeting.type}` : ""} accent="#27634e" width="680px"
        footer={<div className="coord-dialog flex gap-2"><button className="c-secondary" onClick={() => setOpenMeeting(null)}>חזרה</button>{openMeeting && <button className="c-textbtn" onClick={() => router.push(`/admin/reports/${openMeeting.coordinator_id}?tab=meetings`)}>לכרטיס הרכז ←</button>}</div>}>
        {openMeeting && <div className="coord-dialog">
          {openMeeting.agenda && <><h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>נושאים</h3><p className="c-text">{openMeeting.agenda}</p></>}
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 8px" }}>סיכום</h3><p className="c-text">{openMeeting.summary || "—"}</p>
          <div className="c-meta" style={{ marginTop: 16 }}><span>{openMeeting.next_meeting_date ? `פגישה הבאה: ${dayFull(openMeeting.next_meeting_date)}` : "לא נקבעה פגישת המשך"}</span></div>
        </div>}
      </Modal>

      <Modal open={!!openReport} onClose={() => setOpenReport(null)} title={openReport ? `דיווח שבועי · ${openReport.coordinator_name}` : ""} subtitle={openReport ? `שבוע ${weekLabel(String(openReport.week_start).slice(0, 10))} · הוגש ב־${dayFull(openReport.submitted_at)}` : ""} accent="#27634e" width="680px"
        footer={<div className="coord-dialog flex gap-2"><button className="c-secondary" onClick={() => setOpenReport(null)}>חזרה</button>{openReport && <button className="c-secondary" onClick={() => window.open(`/admin/reports/weekly?coordinator_id=${openReport.coordinator_id}&week=${String(openReport.week_start).slice(0, 10)}`, "_blank")}>דוח שבועי להדפסה</button>}</div>}>
        {openReport && <div className="coord-dialog">
          <div className="c-meta"><span>דיווח ידני: {openReport.leads_count ?? 0} לידים</span><span>אינו מתווסף לספירת הלידים במערכת</span></div>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "4px 0 8px" }}>הישגים</h3><p className="c-text">{openReport.achievements || "—"}</p>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 8px" }}>אתגרים</h3><p className="c-text">{openReport.challenges || "—"}</p>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 8px" }}>תכנון לשבוע הבא</h3><p className="c-text">{openReport.next_week_plan || "—"}</p>
        </div>}
      </Modal>

      <Modal open={!!delMeeting} onClose={() => setDelMeeting(null)} title="מחיקת סיכום פגישה" subtitle={delMeeting ? `${delMeeting.coordinator_name} · ${dayFull(delMeeting.date)}` : ""} accent="#9b6250"
        footer={<div className="coord-dialog flex gap-2"><button className="c-primary" style={{ background: "#9b6250", borderColor: "#9b6250" }} onClick={deleteMeeting}>מחיקה</button><button className="c-secondary" onClick={() => setDelMeeting(null)}>ביטול</button></div>}>
        <div className="coord-dialog"><p className="c-text">הסיכום יימחק לצמיתות. משימות שנוצרו ממנו נשארות במערכת.</p></div>
      </Modal>
    </div>
  )
}
