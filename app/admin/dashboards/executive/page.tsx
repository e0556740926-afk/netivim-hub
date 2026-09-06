"use client"
import { useEffect, useState } from "react"
import { Drawer, useDrawer } from "@/components/dashboards/Drawer"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const FUNNEL_COLORS = ["#14213D", "#1F3864", "#2E5C8A", "#6B4E9E", "#B7791F", "#2E6B4F"]

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const drawer = useDrawer()

  useEffect(() => {
    fetch("/api/dashboards/summary").then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <div style={{ padding: 32 }}>טוען...</div>

  const f = data.funnel
  const stages = [
    ["סך פניות", f.total_inquiries, "total_inquiries"], ["נוצר קשר", f.contacted, "contacted"], ["בתהליך פעיל", f.active_process, "active_process"],
    ["הופנו", f.referred, "referred"], ["התקבלו", f.accepted, "accepted"], ["שובצו", f.placed, "placed"],
  ] as [string, number, string][]
  const maxVal = Math.max(1, f.total_inquiries)

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › <span style={{ color: T.navy, fontWeight: 600 }}>דשבורד מנהלים</span></div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>דשבורד מנהלים</div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>משפך תהליכי ייעוץ</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
          {stages.map(([label, val, key], i) => {
            const widthPct = Math.max(20, Math.round((val / maxVal) * 100))
            const prev = i > 0 ? stages[i - 1][1] : val
            const pct = prev > 0 ? Math.round((val / prev) * 100) : null
            return (
              <div key={label}>
                <div onClick={() => drawer.openDrawer(key, `${label} — ${val}`)} style={{ width: `${widthPct}%`, margin: "0 auto", background: FUNNEL_COLORS[i], color: "#fff", borderRadius: 8, padding: "12px 20px", display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                  <span>{label}</span><span style={{ fontWeight: 700 }}>{val}</span>
                </div>
                {i < stages.length - 1 && pct !== null && <div style={{ fontSize: 11, color: T.slate, textAlign: "center", marginTop: 4 }}>↓ {pct}%</div>}
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 12 }}>שיבוצים לפי קטגוריה (הפניות שהתקבלו)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          {data.category_placements.map((c: any) => (
            <div key={c.category} onClick={() => drawer.openDrawer(`category_${c.category}`, `${c.category} — ${c.n} שיבוצים`)} style={{ background: T.bg, borderRadius: 10, padding: 14, textAlign: "center", cursor: "pointer" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{c.n}</div>
              <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{c.category}</div>
            </div>
          ))}
          {!data.category_placements.length && <div style={{ color: T.slate, fontSize: 13, padding: 12 }}>עדיין אין הפניות שהתקבלו</div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 6 }}>זמן תגובה ראשוני ממוצע</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>{data.response_time.avg_hours !== null ? data.response_time.avg_hours.toFixed(1) : "—"} <span style={{ fontSize: 16, fontWeight: 600, color: T.slate }}>שעות</span></div>
          <div style={{ fontSize: 12, color: T.breach, marginTop: 6 }}>{data.response_time.breaching_count} פניות חורגות מ-SLA כרגע</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 6 }}>משך תהליך ייעוץ ממוצע (עד הפניה)</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>{data.process_duration.avg_days !== null ? Math.round(data.process_duration.avg_days) : "—"} <span style={{ fontSize: 16, fontWeight: 600, color: T.slate }}>ימים</span></div>
          {data.process_duration.avg_days === null && <div style={{ fontSize: 12, color: T.slate, marginTop: 6 }}>אין עדיין תיקים שעברו משלב &quot;בתהליך ייעוץ&quot; ל&quot;הופנה למסגרת&quot;</div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>סיבות נטישה</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.dropout_reasons.map((d: any, i: number) => (
              <div key={d.reason} onClick={() => drawer.openDrawer(`dropout_${d.reason}`, `${d.reason} — ${d.count} תיקים`)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span>{d.reason}</span><span style={{ fontWeight: 700 }}>{d.pct}%</span></div>
                <div style={{ height: 10, background: T.bg, borderRadius: 5 }}><div style={{ height: "100%", width: `${d.pct}%`, background: [T.slate, T.warn, T.border][i % 3], borderRadius: 5 }} /></div>
              </div>
            ))}
            {!data.dropout_reasons.length && <div style={{ color: T.slate, fontSize: 13 }}>אין עדיין תיקים שנסגרו כ&quot;לא פעיל&quot;</div>}
          </div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>דמוגרפיה ויחס המרה</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: T.slate }}>יחס המרה כולל (שובצו מתוך כלל הפניות)</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: T.ok }}>{f.conversion_rate !== null ? `${f.conversion_rate}%` : "—"}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 8 }}>גיל</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span dir="ltr">15–16</span><span style={{ fontWeight: 700 }}>{data.demographics.age_15_16}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span dir="ltr">17–18</span><span style={{ fontWeight: 700 }}>{data.demographics.age_17_18}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span dir="ltr">19+</span><span style={{ fontWeight: 700 }}>{data.demographics.age_19_plus}</span></div>
            {data.demographics.age_unknown > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: T.warn }}><span>גיל לא תקין/חסר</span><span style={{ fontWeight: 700 }}>{data.demographics.age_unknown}</span></div>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, fontSize: 12, color: T.slate }}>
        הערה: זמן תגובה/משך תהליך ודמוגרפיה עדיין לא לחיצים בסבב הזה — רק מספרי המשפך, פילוח הקטגוריות וסיבות הנטישה.
      </div>
      <Drawer open={drawer.open} title={drawer.title} rows={drawer.rows} loading={drawer.loading} onClose={drawer.close} />
    </div>
  )
}
