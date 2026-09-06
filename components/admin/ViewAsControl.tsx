"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"

const ROLES = [
  ["ceo", "מנכ\"ל"], ["rav", "רב (התייעצות)"], ["recruitment_manager", "מנהל צוות ייעוץ/גיוס"],
  ["advisor", "יועץ"], ["field_manager", "מנהל שטח/קהילות"], ["coordinator", "רכז"],
  ["secretary", "מזכירות"], ["viewer", "צופה"],
]

/** Banner shown site-wide while a preview is active — always visible, so nobody forgets they're not seeing their real view. */
export function ViewAsBanner() {
  const [active, setActive] = useState<{ role: string; team: string | null } | null>(null)

  async function load() {
    const r = await fetch("/api/admin/view-as")
    const d = await r.json()
    setActive(d.active ? { role: d.role, team: d.team } : null)
  }
  useEffect(() => { load() }, [])

  async function exit() {
    await fetch("/api/admin/view-as", { method: "DELETE" })
    window.location.href = "/admin/dashboard"
  }

  if (!active) return null
  const label = ROLES.find(r => r[0] === active.role)?.[1] || active.role

  return (
    <div style={{ background: "#B7791F", color: "#fff", padding: "8px 20px", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }} dir="rtl">
      <span>👁️ אתה צופה כ&quot;{label}&quot; — זו לא הזהות האמיתית שלך, זו תצוגה זמנית לבדיקה</span>
      <span onClick={exit} style={{ cursor: "pointer", textDecoration: "underline", fontWeight: 700 }}>יציאה מהתצוגה</span>
    </div>
  )
}

/** The "start a preview" selector, shown only to a real chief admin (in the sidebar). */
export default function ViewAsControl() {
  const { user } = useAuth() as any
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    fetch("/api/admin/view-as").then(r => r.json()).then(d => setActive(d.active))
  }, [])

  if (!user || user.role !== "admin" || user.team || active) return null

  async function start(role: string) {
    await fetch("/api/admin/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) })
    window.location.href = "/admin/dashboard"
  }

  return (
    <div style={{ position: "relative" }}>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,.6)", padding: "6px 10px", textAlign: "center" }}>
        👁️ צפה כ...
      </div>
      {open && (
        <div style={{ position: "absolute", bottom: "100%", right: 0, background: "#fff", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.2)", overflow: "hidden", minWidth: 180, marginBottom: 6 }}>
          {ROLES.map(([r, label]) => (
            <div key={r} onClick={() => start(r)} style={{ padding: "10px 14px", fontSize: 13, color: "#14213D", cursor: "pointer" }}>
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
