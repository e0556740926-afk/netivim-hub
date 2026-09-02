"use client"
import { useState } from "react"
import Image from "next/image"

export default function PreferencesPage() {
  const [email, setEmail] = useState("")
  const [sub, setSub] = useState<any>(null)
  const [area, setArea] = useState("")
  const [frequency, setFrequency] = useState("monthly")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [saved, setSaved] = useState(false)
  const [unsubscribed, setUnsubscribed] = useState(false)

  async function lookup() {
    if (!email.trim()) { setErr("נא להזין כתובת מייל"); return }
    setLoading(true); setErr(""); setSaved(false)
    const res = await fetch(`/api/newsletter/preferences?email=${encodeURIComponent(email.trim())}`)
    setLoading(false)
    if (!res.ok) { const d = await res.json().catch(()=>({})); setErr(d.error || "שגיאה"); setSub(null); return }
    const d = await res.json()
    setSub(d.subscriber)
    setArea(d.subscriber.area || "")
    setFrequency(d.subscriber.frequency || "monthly")
  }

  async function save() {
    setSaving(true); setErr(""); setSaved(false)
    const res = await fetch("/api/newsletter/preferences", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), area: area.trim(), frequency }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(()=>({})); setErr(d.error || "שגיאה"); return }
    setSaved(true)
  }

  async function unsubscribe() {
    if (!confirm("להסיר אותך לגמרי מרשימת התפוצה?")) return
    setSaving(true); setErr("")
    const res = await fetch("/api/newsletter/preferences", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), unsubscribe: true }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(()=>({})); setErr(d.error || "שגיאה"); return }
    setUnsubscribed(true)
  }

  const bg = { background: "linear-gradient(160deg, #0D4A47 0%, #0D2744 60%, #1a1a2e 100%)" }

  if (unsubscribed) return (
    <div className="min-h-screen flex items-center justify-center" style={bg}>
      <div className="text-center px-6 max-w-sm" dir="rtl">
        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-4xl mx-auto mb-6">👋</div>
        <div className="text-2xl font-extrabold text-white mb-3">הוסרת מהרשימה</div>
        <div className="text-white/70 text-sm leading-relaxed">לא תקבל/י יותר עדכונים מהניוזלטר. אפשר להירשם שוב בכל עת.</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10" style={bg}>
      <div className="mb-6"><Image src="/netivim-logo.png" alt="נתיבים" width={130} height={42} className="brightness-0 invert opacity-90" priority/></div>
      <div className="text-center mb-6 max-w-lg" dir="rtl">
        <div className="text-[#C9A84C] text-2xl md:text-3xl font-extrabold mb-2">ניהול העדפות ניוזלטר</div>
        <div className="text-white/60 text-sm">עדכן/י את פרטי ההרשמה שלך, או הסר/י את עצמך מהרשימה</div>
      </div>

      <div className="w-full max-w-md space-y-3" dir="rtl">
        {!sub ? (
          <>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="כתובת המייל שנרשמת איתה"
              className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] backdrop-blur-sm" style={{fontSize:16}}/>
            {err && <div className="text-[#f87171] text-xs text-center">{err}</div>}
            <button onClick={lookup} disabled={loading}
              className="w-full py-4 rounded-[14px] text-[#0D2744] font-extrabold text-base disabled:opacity-60"
              style={{ background:"linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
              {loading ? "מחפש..." : "המשך"}
            </button>
          </>
        ) : (
          <div className="bg-white/10 rounded-[16px] p-5 backdrop-blur-sm space-y-3">
            <div className="text-white text-sm font-bold">{sub.name} · {sub.email}</div>
            <div>
              <label className="text-white/60 text-xs block mb-1">עיר / אזור</label>
              <input value={area} onChange={e=>setArea(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/10 border border-white/30 rounded-[10px] text-white text-sm focus:outline-none focus:border-[#C9A84C]"/>
            </div>
            <div>
              <label className="text-white/60 text-xs block mb-1">תדירות</label>
              <select value={frequency} onChange={e=>setFrequency(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0D2744] border border-white/30 rounded-[10px] text-white text-sm focus:outline-none focus:border-[#C9A84C]">
                <option value="monthly">חודשי (ברירת מחדל)</option>
                <option value="quarterly">רבעוני בלבד</option>
              </select>
            </div>
            {err && <div className="text-[#f87171] text-xs text-center">{err}</div>}
            {saved && <div className="text-[#86efac] text-xs text-center">✓ נשמר בהצלחה</div>}
            <button onClick={save} disabled={saving}
              className="w-full py-3 rounded-[12px] text-[#0D2744] font-extrabold text-sm disabled:opacity-60"
              style={{ background:"linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
              {saving ? "שומר..." : "שמור שינויים"}
            </button>
            <button onClick={unsubscribe} disabled={saving}
              className="w-full py-3 rounded-[12px] border border-[#f87171]/50 text-[#f87171] font-semibold text-sm">
              הסר אותי מהרשימה
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
