"use client"
import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"

export default function CalendarPopup({ coordId, label }: { coordId?: number; label?: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState("")

  useEffect(() => {
    if (!user) return
    const param = coordId ? `coordinator_id=${coordId}` : `user_id=${user.id}`
    fetch(`/api/calendar-token?${param}`)
      .then(r => r.json())
      .then(d => {
        if (d.token) setUrl(`${window.location.origin}/api/calendar.ics/${d.token}`)
      })
      .catch(() => {})
  }, [user, coordId])

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold border border-[#E2E8F0] bg-white text-[#374151] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {label || "לינק יומן"}
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 w-80 bg-white border border-[#E2E8F0] rounded-[14px] shadow-xl p-4" dir="rtl">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-[#0D2744]">הלינק האישי שלך ליומן</div>
            <button onClick={() => setOpen(false)} className="text-[#94A3B8] hover:text-[#374151]">✕</button>
          </div>
          <div className="text-xs text-[#64748B] mb-3 leading-relaxed">
            העתק את הלינק ← פתח Google Calendar ← לחץ <strong>"+"</strong> ← <strong>"מ-URL"</strong> ← הדבק ← הוסף
          </div>
          {url
            ? <>
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[9px] px-3 py-2.5 text-[11px] font-mono text-[#475569] break-all mb-3 select-all cursor-text">
                  {url}
                </div>
                <button onClick={copy}
                  className={`w-full py-2.5 rounded-[9px] text-sm font-bold transition-colors ${copied ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#0D2744] text-white hover:bg-[#00488D]"}`}>
                  {copied ? "✓ הועתק!" : "העתק לינק"}
                </button>
              </>
            : <div className="text-center text-sm text-[#94A3B8] py-3">טוען לינק...</div>
          }
        </div>
      )}
    </div>
  )
}
