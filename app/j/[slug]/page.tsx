"use client"
import { useEffect, useState } from "react"
import Image from "next/image"

export default function PublicForm({ params }: { params: { slug: string } }) {
  const [coordName, setCoordName] = useState("")
  const [coordId, setCoordId] = useState<number | null>(null)
  const [form, setForm] = useState({
    firstName: "", lastName: "", age: "", phone: "", email: "", notes: "", consent: false
  })
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/coord/slug?slug=${params.slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.coord) { setCoordName(d.coord.name); setCoordId(d.coord.id) }
      })
  }, [params.slug])

  async function submit() {
    if (!form.firstName || !form.phone) { setErr("שם פרטי וטלפון הם שדות חובה"); return }
    if (!form.consent) { setErr("יש לאשר קבלת עדכונים להמשך"); return }
    if (!coordId) { setErr("קישור לא תקין — פנה לרכז ישירות"); return }
    setLoading(true); setErr("")
    const fullName = `${form.firstName} ${form.lastName}`.trim()
    const notes = form.notes || ""
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinator_id: coordId,
        name: fullName,
        phone: form.phone,
        email: form.email,
        age: form.age ? +form.age : null,
        source: "link",
        interest: "training",
        notes,
      }),
    })
    setLoading(false)
    const d = await res.json()
    if (d.error === "כפילות") {
      setSent(true) // treat duplicate as success to avoid info leak
      return
    }
    setSent(true)
  }

  // Success screen
  if (sent) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(160deg, #0D4A47 0%, #0D2744 60%, #1a1a2e 100%)" }}>
      <div className="text-center px-6 max-w-sm">
        <div className="w-20 h-20 rounded-full bg-[#C9A84C] flex items-center justify-center text-4xl mx-auto mb-6 shadow-lg">✓</div>
        <div className="text-3xl font-extrabold text-white mb-3">תודה!</div>
        <div className="text-[#C9A84C] text-lg font-medium mb-2">הפרטים התקבלו בהצלחה</div>
        <div className="text-white/70 text-sm leading-relaxed">נציג נתיבים יצור איתך קשר בהקדם כדי למצוא את המסלול המתאים</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(160deg, #0D4A47 0%, #0D2744 60%, #1a1a2e 100%)" }}>

      {/* Logo */}
      <div className="mb-6">
        <Image src="/netivim-logo.png" alt="נתיבים" width={140} height={45} className="brightness-0 invert opacity-90" priority/>
      </div>

      {/* Header */}
      <div className="text-center mb-8 max-w-lg" dir="rtl">
        <div className="text-white text-xl font-medium mb-1 opacity-90">רוצים לגלות</div>
        <div className="text-[#C9A84C] text-3xl md:text-4xl font-extrabold leading-tight mb-4">
          את המסלול המדויק{coordName ? ` עם ${coordName.split(" ")[0]}` : ""}?
        </div>
        <div className="flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/30 flex items-center justify-center text-white/60 animate-bounce">↓</div>
        </div>
      </div>

      {/* Form */}
      <div className="w-full max-w-md" dir="rtl">
        <div className="space-y-3">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <input
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                placeholder="שם פרטי"
                className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all backdrop-blur-sm"
                style={{ fontSize: "16px" }}
              />
              {!form.firstName && err && <div className="absolute -bottom-5 right-0 text-[#f87171] text-[10px]">שדה חובה</div>}
            </div>
            <input
              value={form.lastName}
              onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              placeholder="שם משפחה"
              className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all backdrop-blur-sm"
              style={{ fontSize: "16px" }}
            />
          </div>

          <input
            value={form.age}
            onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
            type="number"
            placeholder="גיל הבחור"
            className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all backdrop-blur-sm"
            style={{ fontSize: "16px" }}
          />

          <div className="relative">
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              type="tel"
              placeholder="טלפון"
              className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all backdrop-blur-sm"
              style={{ fontSize: "16px" }}
            />
            {!form.phone && err && <div className="absolute -bottom-5 right-0 text-[#f87171] text-[10px]">שדה חובה</div>}
          </div>

          <input
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            type="email"
            placeholder="אימייל"
            className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all backdrop-blur-sm"
            style={{ fontSize: "16px" }}
          />

          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="פרטים נוספים שתרצו להוסיף"
            rows={3}
            className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all resize-none backdrop-blur-sm"
            style={{ fontSize: "16px" }}
          />

          {/* Consent */}
          <label className="flex items-center gap-3 cursor-pointer group py-1">
            <div
              onClick={() => setForm(f => ({ ...f, consent: !f.consent }))}
              className={`w-5 h-5 rounded-[5px] border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.consent ? "bg-[#C9A84C] border-[#C9A84C]" : "border-white/40 bg-transparent"}`}>
              {form.consent && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <span className="text-white/70 text-sm">אני מאשר/ת קבלת עדכונים ומידע מנתיבים</span>
          </label>

          {/* Error */}
          {err && <div className="text-[#f87171] text-xs text-center pt-1">{err}</div>}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-4 rounded-[14px] text-[#0D2744] font-extrabold text-base tracking-wide transition-all disabled:opacity-60 hover:brightness-110 active:scale-[0.98] shadow-lg"
            style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
            {loading ? "שולח..." : "שליחה"}
          </button>

          <div className="text-center text-white/30 text-xs pt-2">
            הפרטים שלך מאובטחים ומשמשים לצורך יצירת קשר בלבד
          </div>
        </div>
      </div>
    </div>
  )
}