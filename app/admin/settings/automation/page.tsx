"use client"
import { uiRequest, uiMutation } from "@/lib/ui-request"
import WorkspaceHeader from "@/components/ui/WorkspaceHeader"
import { useEffect, useState } from "react"

const T = { navy: "#193d33", blue: "#28634e", slate: "#63756b", border: "#d0dbd0", bg: "#f4f6f2", ok: "#28634e" }

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${T.bg}` }}>
      <div style={{ flex: "1 1 200px" }}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{sub}</div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", flexWrap: "wrap", flex: "0 1 220px" }}>{children}</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.ok, textAlign: "center", flex: "0 0 70px" }}>✓ פעיל</span>
    </div>
  )
}
const inputStyle = { width: 50, border: `1px solid ${T.border}`, borderRadius: 6, padding: 6, fontSize: 13, textAlign: "center" as const }

export default function AutomationSettings() {
  const [s, setS] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    try{const d=await uiRequest("/api/admin/automation-settings");setS(d.settings||{})}catch(e){setError(e instanceof Error?e.message:"הטעינה נכשלה")}finally{setLoading(false)}
  }
  useEffect(() => { load() }, [])

  async function save(patch: Record<string, string>) {
    const next = { ...s, ...patch }
    setS(next)
    setSaved(false);setError("")
    try{await uiMutation("/api/admin/automation-settings","PATCH",patch);setSaved(true);setTimeout(()=>setSaved(false),1500)}catch(e){setError(e instanceof Error?e.message:"ההגדרה לא נשמרה")}
  }

  const [checkinA, checkinB] = (s.support_checkin_months || "4,8").split(",")

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  return (
    <div dir="rtl" className="ui-page ui-settings">
      <WorkspaceHeader title="אוטומציות וכללי טיפול" description="תזמונים, תזכורות וכללים קבועים — לפי תהליכי העבודה הקיימים במערכת." parent={{label:"הגדרות",href:"/admin/settings"}}/>
      {error&&<p role="alert" className="ui-error">{error} <button className="underline" onClick={load}>טעינה מחדש</button></p>}
      {saved&&<p className="ui-badge mb-4" role="status">✓ השינוי נשמר</p>}

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <Row title='חלון הפולו-אפ ל"לא רלוונטי"' sub="תיק שסווג לא רלוונטי יוחזר אוטומטית לבדיקה אחרי">
          <input type="number" value={s.followup_window_months} onChange={e => save({ followup_window_months: e.target.value })} style={inputStyle} />
          <span style={{ fontSize: 13, color: T.slate }}>חודשים</span>
        </Row>
        <Row title="מועדי שיחות ליווי" sub="שיחת ליווי תיפתח אוטומטית לאחר השיבוץ">
          <input type="number" value={checkinA} onChange={e => save({ support_checkin_months: `${e.target.value},${checkinB}` })} style={{ ...inputStyle, width: 44 }} />
          <span style={{ fontSize: 13, color: T.slate }}>/</span>
          <input type="number" value={checkinB} onChange={e => save({ support_checkin_months: `${checkinA},${e.target.value}` })} style={{ ...inputStyle, width: 44 }} />
          <span style={{ fontSize: 13, color: T.slate }}>חודשים</span>
        </Row>
        <Row title="סף התראת SLA" sub="פנייה שלא נענתה תוך זמן זה תסומן באדום">
          <input type="number" value={s.sla_hours} onChange={e => save({ sla_hours: e.target.value })} style={inputStyle} />
          <span style={{ fontSize: 13, color: T.slate }}>שעות</span>
        </Row>
        <Row title='ניסיונות יצירת קשר לפני "לא פעיל"' sub="מספר הניסיונות שיתבצעו לפני סגירה אוטומטית">
          <input type="number" value={s.no_answer_attempts} onChange={e => save({ no_answer_attempts: e.target.value })} style={inputStyle} />
          <span style={{ fontSize: 13, color: T.slate }}>ניסיונות</span>
        </Row>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", padding: "16px 20px" }}>
          <div style={{ flex: "1 1 200px" }}><div style={{ fontSize: 14, fontWeight: 700 }}>תדירות אישורי התמדה למוסדות</div><div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>מוסד יתבקש לאשר אילו בחורים עדיין אצלו</div></div>
          <select value={s.retention_frequency} onChange={e => save({ retention_frequency: e.target.value })} style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", fontSize: 13, flex: "0 1 220px" }}>
            <option>חודשי</option><option>רבעוני</option><option>חצי שנתי</option>
          </select>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.ok, textAlign: "center", flex: "0 0 70px" }}>✓ פעיל</span>
        </div>
      </div>
    </div>
  )
}
