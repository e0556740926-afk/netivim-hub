"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F" }

export default function AdvisorsTeamPage() {
  const [advisors, setAdvisors] = useState<any[]>([])
  const [load, setLoad] = useState<any[]>([])
  const [weights, setWeights] = useState({ specialization: 0.4, availability: 0.3, load: 0.3 })
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    setLoading(true)
    const r = await fetch("/api/admin/advisors")
    const d = await r.json()
    setAdvisors(d.advisors || []); setLoad(d.load || []); setWeights(d.weights); setCategories(d.categories || [])
    setLoading(false)
  }
  useEffect(() => { fetchAll() }, [])

  async function toggleSpecialization(userId: number, current: string[], cat: string) {
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat]
    await fetch("/api/admin/advisors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, specializations: next }) })
    fetchAll()
  }
  async function toggleAvailable(userId: number, current: boolean) {
    await fetch("/api/admin/advisors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, available: !current }) })
    fetchAll()
  }
  async function saveWeights() {
    await fetch("/api/admin/advisors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weight_specialization: weights.specialization, weight_availability: weights.availability, weight_load: weights.load }) })
    fetchAll()
  }

  const loadMap = new Map(load.map(l => [l.name, l]))

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › צוות ייעוץ › <span style={{ color: T.navy, fontWeight: 600 }}>ניהול יועצים</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>ניהול יועצים</div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>משקלות אלגוריתם השיבוץ</div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 14 }}>ניתנים לעריכה — לא קבועים בקוד. סכום שלושת המשקלות לא חייב להיות 1 בדיוק; הם יחסיים זה לזה.</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {(["specialization", "availability", "load"] as const).map(k => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              {{ specialization: "התמחות", availability: "זמינות", load: "עומס" }[k]}
              <input type="number" step="0.05" min="0" max="1" value={weights[k]} onChange={e => setWeights(w => ({ ...w, [k]: Number(e.target.value) }))}
                style={{ width: 80, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            </label>
          ))}
          <button onClick={saveWeights} style={{ alignSelf: "flex-end", background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer" }}>שמור</button>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#EDF2F8" }}>
            {["יועץ", "זמין", "התמחויות", "תיקים פעילים", "משימות פתוחות", "מדד עומס"].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {advisors.map(a => {
              const l = loadMap.get(a.name) || {}
              return (
                <tr key={a.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span onClick={() => toggleAvailable(a.id, a.available)} style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: a.available ? "#EAF3EE" : "#FDECEA", color: a.available ? T.ok : "#C0392B" }}>
                      {a.available ? "זמין" : "לא זמין"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 260 }}>
                      {categories.map(cat => (
                        <span key={cat} onClick={() => toggleSpecialization(a.id, a.specializations || [], cat)}
                          style={{ cursor: "pointer", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: (a.specializations || []).includes(cat) ? "#EDF2F8" : T.bg, color: (a.specializations || []).includes(cat) ? T.blue : T.slate }}>
                          {cat}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>{l.active_cases ?? 0}</td>
                  <td style={{ padding: "10px 14px" }}>{l.open_tasks ?? 0}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: (l.load_score ?? 0) > 10 ? T.warn : T.navy }}>{(l.load_score ?? 0).toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: T.slate, marginTop: 10 }}>
        מדד העומס משוקלל (תיקים פעילים + משימות פתוחות×0.5 + פריטי פולו-אפ×0.3) לתצוגה בלבד — אין עדיין סף ידוע ל&quot;עומס תקין&quot;, ולכן זה לא חוסם שיבוץ, בדיוק כפי שסוכם.
      </div>
    </div>
  )
}
