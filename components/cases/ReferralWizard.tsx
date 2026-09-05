"use client"
import { useEffect, useState } from "react"

const T = {
  navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8",
  slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC",
  ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B", breachBg: "#FDECEA",
}

export default function ReferralWizard({ caseData, onClose, onSent }: { caseData: any; onClose: () => void; onSent: () => void }) {
  const [step, setStep] = useState(1)
  const [suggested, setSuggested] = useState<any[]>([])
  const [allOrgs, setAllOrgs] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<any>(null)
  const [summary, setSummary] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch(`/api/referrals/suggestions?case_id=${caseData.id}`)
      .then(r => r.json())
      .then(d => { setSuggested(d.suggested || []); setAllOrgs(d.all_organizations || []) })
  }, [caseData.id])

  useEffect(() => {
    if (picked && !summary) {
      setSummary(`${caseData.name}, ${caseData.age || ""} — מעוניין ב${caseData.interest || "מסגרת חדשה"}. ${caseData.city ? `מתגורר ב${caseData.city}.` : ""}`)
    }
  }, [picked])

  async function send() {
    setSending(true)
    try {
      const r = await fetch("/api/referrals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseData.id, organization_id: picked.organization_id, program_id: picked.program_id, summary_text: summary }),
      })
      if (!r.ok) { const { error } = await r.json(); alert(error); setSending(false); return }
      onSent()
    } finally { setSending(false) }
  }

  const filteredOrgs = allOrgs.filter(o => !search || o.name.includes(search) || (o.category || "").includes(search) || (o.region || "").includes(search))
  const steps = [
    { n: 1, label: "בחירת מוסד ומסלול" },
    { n: 2, label: "תצוגה מקדימה" },
    { n: 3, label: "אישור ושליחה" },
  ]

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#14213D66", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 900, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 16px 40px rgba(20,33,61,.2)" }}>
        <div style={{ padding: "24px 32px 0" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>יצירת הפניה — {caseData.name}{caseData.age ? `, ${caseData.age}` : ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            {steps.map((s, i) => (
              <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 10, flex: i < steps.length - 1 ? 1 : undefined }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: step >= s.n ? T.blue : T.bg, color: step >= s.n ? "#fff" : T.slate, border: `1.5px solid ${step >= s.n ? T.blue : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
                <span style={{ fontSize: 13, color: step === s.n ? T.navy : T.slate, fontWeight: step === s.n ? 700 : 600, whiteSpace: "nowrap" }}>{s.label}</span>
                {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: T.border }} />}
              </div>
            ))}
          </div>
        </div>

        {step === 1 && (
          <div style={{ padding: "0 32px 28px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 4 }}>מוצע לפי פרופיל הנועץ — מנוע ההתאמה</div>
            <div style={{ fontSize: 12, color: T.slate, marginBottom: 14 }}>ההצעה בלבד — הבחירה הסופית של היועץ.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {suggested.map((s, i) => {
                const sel = picked?.organization_id === s.organization_id && picked?.program_id === s.program_id
                return (
                  <div key={i} onClick={() => setPicked(s)} style={{ border: `1px solid ${sel ? T.blue : T.border}`, background: sel ? T.blueBg : "#fff", borderRadius: 12, padding: "14px 16px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        {sel && <div style={{ width: 20, height: 20, borderRadius: "50%", background: T.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, marginTop: 2, flexShrink: 0 }}>✓</div>}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{s.organization_name}{s.program_name ? ` — ${s.program_name}` : ""}</div>
                          <div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>{s.reason}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "left", flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: s.match_pct >= 80 ? T.ok : s.match_pct >= 60 ? T.warn : T.slate }}>{s.match_pct}%</div>
                        <div style={{ fontSize: 11, color: T.slate }}>התאמה</div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!suggested.length && <div style={{ fontSize: 13, color: T.slate, textAlign: "center", padding: "12px 0" }}>אין עדיין הצעות — הזן מסלולים למוסדות כדי לקבל התאמות</div>}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 10 }}>חיפוש חופשי — כל שאר המוסדות</div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חפש מוסד לפי שם, סוג או אזור..."
              style={{ width: "100%", boxSizing: "border-box", background: T.bg, border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 14, marginBottom: 12 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
              {search && filteredOrgs.map(o => {
                const sel = picked?.organization_id === o.id && !picked?.program_id
                return (
                  <div key={o.id} onClick={() => setPicked({ organization_id: o.id, organization_name: o.name, program_id: null, program_name: null, match_pct: null })}
                    style={{ border: `1px solid ${sel ? T.blue : T.border}`, background: sel ? T.blueBg : "#fff", borderRadius: 12, padding: "14px 16px", cursor: "pointer" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{o.name}</div>
                    <div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>{o.region || "אזור לא ידוע"}{o.category ? ` · ${o.category}` : ""}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ padding: "0 32px 28px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.breach, marginBottom: 16 }}>כך בדיוק המוסד יראה את ההפניה — יש לוודא תצוגה מקדימה מדויקת לפני שליחה.</div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16, fontSize: 14 }}>
                <div><div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>שם</div><div style={{ fontWeight: 600 }}>{caseData.name}</div></div>
                <div><div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>גיל</div><div style={{ fontWeight: 600 }}>{caseData.age || "—"}</div></div>
                <div><div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>תחום עניין</div><div style={{ fontWeight: 600 }}>{caseData.interest || "—"}</div></div>
              </div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>פסקת סיכום ליועץ הקולט</label>
              <textarea rows={4} value={summary} onChange={e => setSummary(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", border: `1px solid ${T.border}`, borderRadius: 8, resize: "none" }} />
            </div>
            <div style={{ background: T.breachBg, border: "1px solid #C0392B33", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: T.breach }}>
              לא יישלח למוסד: פרטי קשר של המשפחה, מידע מוגן (רפואי / רקע משפחתי מלא), היסטוריית התיק המלאה ויומן האינטראקציות.
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ padding: "0 32px 28px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>סיכום ההפניה</div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 10, fontSize: 14, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.slate }}>נועץ</span><span style={{ fontWeight: 600 }}>{caseData.name}{caseData.age ? `, ${caseData.age}` : ""}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.slate }}>מוסד ומסלול</span><span style={{ fontWeight: 600 }}>{picked?.organization_name}{picked?.program_name ? ` — ${picked.program_name}` : ""}</span></div>
              {picked?.match_pct != null && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.slate }}>אחוז התאמה</span><span style={{ fontWeight: 600, color: T.ok }}>{picked.match_pct}%</span></div>}
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 32px", borderTop: `1px solid ${T.border}` }}>
          <button onClick={onClose} style={{ background: "transparent", color: T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>ביטול</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && <button onClick={() => setStep(step - 1)} style={{ background: T.bg, color: T.slate, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>חזרה</button>}
            {step === 1 && <button disabled={!picked} onClick={() => setStep(2)} style={{ background: picked ? T.blue : T.border, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: picked ? "pointer" : "not-allowed" }}>הבא — תצוגה מקדימה</button>}
            {step === 2 && <button onClick={() => setStep(3)} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>הבא — סיכום</button>}
            {step === 3 && <button disabled={sending} onClick={send} style={{ background: T.ok, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{sending ? "שולח..." : "שלח הפניה"}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
