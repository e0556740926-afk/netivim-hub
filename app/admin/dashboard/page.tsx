"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Drawer, useDrawer } from "@/components/dashboards/Drawer"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
function money(n: number | null) { return n === null ? "—" : `₪${Math.round(n).toLocaleString()}` }

function Stat({ label, value, color, onClick }: { label: string; value: string | number; color?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, cursor: onClick ? "pointer" : undefined }}>
      <div style={{ fontSize: 12, color: T.slate }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: color || T.navy }}>{value}</div>
    </div>
  )
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.slate, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>{children}</div>
    </div>
  )
}

export default function MainDashboard() {
  const router = useRouter()
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
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

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>
  if (error || !d) return <div style={{ padding: 32, textAlign: "center", color: T.breach }}>שגיאה בטעינה — נסה לרענן.</div>

  const leadsPct = d.community.target_this_month > 0 ? Math.round((d.community.leads_this_month / d.community.target_this_month) * 100) : null

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>לוח בקרה ראשי</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 24 }}>תמונת מצב מלאה של נתיבים — ייעוץ, שטח, מוקד, תקציב ומשימות. כל מספר לחיץ פותח את הרשימה שמאחוריו.</div>

      <Block title="תיקי ייעוץ">
        <Stat label="תיקים פעילים" value={d.advisor.active_cases} onClick={() => drawer.openDrawer("active_process", `תיקים פעילים — ${d.advisor.active_cases}`)} />
        <Stat label="פניות חדשות" value={d.advisor.new_inquiries} color={d.advisor.breaching_sla > 0 ? T.breach : undefined}
          onClick={() => drawer.openDrawer("new_inquiries", `פניות חדשות — ${d.advisor.new_inquiries}`)} />
        {d.advisor.breaching_sla > 0 && <Stat label="מתוכן — חריגת SLA" value={d.advisor.breaching_sla} color={T.breach} />}
        <Stat label="תיקים בסיווג אדום" value={d.advisor.red_flag_cases} color={d.advisor.red_flag_cases > 0 ? T.breach : undefined}
          onClick={() => drawer.openDrawer("red_flag_cases", `סיווג אדום — ${d.advisor.red_flag_cases}`)} />
        <Stat label="שיבוצים החודש" value={d.advisor.placements_this_month} color={T.ok} />
        <Stat label="הפניות ממתינות למוסד" value={d.advisor.pending_institution_referrals}
          onClick={() => drawer.openDrawer("pending_institution_referrals", `הפניות ממתינות — ${d.advisor.pending_institution_referrals}`)} />
      </Block>

      <Block title="שטח וקהילה">
        <Stat label="לידים החודש מול יעד" value={`${d.community.leads_this_month} / ${d.community.target_this_month || "—"}`} color={leadsPct !== null && leadsPct < 100 ? T.warn : T.ok} />
        <Stat label="אירועים החודש" value={d.community.events_this_month} />
        <Stat label="עלות לליד ממוצעת" value={money(d.community.cost_per_lead)} />
        <Stat label="רכזים בלי דוח שבועי" value={d.community.coordinators_missing_report} color={d.community.coordinators_missing_report > 0 ? T.warn : T.ok} />
      </Block>

      <Block title="מוקד">
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 13, color: T.slate }}>אין עדיין נתוני מוקד במערכת — ממתין לאינטגרציית Aspire. לא מוצג מספר מומצא.</div>
        </div>
      </Block>

      <Block title="תקציב">
        <Stat label="ניצול תקציב כולל" value={d.budget.utilization_pct !== null ? `${d.budget.utilization_pct}%` : "—"} color={d.budget.utilization_pct !== null && d.budget.utilization_pct > 90 ? T.warn : undefined} />
        <Stat label="מקורות מימון דורשים טיפול דחוף" value={d.budget.funding_sources_urgent} color={d.budget.funding_sources_urgent > 0 ? T.breach : T.ok}
          onClick={() => router.push("/admin/budget/funding")} />
        <Stat label="ממתין לאישורך (הוצאות+רכש)" value={d.budget.pending_approvals} color={d.budget.pending_approvals > 0 ? T.warn : T.ok}
          onClick={() => router.push("/admin/dashboards/ceo")} />
      </Block>

      <Block title="משימות">
        <Stat label="משימות באיחור" value={d.tasks.overdue} color={d.tasks.overdue > 0 ? T.breach : T.ok}
          onClick={() => drawer.openDrawer("overdue_tasks", `משימות באיחור — ${d.tasks.overdue}`)} />
        <Stat label="פניות פתוחות לרב אוברמייסטר" value={d.tasks.open_rav_consultations} color={d.tasks.open_rav_consultations > 0 ? T.warn : T.ok} />
      </Block>

      <Block title="מנהלה ומערכת">
        <Stat label="אישורי התמדה ממתינים למוסד" value={d.admin.pending_retention} />
        <Stat label="חשבונות פורטל על טוקן ישן" value={d.admin.legacy_token_accounts} />
        <Stat label="משתמשים לא פעילים 30+ יום" value={d.admin.inactive_users_30d} />
      </Block>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>יומן ביקורת — פעולות רגישות אחרונות</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {d.admin.recent_sensitive_audit.map((a: any) => (
            <div key={a.id} style={{ fontSize: 13, borderTop: `1px solid ${T.bg}`, padding: "6px 0", display: "flex", justifyContent: "space-between" }}>
              <span>{a.actor_name || "אוטומטי"} — {a.summary || a.action}</span>
              <span style={{ color: T.slate }}>{new Date(a.created_at).toLocaleString("he-IL")}</span>
            </div>
          ))}
          {!d.admin.recent_sensitive_audit.length && <div style={{ color: T.slate, fontSize: 13 }}>אין רשומות רגישות לאחרונה</div>}
        </div>
      </div>

      <Drawer open={drawer.open} title={drawer.title} rows={drawer.rows} loading={drawer.loading} onClose={drawer.close} />
    </div>
  )
}
