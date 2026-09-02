"use client"
import { use, useEffect, useState } from "react"

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
function fd(d: string) {
  const dt = new Date(d)
  return `${dt.getDate()} ב${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
}

export default function ArchiveIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [issue, setIssue] = useState<any>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    fetch(`/api/newsletter/archive/${id}`).then(async r => {
      if (!r.ok) { setErr(true); return }
      const d = await r.json()
      setIssue(d.issue)
    })
  }, [id])

  if (err) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]" dir="rtl">
      <div className="text-[#64748B] text-sm">הגיליון לא נמצא</div>
    </div>
  )
  if (!issue) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]" dir="rtl">
      <div className="text-[#64748B] text-sm">טוען...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F0F4F8]" dir="rtl">
      <div className="sticky top-0 bg-[#0D2744] px-4 py-3 flex items-center justify-between shadow-md z-10">
        <a href="/newsletter/archive" className="text-white/70 text-sm hover:text-white">← לכל הגיליונות</a>
        <div className="text-white/50 text-xs">{fd(issue.sent_at)}</div>
      </div>
      <iframe
        title={issue.subject}
        srcDoc={issue.html}
        style={{ width: "100%", height: "calc(100vh - 52px)", border: "none" }}
      />
    </div>
  )
}
