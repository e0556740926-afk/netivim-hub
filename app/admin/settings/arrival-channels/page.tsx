"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F" }

export default function ArrivalChannelsPage() {
  const [channels, setChannels] = useState<any[]>([])
  const [newLabel, setNewLabel] = useState("")
  const [loading, setLoading] = useState(true)

  async function load() {
    const r = await fetch("/api/admin/arrival-channels")
    setChannels((await r.json()).arrival_channels || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!newLabel.trim()) return
    await fetch("/api/admin/arrival-channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: newLabel }) })
    setNewLabel("")
    await load()
  }
  async function toggle(id: number, active: boolean) {
    await fetch("/api/admin/arrival-channels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !active }) })
    await load()
  }

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › הגדרות › <span style={{ color: T.navy, fontWeight: 600 }}>ערוצי הגעה</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>ערוצי הגעה</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>
        זה "איך הגיע הליד" (טופס אתר / פייסבוק / הפניה אישית) — נפרד לגמרי מ"מקורות ליד" (מי הביא אותו: רכז/גורם ספציפי). שני השדות מוזנים בנפרד בכל טופס הוספת ליד.
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 20, display: "flex", gap: 8 }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="ערוץ חדש (למשל: וואטסאפ עסקי)" style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
        <button onClick={add} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>+ הוסף ערוץ</button>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        {channels.map(c => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${T.bg}` }}>
            <span style={{ fontWeight: 600 }}>{c.label}</span>
            <span onClick={() => toggle(c.id, c.active)} style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: c.active ? "#EAF3EE" : "#FDECEA", color: c.active ? T.ok : "#C0392B" }}>
              {c.active ? "פעיל" : "מושבת"}
            </span>
          </div>
        ))}
        {!channels.length && <div style={{ padding: 20, textAlign: "center", color: T.slate }}>אין עדיין ערוצים</div>}
      </div>
    </div>
  )
}
