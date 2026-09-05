"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

const T = { navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const STATUS_MSG: Record<string, string> = {
  "פנייה חדשה": "קיבלנו את הפנייה שלך ונחזור אליך בקרוב.",
  "בתהליך ייעוץ": "היועץ שלך מלווה אותך בתהליך. נעדכן אותך בכל התקדמות.",
  "הופנה למסגרת": "היועץ שלך בודק עבורך מסגרות מתאימות. נעדכן אותך ברגע שיהיה חדש.",
  "התקבל למסגרת": "יש חדשות טובות — התקבלת למסגרת! נתאם איתך את הפרטים הבאים.",
  "שובץ במסגרת": "אתה כרגע משובץ במסגרת. נמשיך ללוות אותך גם עכשיו.",
  "לא פעיל": "התהליך שלך בהמתנה כרגע. אם תרצה להמשיך, שלח לנו הודעה למטה.",
  "הסתיים בהצלחה": "התהליך שלך הסתיים בהצלחה. בהצלחה בהמשך הדרך!",
}

export default function AdviseePortal() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [message, setMessage] = useState("")
  const [sent, setSent] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const r = await fetch(`/api/portal/advisee/${token}`)
      if (!r.ok) throw new Error()
      setData(await r.json())
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [token])

  async function sendMessage() {
    if (!message.trim()) return
    await fetch(`/api/portal/advisee/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) })
    setMessage(""); setSent(true); setTimeout(() => setSent(false), 3000)
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>טוען...</div>
  if (error || !data) return <div style={{ padding: 32, textAlign: "center", color: T.breach }}>קישור לא תקין או שפג תוקפו.</div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: "#EEF1F6", minHeight: "100vh", padding: 24, display: "flex", justifyContent: "center" }}>
      <div style={{ width: 390, maxWidth: "100%", background: T.bg, minHeight: 780 }}>
        <div style={{ background: T.navy, color: "#fff", padding: "20px 20px 16px" }}>
          <div style={{ fontSize: 12, color: "#9AA6BE" }}>שלום, {data.name?.split(" ")[0]}</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>האזור האישי שלי</div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ background: T.blueBg, borderRadius: 12, padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.blue, marginBottom: 6 }}>מה קורה עכשיו</div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{STATUS_MSG[data.advisor_status] || "התהליך שלך בעיצומו."}</div>
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>ההפניות שלי</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {data.referrals.map((r: any, i: number) => (
              <div key={i} style={{ background: "#fff", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.organization_name}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: r.status === "הוזמן לראיון" ? T.ok : T.warn }}>
                  {r.status === "ממתין" ? "ממתינים לתשובה מהמסגרת" : r.status === "הוזמן לראיון" ? "הוזמנת לראיון — נעדכן על תאריך" : r.status}
                </div>
              </div>
            ))}
            {!data.referrals.length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center" }}>עדיין אין הפניות פעילות</div>}
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>הודעה ליועץ</div>
          <div style={{ background: "#fff", borderRadius: 10, padding: 14 }}>
            <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="כתוב כאן..."
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 14, fontFamily: "inherit", resize: "none", marginBottom: 10 }} />
            <button onClick={sendMessage} style={{ width: "100%", background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{sent ? "נשלח ✓" : "שלח הודעה"}</button>
            <div style={{ fontSize: 11, color: T.slate, marginTop: 8, textAlign: "center" }}>נחזור אליך תוך יום עסקים</div>
          </div>
        </div>
      </div>
    </div>
  )
}
