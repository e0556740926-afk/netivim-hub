"use client"
import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { api, SetupNotice } from "@/components/messaging/ui"

const CHANNELS = [
  { key: "email", title: "מייל / ניוזלטר", text: "מייל ממותג בעורך בלוקים או HTML מוכן, עם תצוגה מקדימה, בדיקה, תזמון ומעקב." },
  { key: "sms", title: "SMS", text: "הודעה קצרה עם מונה מקטעים, קישור ודרך הסרה." },
  { key: "whatsapp", title: "WhatsApp", text: "פנייה יזומה דרך תבנית מאושרת בלבד, עם משתנים." },
]

function NewCampaign() {
  const router = useRouter()
  const params = useSearchParams()
  const { error: toastError } = useToast()
  const [conn, setConn] = useState<any>(null)
  const [err, setErr] = useState<any>(null)
  const [channel, setChannel] = useState("email")
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { api("/api/messaging/connections").then(d => setConn(d.connections)).catch(setErr) }, [])
  async function create() {
    setBusy(true)
    try {
      const d = await api("/api/messaging/campaigns", "POST", { channel, name, goal, duplicate_of: params.get("duplicate") ? Number(params.get("duplicate")) : undefined })
      router.replace(`/admin/messaging/campaigns/${d.id}`)
    } catch (e: any) { toastError(e.message); setBusy(false) }
  }
  return (
    <div className="mc-ws" style={{ maxWidth: 980 }}>
      <div className="mc-crumb"><Link href="/admin/messaging?tab=campaigns">מרכז דיוורים / קמפיינים</Link></div>
      <div className="mc-head"><div><h1>קמפיין חדש</h1><p>קמפיין אחד = ערוץ אחד. אפשר לשכפל אחר כך לערוץ אחר — התוכן לא מומר אוטומטית.</p></div></div>
      {err && <SetupNotice error={err} />}
      <div className="mc-grid k3" role="radiogroup" aria-label="ערוץ">
        {CHANNELS.map(c => {
          const st = conn?.[c.key]
          return <button key={c.key} type="button" role="radio" aria-checked={channel === c.key} className="mc-card" onClick={() => setChannel(c.key)}
            style={{ textAlign: "start", cursor: "pointer", outline: channel === c.key ? "2px solid var(--sh-green)" : undefined, font: "inherit", color: "inherit" }}>
            <h3>{c.title}</h3>
            <p className="mc-sub" style={{ margin: "0 0 10px" }}>{c.text}</p>
            {st && <span className={`mc-pill ${st.connected ? "green" : "amber"}`}><span className="mc-dot" />{st.connected ? "מחובר" : "טרם חובר — טיוטה בלבד"}</span>}
          </button>
        })}
      </div>
      <div className="mc-card" style={{ marginTop: 14 }}>
        <div className="mc-form">
          <label className="mc-field">שם פנימי<input value={name} onChange={e => setName(e.target.value)} placeholder="למשל: עדכון חודש חשוון — הורים" /><small>לא מוצג לנמענים.</small></label>
          <label className="mc-field">מטרה ופעולה מרכזית<input value={goal} onChange={e => setGoal(e.target.value)} placeholder="למשל: הרשמה למפגש ההורים" /><small>פעולה אחת ברורה — ולפיה נמדדת ההצלחה.</small></label>
        </div>
        <div className="mc-stepfoot"><Link className="lw-btn" href="/admin/messaging">ביטול</Link><button type="button" className="lw-btn lw-btn-primary" disabled={busy} onClick={create}>{busy ? "יוצר…" : "יצירת טיוטה"}</button></div>
      </div>
    </div>
  )
}
export default function Page() { return <Suspense fallback={null}><NewCampaign /></Suspense> }
