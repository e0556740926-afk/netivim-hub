"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F" }

export default function LeadSourcesPage() {
  const [sources, setSources] = useState<any[]>([])
  const [newLabel, setNewLabel] = useState("")
  const [loading, setLoading] = useState(true)

  async function load() {
    const r = await fetch("/api/admin/lead-sources")
    setSources((await r.json()).lead_sources || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function addSource() {
    if (!newLabel.trim()) return
    await fetch("/api/admin/lead-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: newLabel }) })
    setNewLabel("")
    await load()
  }
  async function toggle(id: number, active: boolean) {
    await fetch("/api/admin/lead-sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !active }) })
    await load()
  }

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › הגדרות › <span style={{ color: T.navy, fontWeight: 600 }}>מקורות ליד</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>מקורות ליד</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>הרשימה הזו מופיעה כבורר חובה בכל מקום שמוסיפים ליד חדש. רכזים נוספים לכאן אוטומטית כשנוצר משתמש רכז; אפשר גם להוסיף מקורות אחרים (לא רכז) ידנית.</div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 20, display: "flex", gap: 8 }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="מקור חדש (למשל: המלצה אישית, פרסום)" style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
        <button onClick={addSource} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>+ הוסף מקור</button>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        {sources.map(s => {
          const link = typeof window !== "undefined" && s.slug ? `${window.location.origin}/s/${s.slug}` : ""
          return (
            <div key={s.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${T.bg}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: link ? 8 : 0 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  {s.coordinator_id && <span style={{ fontSize: 11, color: T.slate, marginRight: 8 }}>רכז</span>}
                </div>
                <span onClick={() => toggle(s.id, s.active)} style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: s.active ? "#EAF3EE" : "#FDECEA", color: s.active ? T.ok : "#C0392B" }}>
                  {s.active ? "פעיל" : "מושבת"}
                </span>
              </div>
              {link && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input readOnly value={link} style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 6, padding: 6, fontSize: 12, color: T.slate }} />
                  <button onClick={() => navigator.clipboard.writeText(link)} style={{ background: T.bg, color: T.slate, border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>העתק</button>
                </div>
              )}
            </div>
          )
        })}
        {!sources.length && <div style={{ padding: 20, textAlign: "center", color: T.slate }}>אין עדיין מקורות</div>}
      </div>
    </div>
  )
}
