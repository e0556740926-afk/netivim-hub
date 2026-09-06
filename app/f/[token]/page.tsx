"use client"
import { useEffect, useState, use } from "react"

export default function FeedbackForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [step, setStep] = useState<"loading" | "form" | "done" | "invalid">("loading")
  const [receivedResponse, setReceivedResponse] = useState<boolean | null>(null)
  const [personalized, setPersonalized] = useState(3)
  const [nps, setNps] = useState(8)

  useEffect(() => {
    fetch(`/api/feedback?token=${token}`).then(r => r.json()).then(d => {
      if (d.error) { setStep("invalid"); return }
      setStep(d.already_responded ? "done" : "form")
    })
  }, [token])

  async function submit() {
    await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, received_response: receivedResponse, personalized_score: personalized, nps }) })
    setStep("done")
  }

  if (step === "loading") return <div style={{ padding: 32, textAlign: "center" }}>טוען...</div>
  if (step === "invalid") return <div style={{ padding: 32, textAlign: "center", color: "#C0392B" }}>קישור לא תקין</div>
  if (step === "done") return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F9FC" }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>תודה על המשוב!</div>
      </div>
    </div>
  )

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", minHeight: "100vh", background: "#F7F9FC", padding: 24, display: "flex", justifyContent: "center" }}>
      <div style={{ width: 400, maxWidth: "100%", background: "#fff", borderRadius: 16, padding: 28 }}>
        <div style={{ fontSize: 12, color: "#5A6472", marginBottom: 4 }}>נתיבים</div>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 20 }}>איך היה התהליך שלך?</div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>קיבלת מענה מהיועץ שליווה אותך?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setReceivedResponse(true)} style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: receivedResponse === true ? "#2E6B4F" : "#F7F9FC", color: receivedResponse === true ? "#fff" : "#14213D", fontWeight: 600, cursor: "pointer" }}>כן</button>
            <button onClick={() => setReceivedResponse(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: receivedResponse === false ? "#C0392B" : "#F7F9FC", color: receivedResponse === false ? "#fff" : "#14213D", fontWeight: 600, cursor: "pointer" }}>לא ממש</button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>עד כמה המענה היה מותאם אישית לך? (1-5)</div>
          <input type="range" min={1} max={5} value={personalized} onChange={e => setPersonalized(Number(e.target.value))} style={{ width: "100%" }} />
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 18 }}>{personalized}</div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>כמה סביר שתמליץ על נתיבים לחבר? (0-10)</div>
          <input type="range" min={0} max={10} value={nps} onChange={e => setNps(Number(e.target.value))} style={{ width: "100%" }} />
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 18 }}>{nps}</div>
        </div>

        <button onClick={submit} disabled={receivedResponse === null} style={{ width: "100%", background: "#2E5C8A", color: "#fff", border: "none", borderRadius: 10, padding: 14, fontWeight: 700, cursor: "pointer" }}>שליחה</button>
      </div>
    </div>
  )
}
