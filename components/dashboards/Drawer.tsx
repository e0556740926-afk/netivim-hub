"use client"
import { useState } from "react"

const T = { navy: "#14213D", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC" }

export function useDrawer() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function openDrawer(detailKey: string, label: string) {
    setTitle(label); setOpen(true); setLoading(true)
    try {
      const r = await fetch(`/api/dashboards/summary?detail=${encodeURIComponent(detailKey)}`)
      const d = await r.json()
      setRows(d.rows || [])
    } finally { setLoading(false) }
  }
  function close() { setOpen(false) }

  return { open, title, rows, loading, openDrawer, close }
}

export function Drawer({ open, title, rows, loading, onClose }: { open: boolean; title: string; rows: any[]; loading: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,33,61,.4)", zIndex: 90 }} />
      <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, width: 400, maxWidth: "90vw", background: "#fff", zIndex: 91, boxShadow: "0 8px 24px rgba(20,33,61,.12)", padding: 24, display: "flex", flexDirection: "column" }} dir="rtl">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          <span onClick={onClose} style={{ cursor: "pointer", color: T.slate, fontSize: 20 }}>×</span>
        </div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 12 }}>הרשימה שמאחורי המספר.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          {loading ? <div style={{ color: T.slate, fontSize: 13 }}>טוען...</div> : rows.map((r, i) => (
            <div key={r.id ?? i} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
              <span>{r.name}{r.age ? `, ${r.age}` : ""}</span>
              <span style={{ color: T.slate }}>{r.organization_name || r.city || r.advisor_status || r.due_date || r.status || ""}</span>
            </div>
          ))}
          {!loading && !rows.length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>אין רשומות</div>}
        </div>
      </div>
    </>
  )
}
