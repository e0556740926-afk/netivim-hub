"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", breach: "#C0392B" }
const TYPE_LABEL: Record<string, string> = { agency: "משרד פרסום", funder: "גורם מממן" }

export default function ExternalAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [form, setForm] = useState({ account_type: "agency", name: "", email: "", access_expires_at: "" })
  const [loading, setLoading] = useState(true)

  async function load() {
    const r = await fetch("/api/admin/external-accounts")
    setAccounts((await r.json()).accounts || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.name) return
    await fetch("/api/admin/external-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    setForm({ account_type: "agency", name: "", email: "", access_expires_at: "" })
    await load()
  }
  async function toggle(id: number, active: boolean) {
    await fetch("/api/admin/external-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !active }) })
    await load()
  }

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › הגדרות › <span style={{ color: T.navy, fontWeight: 600 }}>חשבונות חוץ</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>חשבונות חוץ</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>משרדי פרסום וגורמים מממנים — נפרד לגמרי מ-<code>users</code>, בלי שום גישה טכנית למידע פנימי. תוקף גישה הוא שדה חובה מומלץ.</div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}>
          <option value="agency">משרד פרסום</option>
          <option value="funder">גורם מממן</option>
        </select>
        <input placeholder="שם" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
        <input placeholder="דוא&quot;ל (לא חובה)" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
        <input type="date" value={form.access_expires_at} onChange={e => setForm(f => ({ ...f, access_expires_at: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
        <button onClick={add} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>+ הוסף</button>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        {accounts.map(a => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${T.bg}` }}>
            <div>
              <span style={{ fontWeight: 600 }}>{a.name}</span>
              <span style={{ fontSize: 11, color: T.slate, marginRight: 8 }}>{TYPE_LABEL[a.account_type]}</span>
              {a.access_expires_at && <span style={{ fontSize: 11, color: T.slate, marginRight: 8 }}>עד {String(a.access_expires_at).slice(0, 10)}</span>}
            </div>
            <span onClick={() => toggle(a.id, a.active)} style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: a.active ? "#EAF3EE" : "#FDECEA", color: a.active ? T.ok : T.breach }}>
              {a.active ? "פעיל" : "מושבת"}
            </span>
          </div>
        ))}
        {!accounts.length && <div style={{ padding: 20, textAlign: "center", color: T.slate }}>אין עדיין חשבונות חוץ</div>}
      </div>
    </div>
  )
}
