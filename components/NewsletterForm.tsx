"use client"
import { useState, useEffect } from "react"
import Image from "next/image"

export default function NewsletterForm({ slug }: { slug?: string }) {
  const [coordName, setCoordName] = useState("")
  const [form, setForm] = useState({ name: "", email: "", area: "" })
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetch(`/api/coord/slug?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => { if (d.coord) setCoordName(d.coord.name) })
  }, [slug])

  async function submit() {
    if (!form.name.trim() || !form.email.trim()) { setErr("שם ומייל הם שדות חובה"); return }
    setLoading(true); setErr("")
    const res = await fetch("/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), area: form.area.trim(), slug }),
    })
    setLoading(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || "שגיאה בשליחה"); return }
    setSent(true)
  }

  if (sent) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(160deg, #0D4A47 0%, #0D2744 60%, #1a1a2e 100%)" }}>
      <div className="text-center px-6 max-w-sm">
        <div className="w-20 h-20 rounded-full bg-[#C9A84C] flex items-center justify-center text-4xl mx-auto mb-6 shadow-lg">✓</div>
        <div className="text-3xl font-extrabold text-white mb-3">נרשמת בהצלחה!</div>
        <div className="text-white/70 text-sm leading-relaxed">עדכונים מנתיבים יגיעו למייל שלך מדי חודש</div>
        <a href="/newsletter/archive" className="inline-block mt-6 text-white/40 text-xs hover:text-white/70">לצפייה בגיליונות קודמים ←</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(160deg, #0D4A47 0%, #0D2744 60%, #1a1a2e 100%)" }}>
      <div className="mb-6">
        <Image src="/netivim-logo.png" alt="נתיבים" width={140} height={45} className="brightness-0 invert opacity-90" priority/>
      </div>

      <div className="text-center mb-8 max-w-lg" dir="rtl">
        <div className="text-white text-xl font-medium mb-1 opacity-90">הישארו מעודכנים</div>
        <div className="text-[#C9A84C] text-3xl md:text-4xl font-extrabold leading-tight mb-4">
          הצטרפו לניוזלטר נתיבים{coordName ? ` עם ${coordName.split(" ")[0]}` : ""}
        </div>
        <div className="text-white/60 text-sm">עדכון חודשי קצר — בלי ספאם, אפשר להסיר בכל רגע</div>
      </div>

      <div className="w-full max-w-md" dir="rtl">
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="שם מלא"
            className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all backdrop-blur-sm"
            style={{ fontSize: "16px" }}
          />
          <input
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            type="email"
            placeholder="כתובת מייל"
            className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all backdrop-blur-sm"
            style={{ fontSize: "16px" }}
          />
          <input
            value={form.area}
            onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
            placeholder="עיר / אזור מגורים (לא חובה)"
            className="w-full px-4 py-3.5 bg-white/10 border border-white/30 rounded-[12px] text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#C9A84C] focus:bg-white/15 transition-all backdrop-blur-sm"
            style={{ fontSize: "16px" }}
          />

          {err && <div className="text-[#f87171] text-xs text-center pt-1">{err}</div>}

          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-4 rounded-[14px] text-[#0D2744] font-extrabold text-base tracking-wide transition-all disabled:opacity-60 hover:brightness-110 active:scale-[0.98] shadow-lg"
            style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
            {loading ? "נרשם..." : "הרשמה לניוזלטר"}
          </button>

          <div className="text-center text-white/30 text-xs pt-2">
            נשלח כעדכון חודשי בלבד. ניתן להסיר בלחיצה אחת מכל מייל.
          </div>
        </div>
      </div>
    </div>
  )
}
