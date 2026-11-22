"use client"
import { useEffect, useState } from "react"

/**
 * "🧭 בוט המסלולים" — what the event bot knows. Its answers about tracks come
 * only from the knowledge center's "מאגר ידע" documents, extracted to text in
 * the background. Internal-only material is listed but never given to the bot.
 */
const C = { navy: "#193d33", green: "#28634e", slate: "#63756b", border: "#d0dbd0", bg: "#f4f6f2", warn: "#946014", bad: "#a74450" }

export default function TracksBotKnowledge() {
  const [d, setD] = useState<any>(null)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  async function load() { try { const r = await fetch("/api/admin/whatsapp-bot/knowledge"); setD(await r.json()) } catch { setMsg("הטעינה נכשלה") } }
  useEffect(() => { load() }, [])
  async function refresh() {
    setBusy(true); setMsg("")
    try {
      const r = await fetch("/api/admin/whatsapp-bot/knowledge", { method: "POST" }); const j = await r.json()
      setMsg(r.ok ? "העדכון התחיל ברקע. כל מסמך לוקח כדקה – רעננו את המסך בעוד כמה דקות." : j.error || "העדכון נכשל")
    } finally { setBusy(false) }
  }
  const items: any[] = d?.items || []
  return <section style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginTop: 16 }}>
    <h2 style={{ margin: 0, fontSize: 16, color: C.navy }}>🧭 בוט המסלולים (נרשמים ומוזמנים לאירועים)</h2>
    <p style={{ margin: "6px 0 12px", fontSize: 13, color: C.slate, lineHeight: 1.6 }}>
      מי שנרשם או הוזמן אישית לאירוע קרוב יכול לכתוב לבוט: פרטי האירוע, ההרשמה שלו, ביטול, ושאלות על המסלולים. התשובות על המסלולים מגיעות מ-Claude, רק מתוך המסמכים של &quot;מאגר ידע&quot; במרכז הידע. שאלה שאין לה תשובה בחומר עוברת לרכז שהזמין.
    </p>
    {d && !d.configured && <p style={{ fontSize: 13, color: C.warn, background: "#faf1e3", borderRadius: 8, padding: "8px 10px" }}>חסר מפתח <b dir="ltr">ANTHROPIC_API_KEY</b> במשתני הסביבה של Netlify. עד שיוגדר, הבוט עונה על פרטי האירוע ומעביר שאלות על מסלולים לרכז.</p>}
    {d?.configured && <p style={{ fontSize: 12, color: C.slate }}>מודל: <span dir="ltr">{d.model}</span></p>}
    <div style={{ display: "grid", gap: 6, margin: "10px 0" }}>
      {items.map(it => <div key={it.title} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "8px 10px", borderRadius: 8, background: C.bg }}>
        <span>{it.title}</span>
        <span style={{ color: it.internal ? C.slate : it.current ? C.green : C.warn, whiteSpace: "nowrap", fontWeight: 600 }}>{it.internal ? "פנימי – לא נשלח לבוט" : it.current ? `✓ בבוט (${Math.round(it.chars / 1000)}K תווים)` : "טרם עודכן"}</span>
      </div>)}
      {d && !items.length && <p style={{ fontSize: 13, color: C.slate }}>לא נמצאו מסמכים בנושא &quot;מאגר ידע&quot; במרכז הידע.</p>}
    </div>
    <button disabled={busy || !d?.configured} onClick={refresh} style={{ border: 0, background: C.navy, color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy || !d?.configured ? .5 : 1 }}>{busy ? "מפעיל…" : "עדכון הידע מהמסמכים"}</button>
    {msg && <p style={{ fontSize: 13, color: C.slate, marginTop: 8 }}>{msg}</p>}
  </section>
}
