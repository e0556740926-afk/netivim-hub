"use client"
import { useEffect, useState } from "react"
import Image from "next/image"

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
function fd(d: string) {
  const dt = new Date(d)
  return `${dt.getDate()} ב${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
}

export default function ArchivePage() {
  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/newsletter/archive").then(r=>r.json()).then(d => { setIssues(d.issues||[]); setLoading(false) })
  }, [])

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "linear-gradient(160deg, #0D4A47 0%, #0D2744 60%, #1a1a2e 100%)" }}>
      <div className="max-w-lg mx-auto" dir="rtl">
        <div className="mb-8 flex justify-center"><Image src="/netivim-logo.png" alt="נתיבים" width={130} height={42} className="brightness-0 invert opacity-90" priority/></div>
        <div className="text-center mb-8">
          <div className="text-[#C9A84C] text-2xl md:text-3xl font-extrabold mb-2">ארכיון הניוזלטר</div>
          <div className="text-white/60 text-sm">כל הגיליונות שנשלחו עד היום</div>
        </div>

        {loading ? (
          <div className="text-white/50 text-sm text-center">טוען...</div>
        ) : issues.length === 0 ? (
          <div className="text-white/50 text-sm text-center bg-white/5 rounded-[14px] p-6">עדיין לא נשלח אף גיליון</div>
        ) : (
          <div className="space-y-2.5">
            {issues.map((i:any) => (
              <a key={i.id} href={`/newsletter/archive/${i.id}`}
                className="block bg-white/10 hover:bg-white/15 border border-white/10 rounded-[14px] p-4 transition-colors">
                <div className="text-white text-sm font-bold">{i.subject}</div>
                <div className="text-white/50 text-xs mt-1">{fd(i.sent_at)}</div>
              </a>
            ))}
          </div>
        )}

        <div className="text-center mt-8">
          <a href="/newsletter" className="text-white/40 text-xs hover:text-white/70">הרשמה לניוזלטר ←</a>
        </div>
      </div>
    </div>
  )
}
