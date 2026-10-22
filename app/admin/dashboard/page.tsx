"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import "@/components/dashboard/premium.css"
import "@/components/shell/screens.css"
import { Icon } from "@/components/shell/icons"
import { useToast } from "@/components/ui/Toast"
import { fd, MONTH_HE } from "@/lib/utils"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import LeadsBarChart from "@/components/dashboard/LeadsBarChart"
import { Section, Kpi, Chip, Avatar, Empty, relTime, DoneCheck, BLUE, OK, WARN, BAD } from "@/components/dashboard/primitives"

const EV_STATUS: Record<string, string> = { planning: "תכנון", pending_approval: "ממתין לאישור", approved: "מאושר", marketing: "בפרסום", done: "בוצע", cancelled: "בוטל" }

export default function FieldDashboard() {
  const router = useRouter()
  const { error: notifyError } = useToast()
  const [refreshing, setRefreshing] = useState(false)
  const [taskPage, setTaskPage] = useState(0)
  const [allAlerts, setAllAlerts] = useState(false)
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [taskCoord, setTaskCoord] = useState<string>("")
  const [taskBucket, setTaskBucket] = useState<"overdue" | "today" | "this_week">("today")
  const [busy, setBusy] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<number>>(new Set())

  const load = useCallback(async (fresh = false) => {
    if (!fresh) { setLoading(true); setError(false) }
    else setRefreshing(true)
    try {
      const r = await fetch(`/api/dashboard/field${fresh ? "?fresh=1" : ""}`)
      if (!r.ok) throw new Error()
      setD(await r.json())
    } catch { if (fresh) notifyError("הרענון נכשל. הנתונים הקודמים עדיין מוצגים."); else setError(true) } finally { setLoading(false); setRefreshing(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load() }, [load])

  async function completeTask(id: number) {
    setGone(s => new Set(s).add(id))
    try {
    const response = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "done", status_only: true }) })
    if (!response.ok) throw new Error()
    await load(true)
    } catch { setGone(s=>{ const next=new Set(s);next.delete(id);return next });notifyError("לא ניתן להשלים את המשימה. אפשר לנסות שוב.") }
  }
  async function approveEvent(id: number) {
    setBusy(`ev${id}`)
    try {
    const response = await fetch(`/api/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve: true }) })
    if (!response.ok) throw new Error()
    await load(true)
    } catch { notifyError("אישור האירוע נכשל. אפשר לנסות שוב.") } finally { setBusy(null) }
  }

  const month = new Date().getMonth()
  const k = d?.kpis
  const leadsPct = k && k.org_target > 0 ? Math.round((k.leads_this_month / k.org_target) * 100) : null
  const leadsDelta = k ? (k.leads_prev_month > 0 ? Math.round(((k.leads_this_month - k.leads_prev_month) / k.leads_prev_month) * 100) : (k.leads_this_month > 0 ? 100 : 0)) : null

  const taskList = useMemo(() => {
    if (!d) return []
    const list: any[] = d.tasks[taskBucket] || []
    return list.filter(t => !gone.has(t.id)).filter(t => !taskCoord || (t.assignees || []).includes(taskCoord))
  }, [d, taskBucket, taskCoord, gone])

  if (error) return <div className="p-6"><ErrorState retry={() => load()} /></div>
  if (loading || !d) return <div className="p-4 md:p-6 lg:p-8 space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} rows={4} />)}</div>

  const taskPages = Math.max(1, Math.ceil(taskList.length / 5))
  const safeTaskPage = Math.min(taskPage, taskPages - 1)
  const visibleTasks = taskList.slice(safeTaskPage * 5, safeTaskPage * 5 + 5)
  const sourceMax = Math.max(1, ...(d.leads.by_source as any[]).map(s => s.count))

  const pendingEvents = (d.events.pending || []).length
  const attention = [
    pendingEvents > 0 && { label: "אירועים לאישור", sub: `${pendingEvents} אירועים ממתינים לבדיקה`, href: "/admin/events?status=pending_approval", tone: "warn" },
    k.reports_missing_this_week > 0 && { label: "השלמת דיווחים", sub: `${k.reports_missing_this_week} רכזים טרם דיווחו השבוע`, href: "/admin/reports", tone: "warn" },
    k.tasks_overdue > 0 && { label: "משימות באיחור", sub: `${k.tasks_overdue} משימות עברו את המועד`, href: "/admin/tasks?due=overdue", tone: "red" },
  ].filter(Boolean) as { label: string; sub: string; href: string; tone: string }[]

  return (
    <div className="dashboard-ws p-4 md:p-6 lg:p-8">
      {/* Phone: team snapshot first — the full dashboard follows below */}
      <section className="md:hidden" aria-label="תמונת מצב של הצוות" style={{ margin: "2px 0 22px" }}>
        <div className="ws-head" style={{ marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 700, letterSpacing: "-.6px", color: "var(--sh-ink)" }}>תמונת מצב</h1>
            <div className="ws-sub">{new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" })} · צוות השטח</div>
          </div>
        </div>
        <div className="ws-kpis">
          <button type="button" className="ws-card" onClick={() => router.push("/admin/leads")}>
            <small>לידים החודש</small>
            <b>{k.leads_this_month}</b>
            <span>{leadsPct !== null ? `${leadsPct}% מיעד הארגון` : "טרם הוגדר יעד ארגוני"}</span>
          </button>
          <button type="button" className="ws-card" onClick={() => router.push("/admin/tasks?due=today")}>
            <small>משימות להיום</small>
            <b>{(d.tasks.today || []).length}</b>
            <span>{k.tasks_overdue ? `${k.tasks_overdue} באיחור` : "אין משימות באיחור"}</span>
          </button>
        </div>
        <div className="ws-section"><h2>דורש תשומת לב</h2></div>
        <div className="ws-list">
          {attention.map(a => (
            <div className="ws-item" key={a.label}>
              <button type="button" className="ws-open" onClick={() => router.push(a.href)}>
                <span className="ws-main"><strong>{a.label}</strong><small>{a.sub}</small></span>
                <span className={`ws-badge ${a.tone}`}>לטיפול</span>
                <Icon name="arrow" size={18} className="chev" />
              </button>
            </div>
          ))}
          {!attention.length && <div className="ws-empty">אין כרגע פריטים שממתינים לטיפול.</div>}
        </div>
        <div className="ws-section">
          <h2>משימות הצוות להיום</h2>
          <button type="button" className="ws-link" onClick={() => router.push("/admin/tasks")}>לכל המשימות</button>
        </div>
        <div className="ws-list">
          {(d.tasks.today || []).filter((t: any) => !gone.has(t.id)).slice(0, 3).map((t: any) => (
            <div className="ws-item" key={t.id}>
              <button type="button" className="ws-open" onClick={() => router.push(`/admin/tasks?open=${t.id}`)}>
                <span className="ws-main"><strong>{t.title}</strong><small>{(t.assignees || []).join(", ") || "ללא שיוך"}</small></span>
                <Icon name="arrow" size={18} className="chev" />
              </button>
            </div>
          ))}
          {!(d.tasks.today || []).length && <div className="ws-empty">אין משימות שמועדן היום.</div>}
        </div>
        <div className="ws-sub" style={{ marginTop: 18, textAlign: "center" }}>פירוט מלא של הדשבורד ↓</div>
      </section>
      <div className="dash-heading">
        <div>
          <span className="dash-eyebrow">סביבת העבודה / תמונת מצב</span><h1 className="text-2xl font-extrabold text-[#193d33]">דשבורד שטח</h1>
          <div className="text-sm text-[#63756b] mt-1">{MONTH_HE[month]} {new Date().getFullYear()} · {d.coordinators.length} רכזים · עודכן {new Date(d.generated_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} aria-busy={refreshing} className="dash-refresh"><span aria-hidden="true">↻</span> {refreshing?"מעדכן נתונים…":"רענון נתונים"}</button>
      </div>

      <nav className="dash-jumps" aria-label="מעבר מהיר בדשבורד">{[["סקירה",".dash-kpis"],["משימות",".dash-tasks"],["רכזים",".dash-team"],["אירועים",".dash-events"],["קשרים",".dash-contacts"]].map(([label,target])=><button key={target} onClick={()=>document.querySelector(target)?.scrollIntoView({behavior:'auto',block:'start'})}>{label}</button>)}</nav>
      {/* KPI row */}
      <div className="dash-kpis">
        <Kpi label="לידים החודש" value={k.org_target ? `${k.leads_this_month} / ${k.org_target}` : k.leads_this_month} delta={leadsDelta}
          sub={leadsPct !== null ? `${leadsPct}% מהיעד` : "אין יעד ארגוני"} tone={leadsPct === null ? "navy" : leadsPct >= 100 ? "ok" : leadsPct >= 60 ? "navy" : "warn"} onClick={() => router.push("/admin/leads")} />
        <Kpi label="משימות פתוחות" value={k.tasks_open} sub={`${k.tasks_overdue} באיחור`} tone={k.tasks_overdue > 0 ? "warn" : "navy"} onClick={() => router.push("/admin/tasks")} />
        <Kpi label="משימות באיחור" value={k.tasks_overdue} tone={k.tasks_overdue > 0 ? "bad" : "ok"} onClick={() => router.push("/admin/tasks?due=overdue")} />
        <Kpi label="אירועים ב-30 יום" value={k.events_next_30d} onClick={() => router.push("/admin/events")} />
        <Kpi label="דיווחים חסרים השבוע" value={k.reports_missing_this_week} tone={k.reports_missing_this_week > 0 ? "warn" : "ok"} onClick={() => router.push("/admin/reports?tab=reports")} />
        <Kpi label="אנשי קשר חדשים" value={k.contacts_new_this_month} sub="החודש" onClick={() => router.push("/admin/contacts")} />
      </div>

      {/* Alerts */}
      {d.alerts.length > 0 && (
        <Section title="דורש תשומת לב" hint={`${d.alerts.length} התראות`} className="dash-alerts" action={d.alerts.length>3?<button className="dash-alerts-toggle" aria-expanded={allAlerts} onClick={()=>setAllAlerts(v=>!v)}>{allAlerts?"צמצום":"הצגת כל ההתראות"} <span aria-hidden="true">⌄</span></button>:undefined}>
          <div className="dash-alert-items">
            {(allAlerts?d.alerts:d.alerts.slice(0,3)).map((a: any, i: number) => (
              <button key={i} onClick={() => router.push(a.href)}
                className="flex items-center gap-2.5 text-right px-3 py-2 rounded-[10px] border border-[#edf1e9] hover:bg-[#f7f9f5] transition-colors">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.level === "high" ? BAD : a.level === "medium" ? WARN : "#94A3B8" }} />
                <span className="text-[13px] text-[#193d33] flex-1">{a.text}</span>
                <span className="text-[#94A3B8] text-xs">←</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <div className="dash-columns"><div className="dash-primary">
          {/* Leads */}
          <Section title="לידים" hint="6 חודשים אחרונים · יעד מול ביצוע" scrollable className="dash-leads">
            <LeadsBarChart data={d.leads.series} />
            <details className="dash-lead-breakdown"><summary>מקורות ופניות אחרונות <span>פרטים נוספים ⌄</span></summary><div className="grid md:grid-cols-2 gap-5 mt-4">
              <div>
                <div className="text-xs font-bold text-[#63756b] mb-2">לפי מקור · החודש</div>
                <div className="space-y-1.5">
                  {(d.leads.by_source as any[]).slice(0, 8).map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-[12px]">
                      <span className="w-28 truncate text-[#193d33]">{s.label}</span>
                      <div className="flex-1 h-2 bg-[#edf1e9] rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#28634e] transition-[width] duration-500" style={{ width: `${(s.count / sourceMax) * 100}%` }} /></div>
                      <span className="w-6 text-left tabular-nums font-bold">{s.count}</span>
                    </div>
                  ))}
                  {!d.leads.by_source.length && <Empty text="אין מקורות פעילים" />}
                </div>
                <a href="/admin/leaderboard" className="text-xs font-semibold text-[#28634e] mt-2 inline-block">לוח מובילים ←</a>
              </div>
              <div>
                <div className="text-xs font-bold text-[#63756b] mb-2">10 אחרונים</div>
                <div className="space-y-1">
                  {(d.leads.latest as any[]).map(l => (
                    <a key={l.id} href={`/admin/leads?open=${l.id}`} className="flex items-center justify-between text-[12px] px-2 py-1 rounded-lg hover:bg-[#f7f9f5]">
                      <span className="text-[#193d33] font-semibold truncate">{l.name} <span className="text-[#94A3B8] font-normal">· {l.city || "—"}</span></span>
                      <span className="text-[#63756b] whitespace-nowrap">{l.coordinator_name || l.owner_name || "—"} · {fd(l.created_at)}</span>
                    </a>
                  ))}
                  {!d.leads.latest.length && <Empty text="אין לידים עדיין" />}
                </div>
              </div>
            </div></details>
          </Section>
          {/* Coordinator board */}
          <Section title="לוח רכזים" hint="יעדים, פעילות ומעקב דיווחים" scrollable className="dash-team">
            <div className="dash-team-table overflow-x-auto -mx-1">
              <table className="w-full text-[13px] min-w-[640px]">
                <thead>
                  <tr className="text-[11px] text-[#63756b]">
                    {["רכז", "לידים / יעד", "משימות", "אירוע קרוב", "דיווח אחרון", "פעיל לאחרונה"].map(h => <th key={h} className="text-right font-semibold px-2 pb-2">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.coordinators.map((c: any) => {
                    const p = c.target > 0 ? Math.min(100, Math.round((c.leads / c.target) * 100)) : null
                    const col = p === null ? "#94A3B8" : p >= 100 ? OK : p >= 60 ? BLUE : p >= 30 ? WARN : BAD
                    const active = c.last_login_at || c.last_active_at
                    const stale = !active || Date.now() - new Date(active).getTime() > 7 * 86400000
                    return (
                      <tr key={c.id} className="border-t border-[#edf1e9] cursor-pointer hover:bg-[#f7f9f5] transition-colors">
                        <td className="px-2 py-2.5"><div className="flex items-center gap-2"><Avatar name={c.name} size={28} /><div><button onClick={() => router.push(`/admin/reports/${c.id}`)} className="dash-coord-link">{c.name} <span aria-hidden="true">↗</span></button><div className="text-[11px] text-[#63756b]">{c.area}</div></div></div></td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="whitespace-nowrap"><span className="font-bold tabular-nums" style={{ color: col }}>{c.leads}</span> <span className="text-[#94A3B8]">/ {c.target || "—"}</span></span>
                            {p !== null && <div className="w-14 h-1.5 bg-[#edf1e9] rounded-full overflow-hidden"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p}%`, background: col }} /></div>}
                          </div>
                        </td>
                        <td className="px-2 py-2.5"><span className="tabular-nums">{c.tasks_open}</span>{c.tasks_overdue > 0 && <span className="text-[#a74450] font-bold mr-1.5">· {c.tasks_overdue} באיחור</span>}</td>
                        <td className="px-2 py-2.5 text-[#63756b]">{c.next_event ? <>{fd(c.next_event.date)} <span className="text-[#94A3B8]">· {c.next_event.name}</span></> : <span className="text-[#94A3B8]">—</span>}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap">{c.last_report_at ? <span className={Date.now() - new Date(c.last_report_at).getTime() > 7 * 86400000 ? "text-[#946014] font-semibold" : "text-[#63756b]"}>{relTime(c.last_report_at)}</span> : <Chip tone="bad">אין דיווח</Chip>}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap"><span className={stale ? "text-[#946014] font-semibold" : "text-[#63756b]"}>{relTime(active)}</span></td>
                      </tr>
                    )
                  })}
                  {!d.coordinators.length && <tr><td colSpan={6}><Empty text="אין רכזים עדיין" /></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="dash-team-mobile">{d.coordinators.map((c:any)=><article key={c.id}>
              <header><Avatar name={c.name} size={36}/><div><button className="dash-coord-link" onClick={()=>router.push(`/admin/reports/${c.id}`)}>{c.name} <span aria-hidden="true">↗</span></button><p>{c.area||"ללא אזור משויך"}</p></div></header>
              <dl><div><dt>לידים / יעד</dt><dd>{c.leads} / {c.target||"—"}</dd></div><div><dt>משימות פתוחות</dt><dd>{c.tasks_open}{c.tasks_overdue>0&&<small> · {c.tasks_overdue} באיחור</small>}</dd></div><div><dt>דיווח אחרון</dt><dd>{c.last_report_at?relTime(c.last_report_at):"אין דיווח"}</dd></div><div><dt>פעיל לאחרונה</dt><dd>{relTime(c.last_login_at||c.last_active_at)}</dd></div><div className="dash-next-event"><dt>אירוע קרוב</dt><dd>{c.next_event?`${fd(c.next_event.date)} · ${c.next_event.name}`:"אין אירוע מתוכנן"}</dd></div></dl>
            </article>)}{!d.coordinators.length&&<Empty text="אין רכזים עדיין"/>}</div>
          </Section>

      </div><div className="dash-secondary">
          {/* Open tasks */}
          <Section title="משימות פתוחות" scrollable className="dash-tasks" hint="תצוגה ממוקדת · עד 5 משימות בעמוד" action={
            <select value={taskCoord} aria-label="סינון משימות לפי רכז" onChange={e => {setTaskCoord(e.target.value);setTaskPage(0)}} className="text-xs border border-[#e1e8df] rounded-lg px-2 py-1.5 bg-white">
              <option value="">כל הרכזים</option>
              {d.coordinators.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          }>
            <div className="dash-task-tabs">
              {([["overdue", "באיחור", d.tasks.overdue.length, BAD], ["today", "היום", d.tasks.today.length, BLUE], ["this_week", "השבוע", d.tasks.this_week.length, "#63756b"]] as const).map(([key, label, n, col]) => (
                <button key={key} aria-pressed={taskBucket===key} onClick={() => {setTaskBucket(key);setTaskPage(0)}}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${taskBucket === key ? "bg-[#193d33] text-white" : "bg-[#edf1e9] text-[#63756b] hover:bg-[#e1e8df]"}`}>
                  {label} <span className="tabular-nums" style={{ color: taskBucket === key ? "#fff" : col }}>{n}</span>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              {visibleTasks.map((t: any) => {
                const accent = taskBucket === "overdue" ? BAD : t.priority === "urgent" ? WARN : BLUE
                return (
                  <div key={t.id} style={{ borderRightColor: accent }} className="dash-task-item flex items-center gap-3 bg-white border border-[#edf1e9] border-r-[3px] rounded-[10px] px-3 py-2 transition-opacity">
                    <DoneCheck onDone={() => completeTask(t.id)} color={accent} />
                    <div className="flex-1 min-w-0">
                      <a className="dash-task-title" href={`/admin/tasks?q=${encodeURIComponent(t.title)}`}>{t.title}</a>
                      <div className="text-[11px] text-[#63756b] flex gap-2 flex-wrap mt-0.5">
                        <span style={{ color: accent }} className="font-semibold">{fd(t.due_date)}</span>
                        {(t.assignees || []).length > 0 && <span>{t.assignees.join(", ")}</span>}
                        {t.contact_name && <a href={`/admin/contacts?open=${t.contact_id}`} onClick={e => e.stopPropagation()} className="text-[#28634e]">👤 {t.contact_name}</a>}
                        {t.event_name && <span>🎪 {t.event_name}</span>}
                      </div>
                    </div>
                    {t.priority === "urgent" && <Chip tone="bad">דחוף</Chip>}
                  </div>
                )
              })}
              {!taskList.length && <Empty text={taskBucket === "overdue" ? "אין משימות באיחור 🎉" : "אין משימות"} />}
            </div>
            <div className="dash-task-pagination" aria-label="דפדוף במשימות"><span>{taskList.length?`${safeTaskPage*5+1}–${Math.min(safeTaskPage*5+5,taskList.length)} מתוך ${taskList.length}`:"0 משימות"}</span><div><button aria-label="עמוד המשימות הקודם" disabled={safeTaskPage===0} onClick={()=>setTaskPage(safeTaskPage-1)}>→</button><button aria-label="עמוד המשימות הבא" disabled={safeTaskPage>=taskPages-1} onClick={()=>setTaskPage(safeTaskPage+1)}>←</button></div></div>
            <div className="text-left mt-2"><a href="/admin/tasks" className="text-xs font-semibold text-[#28634e]">לכל המשימות ←</a></div>
          </Section>

          {/* Events */}
          <Section title="אירועים" hint="30 הימים הקרובים" scrollable className="dash-events">
            {d.events.pending.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-bold text-[#946014] mb-1.5">ממתינים לאישורך · {d.events.pending.length}</div>
                <div className="space-y-1.5">
                  {d.events.pending.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] px-3 py-2">
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-[#193d33] truncate">{e.name}</div><div className="text-[11px] text-[#63756b]">{fd(e.date)} · {e.coordinator_name || "—"} · ₪{(+e.budget_planned || 0).toLocaleString()}</div></div>
                      <button disabled={busy === `ev${e.id}`} onClick={() => approveEvent(e.id)} className="text-xs font-bold bg-[#28634e] text-white px-3 py-1.5 rounded-lg transition-transform active:scale-95 disabled:opacity-60">אשר</button>
                      <a href="/admin/events" className="text-xs font-semibold text-[#63756b] px-2">פרטים</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="relative pr-3">
              <div className="absolute right-[5px] top-1 bottom-1 w-px bg-[#e1e8df]" />
              <div className="space-y-2">
                {d.events.upcoming.map((e: any) => {
                  const dt = new Date(e.date)
                  const days = Math.ceil((dt.getTime() - Date.now()) / 86400000)
                  return (
                    <div key={e.id} className="relative pr-4">
                      <span className="absolute right-[-3px] top-2.5 w-[7px] h-[7px] rounded-full" style={{ background: e.approved ? OK : WARN }} />
                      <div className="flex items-center gap-3">
                        <div className="w-10 text-center flex-shrink-0"><div className="text-base font-extrabold leading-none text-[#193d33]">{dt.getDate()}</div><div className="text-[10px] text-[#63756b]">{MONTH_HE[dt.getMonth()]}</div></div>
                        <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-[#193d33] truncate">{e.name}</div><div className="text-[11px] text-[#63756b] truncate">{e.location || "—"} · {e.coordinator_name || "—"}{e.time ? ` · ${String(e.time).slice(0, 5)}` : ""}</div></div>
                        <div className="text-left"><Chip tone={e.approved ? "ok" : "warn"}>{EV_STATUS[e.status] || e.status}</Chip><div className="text-[10px] text-[#94A3B8] mt-0.5">{days <= 0 ? "היום" : `בעוד ${days} ימים`}</div></div>
                      </div>
                    </div>
                  )
                })}
                {!d.events.upcoming.length && <Empty text="אין אירועים ב-30 הימים הקרובים" />}
              </div>
            </div>
            {d.events.no_debrief.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#edf1e9]">
                <div className="text-xs font-bold text-[#63756b] mb-1">עברו בלי תחקיר · {d.events.no_debrief.length}</div>
                {d.events.no_debrief.slice(0, 4).map((e: any) => <div key={e.id} className="text-[12px] text-[#63756b]">{fd(e.date)} · {e.name} <span className="text-[#94A3B8]">({e.coordinator_name || "—"})</span></div>)}
              </div>
            )}
            <div className="text-left mt-2"><a href="/admin/events" className="text-xs font-semibold text-[#28634e]">לכל האירועים ←</a></div>
          </Section>

          {/* Contacts */}
          <Section title="אנשי קשר ושותפים" scrollable className="dash-contacts">
            <div className="text-xs font-bold text-[#63756b] mb-1.5">אינטראקציות השבוע</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(d.contacts.interactions_week as any[]).map(r => (
                <span key={r.coordinator_id} className={`text-[11px] px-2 py-1 rounded-md ${r.interactions > 0 ? "bg-[#eaf1e7] text-[#28634e]" : "bg-[#edf1e9] text-[#94A3B8]"}`}>{r.name} <b className="tabular-nums">{r.interactions}</b></span>
              ))}
            </div>
            <div className="text-xs font-bold text-[#63756b] mb-1.5">ללא מגע 60+ יום · {d.contacts.cold.length}</div>
            <div className="space-y-1">
              {(d.contacts.cold as any[]).slice(0, 8).map(c => (
                <a key={c.id} href={`/admin/contacts?open=${c.id}`} className="flex items-center justify-between text-[12px] px-2 py-1 rounded-lg hover:bg-[#f7f9f5]">
                  <span className="text-[#193d33] font-semibold truncate">{c.name} <span className="text-[#94A3B8] font-normal">· {c.org || "—"}</span></span>
                  <span className="text-[#946014] whitespace-nowrap">{c.last_contact ? relTime(c.last_contact) : "ללא מגע"}</span>
                </a>
              ))}
              {!d.contacts.cold.length && <Empty text="כולם בקשר 👌" />}
            </div>
          </Section>
      </div></div>

    </div>
  )
}

