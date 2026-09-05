"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Drawer, useDrawer } from "@/components/dashboards/Drawer"

const T = {
  navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8", slate: "#5A6472",
  border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", okBg: "#EAF3EE",
  warn: "#B7791F", warnBg: "#FDF6E7", breach: "#C0392B", breachBg: "#FDECEA", purple: "#6B4E9E", purpleBg: "#F2EEF8",
}
const FUNNEL_COLORS = ["#14213D", "#1F3864", "#2E5C8A", "#6B4E9E", "#B7791F", "#2E6B4F"]
function money(n: number | null) { return n === null ? "—" : `₪${Math.round(n).toLocaleString()}` }

function Section({ title, color, children, action }: { title: string; color: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 1px 3px rgba(20,33,61,.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 4, height: 18, borderRadius: 2, background: color, display: "inline-block" }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
function Hero({ label, value, color, bg, onClick }: { label: string; value: string | number; color: string; bg: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ background: bg, borderRadius: 14, padding: "18px 20px", cursor: onClick ? "pointer" : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: color === "#fff" ? "rgba(255,255,255,.85)" : T.slate }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, color }}>{value}</div>
    </div>
  )
}
function MiniStat({ label, value, color, onClick }: { label: string; value: string | number; color?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? "pointer" : undefined }}>
      <div style={{ fontSize: 12, color: T.slate }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: color || T.navy }}>{value}</div>
    </div>
  )
}

export default function MainDashboard() {
  const router = useRouter()
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const drawer = useDrawer()

  async function load() {
    setLoading(true); setError(false)
    try {
      const r = await fetch("/api/dashboards/main")
      if (!r.ok) throw new Error()
      setD(await r.json())
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function approveExpense(id: number, approve: boolean) {
    setActing(`e${id}`)
    await fetch("/api/expenses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: approve ? "paid" : "cancelled" }) })
    await load(); setActing(null)
  }
  async function approveRequest(id: number) {
    setActing(`r${id}`)
    await fetch("/api/budget/purchase-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", id }) })
    await load(); setActing(null)
  }

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>
  if (error || !d) return <div style={{ padding: 32, textAlign: "center", color: T.breach }}>שגיאה בטעינה — נסה לרענן.</div>

  const leadsPct = d.community.target_this_month > 0 ? Math.round((d.community.leads_this_month / d.community.target_this_month) * 100) : null
  const f = d.funnel
  const stages = [
    ["סך פניות", f.total, "total_inquiries"], ["נוצר קשר", f.contacted, "contacted"], ["בתהליך פעיל", f.active_process, "active_process"],
    ["הופנו", f.referred, "referred"], ["התקבלו", f.accepted, "accepted"], ["שובצו", f.placed, "placed"],
  ] as [string, number, string][]
  const maxFunnel = Math.max(1, f.total)
  const maxTrend = Math.max(1, ...d.monthly_trend.flatMap((m: any) => [m.planned, m.actual]))

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "28px 32px 60px", color: T.navy }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 26, fontWeight: 800 }}>לוח בקרה ראשי</div>
        <div style={{ fontSize: 13, color: T.slate, marginTop: 4 }}>תמונת מצב מלאה של נתיבים — ייעוץ, שטח, מוקד, תקציב ומשימות. כל מספר לחיץ פותח את הרשימה שמאחוריו.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        <Hero label="תיקים פעילים" value={d.advisor.active_cases} color={T.navy} bg="#fff" onClick={() => drawer.openDrawer("active_process", `תיקים פעילים — ${d.advisor.active_cases}`)} />
        <Hero label="חריגת SLA" value={d.advisor.breaching_sla} color="#fff" bg={d.advisor.breaching_sla > 0 ? T.breach : T.ok} onClick={() => drawer.openDrawer("new_inquiries", "פניות חדשות")} />
        <Hero label="סיווג אדום" value={d.advisor.red_flag_cases} color="#fff" bg={d.advisor.red_flag_cases > 0 ? T.breach : T.ok} onClick={() => drawer.openDrawer("red_flag_cases", "תיקים בסיווג אדום")} />
        <Hero label="משימות באיחור" value={d.tasks.overdue} color="#fff" bg={d.tasks.overdue > 0 ? T.warn : T.ok} onClick={() => drawer.openDrawer("overdue_tasks", "משימות באיחור")} />
        <Hero label="ניצול תקציב" value={d.budget.utilization_pct !== null ? `${d.budget.utilization_pct}%` : "—"} color={T.navy} bg="#fff" onClick={() => router.push("/admin/budget")} />
        <Hero label="ממתין לאישורך" value={d.budget.pending_approvals} color="#fff" bg={d.budget.pending_approvals > 0 ? T.warn : T.ok} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 20, alignItems: "start" }}>
        <div>
          <Section title="משפך תהליכי ייעוץ" color={T.breach}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {stages.map(([label, val, key], i) => {
                const widthPct = Math.max(22, Math.round((val / maxFunnel) * 100))
                const prev = i > 0 ? stages[i - 1][1] : val
                const pct = prev > 0 ? Math.round((val / prev) * 100) : null
                return (
                  <div key={label}>
                    <div onClick={() => drawer.openDrawer(key, `${label} — ${val}`)} style={{ width: `${widthPct}%`, background: FUNNEL_COLORS[i], color: "#fff", borderRadius: 8, padding: "10px 18px", display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                      <span style={{ fontSize: 13 }}>{label}</span><span style={{ fontWeight: 700 }}>{val}</span>
                    </div>
                    {i < stages.length - 1 && pct !== null && <div style={{ fontSize: 10, color: T.slate, margin: "2px 0" }}>↓ {pct}%</div>}
                  </div>
                )
              })}
            </div>
          </Section>

          <Section title="תכנון מול ביצוע — לידים לפי חודש" color={T.blue}>
            <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.slate, marginBottom: 12 }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: T.border, borderRadius: 2, marginLeft: 4 }} />מתוכנן (יעד)</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: T.blue, borderRadius: 2, marginLeft: 4 }} />בפועל</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
              {d.monthly_trend.map((m: any) => (
                <div key={m.month} style={{ flex: 1, position: "relative", height: "100%" }}>
                  <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${(m.planned / maxTrend) * 100}%`, background: T.border, borderRadius: "3px 3px 0 0" }} />
                  <div style={{ position: "absolute", bottom: 0, width: "55%", right: "22.5%", height: `${(m.actual / maxTrend) * 100}%`, background: m.actual >= m.planned && m.planned > 0 ? T.ok : T.blue, borderRadius: "3px 3px 0 0" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              {d.monthly_trend.map((m: any) => <div key={m.month} style={{ flex: 1, textAlign: "center", fontSize: 10, color: T.slate }}>{m.month.slice(5)}</div>)}
            </div>
          </Section>

          <Section title="ביצועי רכזים" color={T.ok}>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                {["רכז", "לידים/יעד", "בתהליך פעיל", "שובצו"].map(h => <th key={h} style={{ textAlign: "right", padding: "6px 10px", fontSize: 11, color: T.slate, fontWeight: 600 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {d.coordinator_performance.map((c: any) => {
                  const pct = c.target_leads ? Math.min(100, Math.round((c.leads_entered / c.target_leads) * 100)) : null
                  return (
                    <tr key={c.coordinator_name} style={{ borderTop: `1px solid ${T.bg}` }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{c.coordinator_name}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span>{c.leads_entered} / {c.target_leads ?? "—"}</span>
                          {pct !== null && <div style={{ flex: 1, height: 6, background: T.bg, borderRadius: 3, maxWidth: 60 }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? T.ok : T.warn, borderRadius: 3 }} /></div>}
                        </div>
                      </td>
                      <td style={{ padding: "8px 10px" }}>{c.converted_to_process}</td>
                      <td style={{ padding: "8px 10px", color: T.ok, fontWeight: 700 }}>{c.placed}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </Section>
        </div>

        <div>
          <Section title="שטח וקהילה" color={T.ok}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
              <MiniStat label="לידים / יעד" value={`${d.community.leads_this_month} / ${d.community.target_this_month || "—"}`} color={leadsPct !== null && leadsPct < 100 ? T.warn : T.ok} />
              <MiniStat label="אירועים החודש" value={d.community.events_this_month} />
              <MiniStat label="עלות לליד" value={money(d.community.cost_per_lead)} />
              <MiniStat label="רכזים בלי דוח" value={d.community.coordinators_missing_report} color={d.community.coordinators_missing_report > 0 ? T.warn : T.ok} />
            </div>
          </Section>

          <Section title="מוקד" color={T.slate}>
            <div style={{ fontSize: 13, color: T.slate, textAlign: "center", padding: "8px 0" }}>אין עדיין נתוני מוקד — ממתין לאינטגרציית Aspire.</div>
          </Section>

          <Section title="מקורות מימון" color={T.warn}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {d.budget.by_source.map((s: any) => {
                const pct = s.amount > 0 ? Math.round((Number(s.used) / Number(s.amount)) * 100) : 0
                return (
                  <div key={s.funder}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}><span>{s.funder}</span><span className="ltr-numeric" style={{ color: T.slate }}>{money(s.used)} / {money(s.amount)}</span></div>
                    <div style={{ height: 7, background: T.bg, borderRadius: 4 }}><div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: pct > 90 ? T.breach : pct > 75 ? T.warn : T.blue, borderRadius: 4 }} /></div>
                  </div>
                )
              })}
              {!d.budget.by_source.length && <div style={{ color: T.slate, fontSize: 13 }}>אין עדיין מקורות מימון</div>}
            </div>
          </Section>

          <Section title="ממתין לאישורך" color={T.warn}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {d.pending_items.expenses.map((e: any) => (
                <div key={`e${e.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>{e.description}</div><div style={{ fontSize: 11, color: T.slate }} className="ltr-numeric">{money(e.amount)} · {e.vendor}</div></div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button disabled={acting === `e${e.id}`} onClick={() => approveExpense(e.id, true)} style={{ background: T.okBg, color: T.ok, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>אשר</button>
                    <button disabled={acting === `e${e.id}`} onClick={() => approveExpense(e.id, false)} style={{ background: T.breachBg, color: T.breach, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>דחה</button>
                  </div>
                </div>
              ))}
              {d.pending_items.requests.map((r: any) => (
                <div key={`r${r.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>רכש — {r.item}</div><div style={{ fontSize: 11, color: T.slate }}>{r.requested_by}</div></div>
                  <button disabled={acting === `r${r.id}`} onClick={() => approveRequest(r.id)} style={{ background: T.okBg, color: T.ok, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>אשר והזמן</button>
                </div>
              ))}
              {!d.pending_items.expenses.length && !d.pending_items.requests.length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center" }}>אין דבר הממתין לאישור</div>}
            </div>
          </Section>

          <Section title="מנהלה ומערכת" color={T.purple}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
              <MiniStat label="אישורי התמדה ממתינים" value={d.admin.pending_retention} />
              <MiniStat label="חשבונות על טוקן ישן" value={d.admin.legacy_token_accounts} />
              <MiniStat label="משתמשים לא פעילים 30+" value={d.admin.inactive_users_30d} />
              <MiniStat label="הפניות ממתינות למוסד" value={d.advisor.pending_institution_referrals} onClick={() => drawer.openDrawer("pending_institution_referrals", "הפניות ממתינות")} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.slate, marginBottom: 8 }}>יומן ביקורת — פעולות רגישות אחרונות</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.admin.recent_sensitive_audit.map((a: any) => (
                <div key={a.id} style={{ fontSize: 12, borderTop: `1px solid ${T.bg}`, padding: "5px 0", display: "flex", justifyContent: "space-between" }}>
                  <span>{a.actor_name || "אוטומטי"} — {a.summary || a.action}</span>
                  <span style={{ color: T.slate }}>{new Date(a.created_at).toLocaleDateString("he-IL")}</span>
                </div>
              ))}
              {!d.admin.recent_sensitive_audit.length && <div style={{ color: T.slate, fontSize: 12 }}>אין רשומות רגישות לאחרונה</div>}
            </div>
          </Section>
        </div>
      </div>

      <Drawer open={drawer.open} title={drawer.title} rows={drawer.rows} loading={drawer.loading} onClose={drawer.close} />
    </div>
  )
}
