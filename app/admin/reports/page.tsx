"use client"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { fd, ds, ini, MONTH_HE } from "@/lib/utils"
import Card from "@/components/ui/Card"
import ExportButton from "@/components/ui/ExportButton"
import Button from "@/components/ui/Button"
import TargetsPanel from "@/components/admin/TargetsPanel"
import MeetingForm, { MTG_TYPE } from "@/components/admin/MeetingForm"
import EngagementLight, { LIGHT } from "@/components/admin/EngagementLight"

type Tab = "compare" | "meetings" | "reports" | "targets"
function ym(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` }
function ymLabel(s: string) { const [y, m] = s.split("-"); return `${MONTH_HE[Number(m) - 1]} ${y}` }
function shiftYm(s: string, by: number) { const [y, m] = s.split("-").map(Number); const d = new Date(y, m - 1 + by, 1); return ym(d) }
function ago(d?: string | null) {
  if (!d) return "אף פעם"
  const days = ds(d)
  if (days <= 0) return "היום"
  if (days === 1) return "אתמול"
  return `לפני ${days} ימים`
}

export default function CoordManagementPage() {
  const router = useRouter()
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "compare"
    const t = new URLSearchParams(window.location.search).get("tab")
    return t === "targets" || t === "reports" || t === "meetings" ? t : "compare"
  })
  const [month, setMonth] = useState(ym())
  const [compare, setCompare] = useState<any>(null)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "light", dir: 1 })
  const [meetings, setMeetings] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [showMtgForm, setShowMtgForm] = useState(false)
  const [rFilter, setRFilter] = useState("")
  const [openReport, setOpenReport] = useState<number | null>(null)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [mr, rr, cr] = await Promise.all([fetch("/api/meetings"), fetch("/api/reports"), fetch("/api/targets")])
      setMeetings((await mr.json()).meetings || [])
      setReports((await rr.json()).reports || [])
      setCoords((await cr.json()).coordinators || [])
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }
  async function loadCompare(m: string) {
    try {
      const r = await fetch(`/api/admin/coordinators/compare?month=${m}`)
      if (!r.ok) throw new Error()
      setCompare(await r.json())
    } catch { setCompare({ coordinators: [], totals: {} }) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { loadCompare(month) }, [month])

  const LIGHT_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2 }
  const rows: any[] = [...(compare?.coordinators || [])].sort((a, b) => {
    const k = sort.key
    const av = k === "light" ? LIGHT_ORDER[a.light] : (a[k] ?? -Infinity)
    const bv = k === "light" ? LIGHT_ORDER[b.light] : (b[k] ?? -Infinity)
    if (av === bv) return a.name.localeCompare(b.name, "he")
    return (av > bv ? 1 : -1) * sort.dir
  })
  function sortBy(key: string) { setSort(s => s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }) }

  function exportCsv() {
    const head = ["רכז", "אזור", "מצב", "לידים", "יעד", "% יעד", "דרך לינק", "משימות פתוחות", "באיחור", "בוצעו החודש", "זמן סגירה ממוצע (ימים)", "אינטראקציות", "אירועים", "דיווחים", "פגישות", "כניסות 7 ימים", "פעולות 7 ימים", "כניסה אחרונה", "פעילות אחרונה"]
    const lines = rows.map(r => [r.name, r.area, LIGHT[r.light]?.label, r.leads_month, r.target_leads, r.target_leads ? Math.round(r.leads_month / r.target_leads * 100) + "%" : "", r.leads_via_link_month, r.tasks_open, r.tasks_overdue, r.tasks_done_month, r.avg_close_days ?? "", r.interactions_month, r.events_month, r.reports_month, r.meetings_month, r.logins_7d, r.actions_7d, r.last_login_at ? fd(r.last_login_at) : "", r.last_active_at ? fd(r.last_active_at) : ""])
    const csv = "﻿" + [head, ...lines].map(l => l.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `coordinators-${month}.csv`; a.click()
  }

  const filteredReports = rFilter ? reports.filter(r => r.coordinator_name === rFilter) : reports
  const coordNames = [...new Set(reports.map(r => r.coordinator_name))] as string[]
  const t = compare?.totals || {}

  if (error) return <div className="p-6"><ErrorState retry={load} /></div>
  if (loading) return <div className="p-4 md:p-6 lg:p-8 space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} rows={4} />)}</div>

  const th = (label: string, key?: string, cls = "") => (
    <th onClick={key ? () => sortBy(key) : undefined}
      className={`text-right px-3 py-2.5 text-[11px] font-bold text-[#64748B] whitespace-nowrap ${key ? "cursor-pointer hover:text-[#0D2744] select-none" : ""} ${cls}`}>
      {label}{key && sort.key === key && <span className="mr-1 text-[#00488D]">{sort.dir === 1 ? "▲" : "▼"}</span>}
    </th>
  )

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">ניהול רכזים</h1>
          <div className="text-sm text-[#64748B] mt-0.5">מה כל רכז עשה בפועל בתוך המערכת — לחיצה על רכז פותחת את הכרטיס המלא שלו</div>
        </div>
        {compare && (
          <div className="flex items-center gap-2 text-xs">
            {(["green", "yellow", "red"] as const).map(l => (
              <span key={l} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold" style={{ background: LIGHT[l].bg, color: LIGHT[l].fg }}>
                <span className="w-2 h-2 rounded-full" style={{ background: LIGHT[l].dot }} />{t[l] ?? 0} {LIGHT[l].label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-[#E2E8F0] overflow-x-auto">
        {([["compare", "השוואת רכזים", "📊"], ["meetings", "סיכומי פגישות", "🤝"], ["reports", "דיווחים שבועיים", "📋"], ["targets", "יעדי לידים", "🎯"]] as const).map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${tab === key ? "border-[#00488D] text-[#00488D]" : "border-transparent text-[#475569] hover:text-[#0D2744]"}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "compare" && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-[10px] p-1">
              <button onClick={() => setMonth(m => shiftYm(m, -1))} className="w-8 h-8 rounded-[7px] hover:bg-[#F1F5F9] text-[#475569]">›</button>
              <span className="px-3 text-sm font-bold text-[#0D2744] min-w-[110px] text-center">{ymLabel(month)}</span>
              <button onClick={() => setMonth(m => shiftYm(m, 1))} disabled={month >= ym()} className="w-8 h-8 rounded-[7px] hover:bg-[#F1F5F9] text-[#475569] disabled:opacity-30">‹</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => window.open(`/admin/reports/monthly?month=${month}`, "_blank")}
                className="px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-[#F5F3FF] hover:border-[#C4B5FD] hover:text-[#5B21B6] transition-colors">📊 דו״ח חודשי ארגוני</button>
              <Button size="sm" variant="secondary" onClick={exportCsv}>⬇ ייצוא CSV</Button>
            </div>
          </div>

          {!compare ? <SkeletonCard rows={5} /> : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <tr>
                      {th("רכז", "name")}{th("מצב", "light")}{th("לידים / יעד", "leads_month")}{th("דרך לינק", "leads_via_link_month")}
                      {th("משימות פתוחות", "tasks_open")}{th("באיחור", "tasks_overdue")}{th("בוצעו", "tasks_done_month")}{th("סגירה ממוצעת", "avg_close_days")}
                      {th("אינטראקציות", "interactions_month")}{th("אירועים", "events_month")}{th("דיווחים", "reports_month")}{th("פגישות", "meetings_month")}
                      {th("כניסות 7י׳", "logins_7d")}{th("פעולות 7י׳", "actions_7d")}{th("פעיל לאחרונה", "last_active_at")}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const p = r.target_leads ? Math.min(100, Math.round(r.leads_month / r.target_leads * 100)) : null
                      return (
                        <tr key={r.id} onClick={() => router.push(`/admin/reports/${r.id}`)} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F0F7FF] cursor-pointer transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">{ini(r.name)}</div>
                              <div><div className="font-semibold text-[#0D2744] whitespace-nowrap">{r.name}</div><div className="text-[11px] text-[#94A3B8]">{r.area}</div></div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5"><EngagementLight light={r.light} withLabel /></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold tabular-nums">{r.leads_month}<span className="text-[#94A3B8] font-normal"> / {r.target_leads || "—"}</span></span>
                              {p !== null && <div className="w-14 h-1.5 bg-[#F0F4F8] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, background: p >= 100 ? "#166534" : p >= 60 ? "#00488D" : "#B45309" }} /></div>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">{r.leads_via_link_month}</td>
                          <td className="px-3 py-2.5 tabular-nums">{r.tasks_open}</td>
                          <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: r.tasks_overdue > 0 ? "#960010" : "#166534" }}>{r.tasks_overdue}</td>
                          <td className="px-3 py-2.5 tabular-nums">{r.tasks_done_month}</td>
                          <td className="px-3 py-2.5 tabular-nums text-[#475569]">{r.avg_close_days == null ? "—" : `${r.avg_close_days} י׳`}</td>
                          <td className="px-3 py-2.5 tabular-nums">{r.interactions_month}</td>
                          <td className="px-3 py-2.5 tabular-nums">{r.events_month}</td>
                          <td className="px-3 py-2.5 tabular-nums">{r.reports_month}</td>
                          <td className="px-3 py-2.5 tabular-nums">{r.meetings_month}</td>
                          <td className="px-3 py-2.5 tabular-nums" style={{ color: r.logins_7d === 0 ? "#960010" : undefined }}>{r.logins_7d}</td>
                          <td className="px-3 py-2.5 tabular-nums">{r.actions_7d}</td>
                          <td className="px-3 py-2.5 text-xs text-[#64748B] whitespace-nowrap">{ago(r.last_active_at || r.last_login_at)}</td>
                        </tr>
                      )
                    })}
                    {rows.length === 0 && <tr><td colSpan={15} className="px-3 py-10 text-center text-sm text-[#94A3B8]">אין רכזים</td></tr>}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot className="bg-[#F8FAFC] border-t border-[#E2E8F0] text-xs font-bold text-[#0D2744]">
                      <tr>
                        <td className="px-3 py-2.5">סה״כ · {rows.length} רכזים</td><td />
                        <td className="px-3 py-2.5 tabular-nums">{t.leads} / {t.target || "—"}</td><td />
                        <td className="px-3 py-2.5 tabular-nums">{t.tasks_open}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: t.tasks_overdue > 0 ? "#960010" : "#166534" }}>{t.tasks_overdue}</td>
                        <td colSpan={9} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-[#F1F5F9] text-[11px] text-[#94A3B8] leading-relaxed">
                רמזור: <b className="text-[#166534]">פעיל</b> = 2+ כניסות ו-5+ פעולות ב-7 הימים האחרונים ופחות מ-25% משימות באיחור ·
                <b className="text-[#991B1B]"> דורש תשומת לב</b> = ללא כניסה 7 ימים או 50%+ מהמשימות הפתוחות באיחור · <b className="text-[#B45309]">חלקי</b> = כל השאר.
                פעולות = כל פעולה שנרשמה ביומן המערכת (ליד, משימה, אירוע, דיווח, כניסה).
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "meetings" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-[#64748B]">{meetings.length} פגישות מתועדות</div>
            <Button onClick={() => setShowMtgForm(true)}>+ סיכום פגישה חדש</Button>
          </div>
          {showMtgForm && <MeetingForm coordinators={coords} onSaved={() => { setShowMtgForm(false); load() }} onCancel={() => setShowMtgForm(false)} />}
          <div className="space-y-3">
            {meetings.length === 0 && <div className="text-center py-12 text-sm text-[#94A3B8]">אין פגישות מתועדות עדיין</div>}
            {meetings.map(m => (
              <Card key={m.id}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push(`/admin/reports/${m.coordinator_id}?tab=meetings`)}>
                      <div className="w-10 h-10 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-sm font-bold flex-shrink-0">{ini(m.coordinator_name || "")}</div>
                      <div>
                        <div className="text-sm font-bold">{m.coordinator_name}</div>
                        <div className="text-xs text-[#64748B]">{MTG_TYPE[m.type] || m.type} · {fd(m.date)} {m.area && `· ${m.area}`}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.next_meeting_date && <div className="text-xs text-[#00488D] bg-[#F0F7FF] px-2 py-1 rounded-lg">פגישה הבאה: {fd(m.next_meeting_date)}</div>}
                      <button onClick={async () => { if (confirm("למחוק?")) await fetch("/api/meetings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id }) }).then(() => load()) }}
                        className="text-[#CBD5E1] hover:text-[#960010] text-xs">✕</button>
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

      {tab === "reports" && (
        <div>
          <div className="flex gap-2 mb-4 items-center">
            <select value={rFilter} onChange={e => setRFilter(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
              <option value="">כל הרכזים</option>
              {coordNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-xs text-[#94A3B8]">{filteredReports.length} דיווחים</span><ExportButton type="reports" label="ייצוא דיווחים" />
          </div>
          <div className="space-y-3">
            {filteredReports.map(r => (
              <Card key={r.id}>
                <div onClick={() => setOpenReport(openReport === r.id ? null : r.id)} className="p-4 flex items-center gap-4 cursor-pointer hover:bg-[#F8FAFC] transition-colors">
                  <div className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">{ini(r.coordinator_name || "")}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{r.coordinator_name}</div>
                    <div className="text-xs text-[#64748B]">שבוע {fd(r.week_start)} · {r.area}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#00488D]">{r.leads_count} לידים</div>
                    <div className="text-xs text-[#64748B]">{new Date(r.submitted_at).toLocaleDateString("he-IL")}</div>
                  </div>
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
            {filteredReports.length === 0 && <div className="text-center py-12 text-sm text-[#94A3B8]">אין דיווחים</div>}
          </div>
        </div>
      )}

      {tab === "targets" && <TargetsPanel />}
    </div>
  )
}
