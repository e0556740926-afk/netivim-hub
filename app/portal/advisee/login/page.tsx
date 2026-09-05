"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", breach: "#C0392B", ok: "#2E6B4F" }

export default function AdviseeLogin() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [phone, setPhone] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function requestAccess() {
    if (!phone || !idNumber) return
    setLoading(true); setError("")
    await fetch("/api/portal/advisee/request-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, id_number: idNumber }) })
    setLoading(false); setStep(2)
  }
  async function verify() {
    if (!otp) return
    setLoading(true); setError("")
    const r = await fetch("/api/portal/advisee/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, id_number: idNumber, otp }) })
    if (!r.ok) { const d = await r.json(); setError(d.error || "שגיאה"); setLoading(false); return }
    router.push("/portal/advisee")
  }

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: "#EEF1F6", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 360, maxWidth: "100%", background: "#fff", borderRadius: 16, padding: 32 }}>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>נתיבים</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>האזור האישי שלי</div>

        {step === 1 ? (
          <>
            <label style={{ fontSize: 13, fontWeight: 600, color: T.slate, display: "block", marginBottom: 6 }}>מספר טלפון</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 16 }} />
            <label style={{ fontSize: 13, fontWeight: 600, color: T.slate, display: "block", marginBottom: 6 }}>תעודת זהות</label>
            <input value={idNumber} onChange={e => setIdNumber(e.target.value)} dir="ltr" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 20 }} />
            <button onClick={requestAccess} disabled={loading} style={{ width: "100%", background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 14, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{loading ? "שולח..." : "המשך"}</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: T.slate, marginBottom: 16 }}>שלחנו קוד ב-WhatsApp למספר שהזנת. הזן אותו כאן:</div>
            <input value={otp} onChange={e => setOtp(e.target.value)} dir="ltr" maxLength={6} placeholder="123456" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 20, textAlign: "center", letterSpacing: 4, marginBottom: 16 }} />
            {error && <div style={{ color: T.breach, fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <button onClick={verify} disabled={loading} style={{ width: "100%", background: T.ok, color: "#fff", border: "none", borderRadius: 8, padding: 14, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{loading ? "מאמת..." : "כניסה"}</button>
            <div onClick={() => setStep(1)} style={{ fontSize: 12, color: T.slate, marginTop: 14, textAlign: "center", cursor: "pointer", textDecoration: "underline" }}>חזרה</div>
          </>
        )}
      </div>
    </div>
  )
}
