"use client"
import { useEffect, useRef, useState } from "react"

// WhatsApp's actual palette — deliberately not this app's design tokens,
// since the whole point is that this looks like WhatsApp, not like the
// rest of the CRM.
const WA = {
  headerGreen: "#075E54", chatBg: "#ECE5DD", outBubble: "#DCF8C6", inBubble: "#FFFFFF",
  inputBar: "#F0F0F0", teal: "#128C7E", grayText: "#667781", checkBlue: "#34B7F1",
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
}
function fmtDay(d: string) {
  const date = new Date(d)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  if (isToday) return "היום"
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "long" })
}

export default function WhatsAppChat({ caseId, caseName }: { caseId: number; caseName: string }) {
  const [messages, setMessages] = useState<any[]>([])
  const [phone, setPhone] = useState("")
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      const r = await fetch(`/api/cases/${caseId}/whatsapp`)
      const d = await r.json()
      setMessages(d.messages || []); setPhone(d.phone || "")
    } finally { setLoading(false) }
  }
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i) }, [caseId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages.length])

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true); setError("")
    const body = draft; setDraft("")
    const r = await fetch(`/api/cases/${caseId}/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: body }) })
    if (!r.ok) { const d = await r.json(); setError(d.error || "השליחה נכשלה") }
    setSending(false)
    await load()
  }

  // Group by day for the WhatsApp-style date dividers
  let lastDay = ""

  return (
    <div dir="rtl" style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #CBD3DD", maxWidth: 480, fontFamily: "Segoe UI, Arial, sans-serif" }}>
      <div style={{ background: WA.headerGreen, color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>
          {caseName?.[0] || "?"}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{caseName}</div>
          <div style={{ fontSize: 11, opacity: 0.8 }} dir="ltr">{phone}</div>
        </div>
      </div>

      <div style={{ background: WA.chatBg, padding: "12px 10px", height: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {loading ? (
          <div style={{ textAlign: "center", color: WA.grayText, fontSize: 13, marginTop: 20 }}>טוען...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", color: WA.grayText, fontSize: 13, marginTop: 20 }}>אין עדיין הודעות עם התיק הזה</div>
        ) : messages.map(m => {
          const day = fmtDay(m.created_at)
          const showDivider = day !== lastDay
          lastDay = day
          const isOut = m.direction === "out"
          return (
            <div key={m.id}>
              {showDivider && (
                <div style={{ textAlign: "center", margin: "10px 0" }}>
                  <span style={{ background: "#E1F0FB", color: WA.grayText, fontSize: 11, padding: "3px 10px", borderRadius: 8 }}>{day}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start", marginBottom: 4 }}>
                <div style={{
                  background: isOut ? WA.outBubble : WA.inBubble, borderRadius: 8, padding: "6px 9px 8px",
                  maxWidth: "75%", boxShadow: "0 1px 1px rgba(0,0,0,.1)", position: "relative",
                }}>
                  <div style={{ fontSize: 14, color: "#111", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: WA.grayText }}>{fmtTime(m.created_at)}</span>
                    {isOut && <span style={{ fontSize: 12, color: m.status === "failed" ? "#C0392B" : WA.checkBlue }}>{m.status === "failed" ? "⚠" : "✓✓"}</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ background: WA.inputBar, padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          placeholder="הקלד הודעה" disabled={!phone}
          style={{ flex: 1, border: "none", borderRadius: 20, padding: "10px 16px", fontSize: 14, outline: "none" }} />
        <button onClick={send} disabled={sending || !draft.trim() || !phone}
          style={{ width: 40, height: 40, borderRadius: "50%", background: WA.teal, color: "#fff", border: "none", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>
          ➤
        </button>
      </div>
      {!phone && <div style={{ padding: "6px 12px", fontSize: 11, color: "#C0392B", background: "#FDECEA" }}>אין מספר טלפון בתיק — לא ניתן לשלוח</div>}
      {error && <div style={{ padding: "6px 12px", fontSize: 11, color: "#C0392B", background: "#FDECEA" }}>{error}</div>}
    </div>
  )
}
