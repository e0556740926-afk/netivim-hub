"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC" }
const ACTION_LABEL: Record<string, string> = { create: "יצירה", update: "עדכון", delete: "מחיקה", restore: "שחזור", view: "צפייה" }

function fdt(d?: string | null) {
  if (!d) return ""
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"all" | "protected">("all")
  const [userFilter, setUserFilter] = useState("")
  const [entityFilter, setEntityFilter] = useState("")

  async function load() {
    setLoading(true)
    const r = await fetch("/api/audit-log?limit=200")
    setEntries((await r.json()).entries || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const users = Array.from(new Set(entries.map(e => e.actor_name).filter(Boolean)))
  const entityTypes = Array.from(new Set(entries.map(e => e.entity_type).filter(Boolean)))
  const filtered = entries
    .filter(e => tab === "all" ? e.entity_type !== "case_protected" : e.entity_type === "case_protected")
    .filter(e => !userFilter || e.actor_name === userFilter)
    .filter(e => !entityFilter || e.entity_type === entityFilter)

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>הגדרות › <span style={{ color: T.navy, fontWeight: 600 }}>יומן ביקורת</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>יומן ביקורת</div>

      <div style={{ display: "flex", gap: 4, marginBottom: -1 }}>
        {(["all", "protected"] as const).map(t => (
          <div key={t} onClick={() => setTab(t)} style={{ padding: "9px 20px", borderRadius: "8px 8px 0 0", background: tab === t ? "#fff" : T.bg, border: `1px solid ${T.border}`, borderBottom: "none", fontSize: 13, fontWeight: tab === t ? 700 : 600, color: tab === t ? T.navy : T.slate, cursor: "pointer" }}>
            {t === "all" ? "כל הפעולות" : "לוג צפייה במידע מוגן"}
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: "0 0 12px 12px", padding: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)} style={{ padding: "7px 12px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}>
            <option value="">משתמש: הכל</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={{ padding: "7px 12px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}>
            <option value="">ישות: הכל</option>
            {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: "0 0 12px 12px", overflow: "hidden", marginTop: 1 }}>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: T.blueBg }}>
            {["מתי", "מי", "מה", "ישות", "פירוט"].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                <td style={{ padding: "10px 16px", color: T.slate }}>{fdt(e.created_at)}</td>
                <td style={{ padding: "10px 16px", fontWeight: 600 }}>{e.actor_name || "אוטומטי"}</td>
                <td style={{ padding: "10px 16px" }}>{ACTION_LABEL[e.action] || e.action}</td>
                <td style={{ padding: "10px 16px", color: T.slate }}>{e.entity_type} #{e.entity_id}</td>
                <td style={{ padding: "10px 16px", color: T.slate }}>{e.summary || "—"}</td>
              </tr>
            ))}
            {!loading && !filtered.length && <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין רשומות תואמות</td></tr>}
          </tbody>
        </table></div>
      </div>
      <div style={{ fontSize: 12, color: T.slate, marginTop: 10 }}>
        הערה: יומן הביקורת הקיים שומר "מה קרה" כטקסט חופשי (עמודת summary), לא ערכי "לפני/אחרי" נפרדים כמו במוק המקורי — זה דורש שינוי מבני נוסף (שני שדות jsonb) שלא בוצע בסבב הזה.
      </div>
    </div>
  )
}
