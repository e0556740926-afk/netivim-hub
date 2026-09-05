"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", breach: "#C0392B" }

export default function InstitutionLogin() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true); setError("")
    try {
      const r = await fetch("/api/portal/institution/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })
      if (!r.ok) { const d = await r.json(); setError(d.error || "שגיאה"); setLoading(false); return }
      router.push("/portal/institution")
    } catch { setError("שגיאת רשת"); setLoading(false) }
  }

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: "#EEF1F6", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 360, maxWidth: "100%", background: "#fff", borderRadius: 16, padding: 32 }}>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>נתיבים</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>כניסה לפורטל המוסד</div>
        <label style={{ fontSize: 13, fontWeight: 600, color: T.slate, display: "block", marginBottom: 6 }}>דוא&quot;ל</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 16 }} />
        <label style={{ fontSize: 13, fontWeight: 600, color: T.slate, display: "block", marginBottom: 6 }}>סיסמה</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 20 }} />
        {error && <div style={{ color: T.breach, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{ width: "100%", background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 14, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{loading ? "מתחבר..." : "כניסה"}</button>
        <div style={{ fontSize: 12, color: T.slate, marginTop: 16, textAlign: "center" }}>יש לך קישור ישן עם טוקן? הוא ימשיך לעבוד כרגיל.</div>
      </div>
    </div>
  )
}
