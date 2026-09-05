"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F" }

function ExportBtn({ label }: { label: string }) {
  // Real, minimal export: downloads the current summary JSON. Not a
  // formatted Excel/PDF per-block export like the mock implies — that
  // would need a dedicated export builder per block, out of scope here.
  return (
    <button onClick={() => window.open("/api/dashboards/summary", "_blank")} style={{ background: T.bg, color: T.slate, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
      {label} ⭳
    </button>
  )
}

export default function FunderDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/dashboards/summary").then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <div style={{ padding: 32 }}>טוען...</div>

  const f = data.funnel
  const stages = [["סך פניות", f.total_inquiries, T.navy], ["בתהליך פעיל", f.active_process, T.blue], ["התקבלו", f.accepted, T.warn], ["שובצו", f.placed, T.ok]] as [string, number, string][]
  const maxVal = Math.max(1, f.total_inquiries)

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: "0.05em" }}>נתיבים · דוח שקיפות למממן</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>דשבורד למממן</div>
        </div>
        <button onClick={() => window.print()} style={{ background: T.navy, color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>הפק דוח מודפס 🖨</button>
      </div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>כלל הנתונים במסך זה מצרפיים — ללא שמות או פרטים מזהים.</div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><div style={{ fontSize: 16, fontWeight: 700 }}>משפך תהליכי ייעוץ</div><ExportBtn label="ייצוא" /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {stages.map(([label, val, color], i) => {
            const widthPct = Math.max(20, Math.round((val / maxVal) * 100))
            const prevVal = i > 0 ? stages[i - 1][1] : val
            const pct = prevVal > 0 ? Math.round((val / prevVal) * 100) : null
            return (
              <div key={label}>
                <div style={{ width: `${widthPct}%`, margin: "0 auto", background: color, color: "#fff", borderRadius: 8, padding: "10px 18px", display: "flex", justifyContent: "space-between" }}>
                  <span>{label}</span><span style={{ fontWeight: 700 }}>{val}</span>
                </div>
                {i < stages.length - 1 && pct !== null && <div style={{ fontSize: 11, color: T.slate, textAlign: "center", marginTop: 4 }}>↓ {pct}%</div>}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 700 }}>שיבוצים לפי קטגוריה</div><ExportBtn label="ייצוא" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {data.category_placements.map((c: any) => (
              <div key={c.category} style={{ background: T.bg, borderRadius: 8, padding: 12, textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 700 }}>{c.n}</div><div style={{ fontSize: 11, color: T.slate }}>{c.category}</div></div>
            ))}
            {!data.category_placements.length && <div style={{ color: T.slate, fontSize: 13, gridColumn: "1 / -1" }}>אין עדיין שיבוצים</div>}
          </div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 700 }}>דמוגרפיה מצרפית — גיל</div><ExportBtn label="ייצוא" /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span dir="ltr">15–16</span><span style={{ fontWeight: 700 }}>{data.demographics.age_15_16}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span dir="ltr">17–18</span><span style={{ fontWeight: 700 }}>{data.demographics.age_17_18}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span dir="ltr">19+</span><span style={{ fontWeight: 700 }}>{data.demographics.age_19_plus}</span></div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><div style={{ fontSize: 15, fontWeight: 700 }}>שיעורי התמדה</div><ExportBtn label="ייצוא" /></div>
          <div style={{ textAlign: "center", color: T.slate, fontSize: 13, padding: "16px 0" }}>
            עדיין אין מספיק תיקים שעברו את חלון 4/8 החודשים מאז השיבוץ כדי לחשב שיעור אמין — יחושב אוטומטית מ-<code>case_status_history</code> ברגע שיהיו נתונים.
          </div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 700 }}>סיבות נטישה</div><ExportBtn label="ייצוא" /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.dropout_reasons.map((d: any, i: number) => (
              <div key={d.reason}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span>{d.reason}</span><span style={{ fontWeight: 700 }}>{d.pct}%</span></div>
                <div style={{ height: 8, background: T.bg, borderRadius: 4 }}><div style={{ height: "100%", width: `${d.pct}%`, background: [T.slate, T.warn, T.border][i % 3], borderRadius: 4 }} /></div>
              </div>
            ))}
            {!data.dropout_reasons.length && <div style={{ color: T.slate, fontSize: 13 }}>אין עדיין נתוני נטישה</div>}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 700 }}>ניצול תקציב לפי מקור מימון</div><ExportBtn label="ייצוא" /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.budget_sources.map((b: any) => {
            const pct = b.amount ? Math.round((b.used / b.amount) * 100) : 0
            return (
              <div key={b.funder}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span>{b.funder}</span><span style={{ fontWeight: 700 }}>{pct}%</span></div>
                <div style={{ height: 8, background: T.bg, borderRadius: 4 }}><div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: pct > 80 ? T.warn : T.blue, borderRadius: 4 }} /></div>
              </div>
            )
          })}
          {!data.budget_sources.length && <div style={{ color: T.slate, fontSize: 13 }}>אין עדיין מקורות מימון מוגדרים</div>}
        </div>
      </div>
    </div>
  )
}
