"use client"
import { useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC" }

const GUIDES = [
  "מסלול קרבי — מה חשוב לדעת",
  "מכינות קדם-צבאיות — מדריך להורים",
  'תומכ"ל — איך זה עובד',
]
const FAQS = [
  { q: "כמה זמן לוקח התהליך?", a: "בממוצע כמה שבועות, תלוי במסלול שנבחר." },
  { q: "האם השירות עולה כסף?", a: "השירות שלנו ניתן ללא עלות למשפחה." },
]
const STORIES = [
  '"הגעתי אליהם אחרי תקופה לא פשוטה, והיום אני לומד במסגרת שמתאימה לי בול." — בוגר, מסלול ישיבתי',
]

export default function PublicInfoPortal() {
  const [form, setForm] = useState({ name: "", phone: "" })
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  async function submit() {
    if (!form.name || !form.phone) return
    setSending(true)
    try {
      // Reuses the existing public lead-intake endpoint (already open to
      // unauthenticated POST for the public lead form) rather than a new
      // one — same trust boundary, same data destination.
      await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, phone: form.phone, source: "info_portal" }),
      })
      setSent(true); setForm({ name: "", phone: "" })
    } finally { setSending(false) }
  }

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: "#EEF1F6", minHeight: "100vh", padding: 24, display: "flex", justifyContent: "center" }}>
      <div style={{ width: 390, maxWidth: "100%", background: "#fff", minHeight: 780 }}>
        <div style={{ background: T.navy, color: "#fff", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>נתיבים — מדריכים ומידע</div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>מדריכים על המסלולים</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
            {GUIDES.map(g => <div key={g} style={{ background: T.bg, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{g}</div></div>)}
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>שאלות נפוצות</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
            {FAQS.map(f => (
              <div key={f.q} style={{ borderBottom: `1px solid ${T.bg}`, padding: "10px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{f.q}</div>
                <div style={{ fontSize: 13, color: T.slate, marginTop: 4 }}>{f.a}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>סיפורי בוגרים</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
            {STORIES.map((s, i) => <div key={i} style={{ background: T.bg, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 13, lineHeight: 1.6, color: T.navy }}>{s}</div></div>)}
          </div>

          <div style={{ background: "#EDF2F8", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>רוצה לדבר איתנו?</div>
            {sent ? (
              <div style={{ fontSize: 13, color: T.blue, textAlign: "center", padding: "8px 0" }}>תודה! ניצור איתך קשר בקרוב.</div>
            ) : (
              <>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="שם מלא"
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 8 }} />
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} type="tel" placeholder="טלפון"
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 10 }} />
                <button onClick={submit} disabled={sending} style={{ width: "100%", background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{sending ? "שולח..." : "שליחה"}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
