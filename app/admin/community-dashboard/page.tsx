"use client"
import { useEffect, useState } from "react"
import { Drawer, useDrawer } from "@/components/dashboards/Drawer"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F" }
function money(n: number | null) { return n === null ? "—" : `₪${Math.round(n).toLocaleString()}` }

export default function CommunityDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const drawer = useDrawer()

  useEffect(() => {
    fetch("/api/dashboards/community").then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <div style={{ padding: 32 }}>טוען...</div>
  const p = data.pulse
  const pct = p.target_this_month > 0 ? Math.round((p.leads_this_month / p.target_this_month) * 100) : null

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › שטח וקהילה › <span style={{ color: T.navy, fontWeight: 600 }}>דשבורד קהילה</span></div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>דשבורד קהילה</div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>מד דופק קהילה</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <div onClick={() => drawer.openDrawer("total_inquiries", `לידים החודש`)} style={{ cursor: "pointer" }}>
            <div style={{ fontSize: 12, color: T.slate }}>לידים החודש מול יעד</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{p.leads_this_month} / {p.target_this_month || "—"}</div>
            {pct !== null && <div style={{ fontSize: 12, color: pct >= 100 ? T.ok : T.warn }}>{pct}%</div>}
          </div>
          <div><div style={{ fontSize: 12, color: T.slate }}>אירועים החודש</div><div style={{ fontSize: 26, fontWeight: 700 }}>{p.events_this_month}</div></div>
          <div><div style={{ fontSize: 12, color: T.slate }}>עלות לליד ממוצעת</div><div style={{ fontSize: 26, fontWeight: 700 }} className="ltr-numeric">{money(p.cost_per_lead)}</div></div>
          <div><div style={{ fontSize: 12, color: T.slate }}>פעילות קהילתית (תיקים)</div><div style={{ fontSize: 26, fontWeight: 700 }}>{data.community_activity_count}</div></div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>ביצועי רכזים</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#EDF2F8" }}>
            {["רכז", "לידים / יעד", "הומרו לתהליך פעיל", "שובצו בפועל", "אירועים"].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {data.coordinator_performance.map((c: any) => (
              <tr key={c.coordinator_name} style={{ borderTop: `1px solid ${T.bg}` }}>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c.coordinator_name}</td>
                <td style={{ padding: "10px 14px" }}>{c.leads_entered} / {c.target_leads ?? "—"}</td>
                <td style={{ padding: "10px 14px" }}>{c.converted_to_process}</td>
                <td style={{ padding: "10px 14px", color: T.ok, fontWeight: 700 }}>{c.placed}</td>
                <td style={{ padding: "10px 14px" }}>{c.events_owned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>לוח מובילים בין אירועים</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#EDF2F8" }}>
            {["אירוע", "מיקום", "לידים", "משתתפים", "עלות לליד"].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {data.event_leaderboard.map((e: any) => (
              <tr key={e.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{e.name}</td>
                <td style={{ padding: "10px 14px", color: T.slate }}>{e.location}</td>
                <td style={{ padding: "10px 14px" }}>{e.leads_collected}</td>
                <td style={{ padding: "10px 14px" }}>{e.actual_attendees}</td>
                <td style={{ padding: "10px 14px" }} className="ltr-numeric">{money(e.cost_per_lead)}</td>
              </tr>
            ))}
            {!data.event_leaderboard.length && <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין עדיין אירועים שאושרו</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, fontSize: 12, color: T.slate }}>
        &quot;מוסדות קהילה ופרויקט רבנים&quot; — בלוק נוסף מהמפרט — ממתין לבנייה בפרקים מאוחרים יותר (עדיין לא קיים מודל נתונים לפרויקט רבנים). רק בלוק &quot;לידים החודש&quot; לחיץ בסבב הזה.
      </div>
      <Drawer open={drawer.open} title={drawer.title} rows={drawer.rows} loading={drawer.loading} onClose={drawer.close} />
    </div>
  )
}
