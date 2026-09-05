"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F" }
const CRITERIA = [
  ["opening", "פתיחה"], ["need_identification", "איתור צורך"], ["professional_fit", "התאמה מקצועית"],
  ["closing", "סגירה וצעד הבא"], ["documentation_quality", "איכות התיעוד"],
] as const

export default function CallCenterPage() {
  const [flagged, setFlagged] = useState<any[]>([])
  const [totalCalls, setTotalCalls] = useState(0)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState<number | null>(null)
  const [scores, setScores] = useState<Record<string, number>>({ opening: 0.5, need_identification: 0.5, professional_fit: 0.5, closing: 0.5, documentation_quality: 0.5 })

  async function load() {
    setLoading(true)
    const r = await fetch("/api/admin/call-qa")
    const d = await r.json()
    setFlagged(d.flagged || []); setTotalCalls(d.total_calls || 0)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function submitScore(callId: number) {
    await fetch("/api/admin/call-qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ call_id: callId, ...scores }) })
    setScoring(null)
    await load()
  }

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › צוות ייעוץ › <span style={{ color: T.navy, fontWeight: 600 }}>ניהול מוקד</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>ניהול מוקד — בקרת איכות שיחות</div>

      {totalCalls === 0 && (
        <div style={{ background: "#FDF6E7", border: "1px solid #B7791F33", borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, color: T.warn }}>
          המסך בנוי במלואו ומוכן לקלוט נתונים, אבל אין עדיין אף שיחה רשומה במערכת — זה תלוי באינטגרציית Aspire (מחוץ להיקף כרגע). ברגע שתהיה, שיחות שעונות על כללי הסימון (קצרות מדי עם תוצאה חיובית, ארוכות מדי, ללא תיעוד, תיק עם 4+ שיחות ללא התקדמות) יופיעו כאן אוטומטית.
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#EDF2F8" }}>
            {["תיק", "משך", "תוצאה", "סיבת סימון", "ציון QA", ""].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {flagged.map(c => (
              <tr key={c.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c.case_name || "—"}</td>
                <td style={{ padding: "10px 14px", color: T.slate }}>{c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, "0")}` : "—"}</td>
                <td style={{ padding: "10px 14px", color: T.slate }}>{c.outcome || "—"}</td>
                <td style={{ padding: "10px 14px", color: T.warn }}>{c.flagged_reason}</td>
                <td style={{ padding: "10px 14px" }}>—</td>
                <td style={{ padding: "10px 14px" }}>
                  {scoring === c.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => submitScore(c.id)} style={{ background: T.ok, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>שמור</button>
                    </div>
                  ) : (
                    <button onClick={() => setScoring(c.id)} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>ניקוד</button>
                  )}
                </td>
              </tr>
            ))}
            {!flagged.length && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.slate }}>אין שיחות מסומנות</td></tr>}
          </tbody>
        </table>
      </div>

      {scoring !== null && (
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>טופס ניקוד משוקלל (0.20 לכל קריטריון, ברירת מחדל)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {CRITERIA.map(([key, label]) => (
              <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                {label}
                <input type="range" min="0" max="1" step="0.1" value={scores[key]} onChange={e => setScores(s => ({ ...s, [key]: Number(e.target.value) }))} />
                <span style={{ textAlign: "center" }}>{scores[key]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
