"use client"
import { useState, useEffect, useRef } from "react"

interface CalendarPopupProps {
  token: string
  label?: string
}

export default function CalendarPopup({ token, label }: CalendarPopupProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState("")

  useEffect(() => { setOrigin(window.location.origin) }, [])
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const httpsUrl = token ? `${origin}/api/calendar.ics/${token}` : ""
  const webcalUrl = httpsUrl.replace("https://", "webcal://").replace("http://", "webcal://")
  const googleUrl = webcalUrl ? `https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(webcalUrl)}` : ""
  const outlookUrl = httpsUrl ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent("נתיבים שטח")}` : ""

  async function copy() {
    if (!httpsUrl) return
    await navigator.clipboard.writeText(httpsUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold border transition-colors ${
          open
            ? "bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]"
            : "bg-white border-[#E2E8F0] text-[#374151] hover:bg-[#F0F7FF] hover:border-[#BFDBFE]"
        }`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {label || "חבר ליומן"}
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 w-72 bg-white border border-[#E2E8F0] rounded-[14px] shadow-xl overflow-hidden"
          dir="rtl">
          {/* Header */}
          <div className="bg-[#0D2744] px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-white text-sm font-bold">📅 חיבור ליומן</div>
              <div className="text-[#60A5FA] text-[10px]">בחר את הפלטפורמה שלך</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white text-sm">✕</button>
          </div>

          <div className="p-3 space-y-2">
            {/* Google Calendar */}
            <a href={googleUrl} target="_blank" onClick={() => setTimeout(() => setOpen(false), 300)}
              className="flex items-center gap-3 w-full p-3 rounded-[10px] border border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <div className="flex-1 min-w-0 text-right">
                <div className="text-sm font-semibold text-[#0D2744]">Google Calendar</div>
                <div className="text-[10px] text-[#64748B]">לחץ לחיבור מיידי</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>

            {/* Outlook */}
            <a href={outlookUrl} target="_blank" onClick={() => setTimeout(() => setOpen(false), 300)}
              className="flex items-center gap-3 w-full p-3 rounded-[10px] border border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
              <div className="w-5 h-5 bg-[#0078D4] rounded-[4px] flex items-center justify-center flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                  <path d="M7 4a3 3 0 00-3 3v10a3 3 0 003 3h4a3 3 0 003-3V7a3 3 0 00-3-3H7zm0 2h4a1 1 0 011 1v10a1 1 0 01-1 1H7a1 1 0 01-1-1V7a1 1 0 011-1zm10 1v2h2V7h-2zm0 4v2h2v-2h-2zm0 4v2h2v-2h-2z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0 text-right">
                <div className="text-sm font-semibold text-[#0D2744]">Outlook</div>
                <div className="text-[10px] text-[#64748B]">Microsoft Calendar</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>

            {/* Apple / Other */}
            <div className="border border-[#E2E8F0] rounded-[10px] p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🍎</span>
                <div className="text-sm font-semibold text-[#0D2744]">Apple / יומן אחר</div>
              </div>
              <div className="text-[10px] text-[#64748B] mb-2">העתק את הלינק והוסף ידנית ב-"הוסף לפי כתובת"</div>
              <div className="flex gap-1.5">
                <div className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[7px] px-2 py-1.5 text-[9px] font-mono text-[#64748B] truncate">
                  {httpsUrl || "טוען..."}
                </div>
                <button onClick={copy}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-[7px] text-[10px] font-bold transition-colors ${
                    copied ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#0D2744] text-white hover:bg-[#00488D]"
                  }`}>
                  {copied ? "✓" : "העתק"}
                </button>
              </div>
            </div>
          </div>

          <div className="px-3 pb-3 text-center text-[9px] text-[#94A3B8]">
            הלינק אישי — אל תשתף עם אחרים
          </div>
        </div>
      )}
    </div>
  )
}
