"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const MEDAL = ["🥇", "🥈", "🥉"]

function pct(actual: number, target: number) {
  if (!target) return null
  return Math.min(100, Math.round((actual / target) * 100))
}
function colorFor(p: number | null) {
  if (p === null) return T.slate
  if (p >= 100) return T.ok
  if (p >= 60) return T.warn
  return T.breach
}

export default function LeaderboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editingOrgTarget, setEditingOrgTarget] = useState(false)
  const [orgTargetInput, setOrgTargetInput] = useState("")
  const [editingSource, setEditingSource] = useState<number | null>(null)
  const [sourceTargetInput, setSourceTargetInput] = useState("")

  async function load() {
    const r = await fetch("/api/admin/leaderboard-sources")
    const d = await r.json()
    setData(d)
    setOrgTargetInput(String(d.org_target || 0))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function saveOrgTarget() {
    await fetch("/api/admin/leaderboard-sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org_target: Number(orgTargetInput) || 0 }) })
    setEditingOrgTarget(false)
    await load()
  }
  async function saveSourceTarget(id: number) {
    await fetch("/api/admin/leaderboard-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_source_id: id, target_leads: Number(sourceTargetInput) || 0 }) })
    setEditingSource(null)
    await load()
  }

  if (loading || !data) return <div style={{ padding: 32 }}>טוען...</div>

  const orgPct = pct(data.total_this_month, data.org_target)
  const sorted = [...data.sources].sort((a: any, b: any) => b.total_this_month - a.total_this_month)

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>לוח מובילים · לידים החודש לפי מקור</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>
        כל מקור (רכז או גורם חופשי) שהוגדר ב&quot;מקורות ליד&quot; בהגדרות, וכמה לידים הוא הביא — לא רק רכזים.
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.slate }}>יעד כללי לארגון החודש</div>
            <div style={{ fontSize: 34, fontWeight: 700, marginTop: 4, color: colorFor(orgPct) }}>
              {data.total_this_month} / {data.org_target || "—"}
              {orgPct !== null && <span style={{ fontSize: 16, marginRight: 10 }}>({orgPct}%)</span>}
            </div>
            {data.unattributed_this_month > 0 && (
              <div style={{ fontSize: 11, color: T.slate, marginTop: 4 }}>
                מתוכם {data.unattributed_this_month} לידים החודש בלי מקור משויך (מלפני שהשדה היה חובה)
              </div>
            )}
          </div>
          {editingOrgTarget ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" value={orgTargetInput} onChange={e => setOrgTargetInput(e.target.value)} style={{ width: 90, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <button onClick={saveOrgTarget} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>שמור</button>
            </div>
          ) : (
            <button onClick={() => setEditingOrgTarget(true)} style={{ background: T.bg, color: T.slate, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>ערוך יעד כללי</button>
          )}
        </div>
        {data.org_target > 0 && (
          <div style={{ height: 10, background: T.bg, borderRadius: 5, marginTop: 14 }}>
            <div style={{ height: "100%", width: `${orgPct}%`, background: colorFor(orgPct), borderRadius: 5 }} />
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
          <thead><tr style={{ background: "#EDF2F8" }}>
            {["#", "מקור", "החודש", "יעד", "התקדמות", "סה\"כ (כל הזמנים)", "%"].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {sorted.map((s: any, i: number) => {
              const p = pct(s.total_this_month, s.target_leads)
              const col = colorFor(p)
              return (
                <tr key={s.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                  <td style={{ padding: "10px 14px", fontSize: 16 }}>{MEDAL[i] || i + 1}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                    {s.label}{s.coordinator_id && <span style={{ fontSize: 11, color: T.slate, marginRight: 6 }}>רכז</span>}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: col }}>{s.total_this_month}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {editingSource === s.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input type="number" value={sourceTargetInput} onChange={e => setSourceTargetInput(e.target.value)} style={{ width: 60, border: `1px solid ${T.border}`, borderRadius: 6, padding: 4 }} />
                        <button onClick={() => saveSourceTarget(s.id)} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>✓</button>
                      </div>
                    ) : (
                      <span onClick={() => { setEditingSource(s.id); setSourceTargetInput(String(s.target_leads || 0)) }} style={{ cursor: "pointer", textDecoration: "underline dotted" }}>
                        {s.target_leads || "—"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", minWidth: 120 }}>
                    {p !== null ? (
                      <div style={{ height: 8, background: T.bg, borderRadius: 4 }}><div style={{ height: "100%", width: `${p}%`, background: col, borderRadius: 4 }} /></div>
                    ) : <span style={{ color: T.slate, fontSize: 11 }}>אין יעד</span>}
                  </td>
                  <td style={{ padding: "10px 14px", color: T.slate }}>{s.total_all_time}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: col }}>{p !== null ? `${p}%` : "—"}</td>
                </tr>
              )
            })}
            {!sorted.length && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: T.slate }}>אין עדיין מקורות פעילים — הגדר ב&quot;מקורות ליד&quot;</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
