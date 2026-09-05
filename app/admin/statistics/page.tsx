"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const DIM_LABEL: Record<string, string> = { age_bucket: "גיל", city: "עיר", sector: "מגזר", source: "מקור", advisor_status: "סטטוס", category: "קטגוריית שיבוץ" }

export default function StatisticsPage() {
  const [dims, setDims] = useState<string[]>(["age_bucket", "city"])
  const [pivot, setPivot] = useState<any>(null)
  const [cost, setCost] = useState<any>(null)
  const [propensity, setPropensity] = useState<any>(null)
  const [anomalies, setAnomalies] = useState<any>(null)
  const [forbidden, setForbidden] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [loading, setLoading] = useState(true)

  async function loadPivot() {
    try {
      const r = await fetch(`/api/statistics/pivot?dims=${dims.join(",")}`)
      if (r.status === 403) { setForbidden(true); return }
      if (!r.ok) { setPivot({ error: `שגיאת שרת (${r.status})` }); return }
      setPivot(await r.json())
    } catch {
      setPivot({ error: "שגיאת רשת" })
    }
  }
  useEffect(() => { loadPivot() }, [dims])

  useEffect(() => {
    (async () => {
      try {
        const [c, p, a] = await Promise.all([fetch("/api/statistics/cost"), fetch("/api/statistics/propensity"), fetch("/api/statistics/anomalies")])
        if (c.status === 403) { setForbidden(true); setLoading(false); return }
        if (!c.ok || !p.ok || !a.ok) { setLoadError(`שגיאת שרת (${c.status}/${p.status}/${a.status}) — נסה לרענן`); setLoading(false); return }
        setCost(await c.json()); setPropensity(await p.json()); setAnomalies(await a.json())
      } catch (e) {
        setLoadError("שגיאת רשת או תשובה לא תקינה מהשרת")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function toggleDim(d: string) {
    setDims(cur => cur.includes(d) ? cur.filter(x => x !== d) : cur.length < 4 ? [...cur, d] : cur)
  }

  if (forbidden) return <div style={{ padding: 32, textAlign: "center", color: T.breach }}>אזור זה זמין למנכ&quot;ל ולמנהל ראשי בלבד.</div>
  if (loadError) return <div style={{ padding: 32, textAlign: "center", color: T.breach }}>{loadError}</div>
  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › הנהלה › <span style={{ color: T.navy, fontWeight: 600 }}>סטטיסטיקות</span></div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>אזור סטטיסטיקות</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>מנכ&quot;ל ומנהל ראשי בלבד. אזור נפרד מהדשבורדים — לא שדרוג שלהם.</div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>חיתוך רב-ממדי (Pivot)</div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 14 }}>בחר עד 4 ממדים לחיתוך חופשי — לא גרף קבוע.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {Object.keys(DIM_LABEL).map(d => (
            <span key={d} onClick={() => toggleDim(d)} style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 14, background: dims.includes(d) ? "#EDF2F8" : T.bg, color: dims.includes(d) ? T.blue : T.slate }}>
              {DIM_LABEL[d]}{dims.includes(d) ? " ✓" : ""}
            </span>
          ))}
        </div>
        {pivot?.error ? <div style={{ color: T.breach, fontSize: 13 }}>{pivot.error}</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#EDF2F8" }}>
              {dims.map(d => <th key={d} style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: T.slate }}>{DIM_LABEL[d]}</th>)}
              <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: T.slate }}>כמות</th>
            </tr></thead>
            <tbody>
              {(pivot?.rows || []).map((r: any, i: number) => (
                <tr key={i} style={{ borderTop: `1px solid ${T.bg}` }}>
                  {dims.map((_, di) => <td key={di} style={{ padding: "8px 12px" }}>{r[`dim${di}`]}</td>)}
                  <td style={{ padding: "8px 12px", fontWeight: 700 }}>{r.n}</td>
                </tr>
              ))}
              {!pivot?.rows?.length && <tr><td colSpan={dims.length + 1} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין נתונים</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>עלות לתוצאה — לפי מקור (קמפיין)</div>
          <div style={{ fontSize: 11, color: T.slate, marginBottom: 12 }}>{cost?.campaign_note}</div>
          {cost?.by_campaign.map((c: any) => (
            <div key={c.campaign} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${T.bg}` }}>
              <span>{c.campaign}</span>
              <span>לליד: {c.cost_per_lead_approx ?? "—"} · לשיבוץ: {c.cost_per_placement_approx ?? "—"}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>עלות לתוצאה — לפי רכז</div>
          {cost?.by_coordinator.map((c: any) => (
            <div key={c.coordinator_name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${T.bg}` }}>
              <span>{c.coordinator_name}</span>
              <span>לליד: {c.cost_per_lead ?? "—"} · לשיבוץ: {c.cost_per_placement ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>דירוג נטייה — שילובים עם שיעור המרה גבוה</div>
        <div style={{ fontSize: 11, color: T.slate, marginBottom: 14 }}>{propensity?.methodology}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#EDF2F8" }}>
            {["גיל", "עיר", "מגזר", "מקור", "סה\"כ", "שובצו", "שיעור המרה"].map(h => <th key={h} style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: T.slate }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {propensity?.combinations.slice(0, 15).map((c: any, i: number) => (
              <tr key={i} style={{ borderTop: `1px solid ${T.bg}`, opacity: c.reliable ? 1 : 0.5 }}>
                <td style={{ padding: "8px 12px" }}>{c.age_bucket}</td>
                <td style={{ padding: "8px 12px" }}>{c.city}</td>
                <td style={{ padding: "8px 12px" }}>{c.sector}</td>
                <td style={{ padding: "8px 12px" }}>{c.source}</td>
                <td style={{ padding: "8px 12px" }}>{c.total}</td>
                <td style={{ padding: "8px 12px" }}>{c.placed}</td>
                <td style={{ padding: "8px 12px", fontWeight: 700, color: T.ok }}>{c.placement_rate}%{!c.reliable && " (מדגם קטן)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>זיהוי חריגות אוטומטי</div>
        <div style={{ fontSize: 11, color: T.slate, marginBottom: 14 }}>{anomalies?.methodology}</div>
        {anomalies?.anomalies.length ? anomalies.anomalies.map((a: any, i: number) => (
          <div key={i} style={{ background: "#FDF6E7", border: "1px solid #B7791F33", borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 13 }}>
            <strong>{a.coordinator_name}</strong> — {a.month}: שיעור המרה {a.current_rate}% מול ממוצע היסטורי {a.historical_avg}% ({a.deviation_pct > 0 ? "+" : ""}{a.deviation_pct}%)
          </div>
        )) : <div style={{ color: T.slate, fontSize: 13 }}>אין חריגות משמעותיות כרגע (או שאין מספיק היסטוריה עדיין — {anomalies?.insufficient_data_for?.join(", ") || "אין"})</div>}
      </div>
    </div>
  )
}
