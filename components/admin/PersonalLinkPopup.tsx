"use client"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"

export default function PersonalLinkPopup() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState("")
  const [available, setAvailable] = useState<boolean | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (!open) return
    fetch("/api/personal-slug").then(r => r.json()).then(d => {
      setAvailable(!!d.available)
      if (d.slug) setUrl(`${window.location.origin}/j/${d.slug}`)
    }).catch(() => setAvailable(false))
  }, [open])

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
    setOpen(v => !v)
  }

  // Position is computed once on open; close on scroll so it never
  // drifts away from the button instead of chasing it.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function whatsapp() {
    const msg = encodeURIComponent(`היי! השאר פרטים ואחזור אליך:\n${url}`)
    window.open(`https://wa.me/?text=${msg}`, "_blank")
  }

  return (
    <>
      <button ref={btnRef} onClick={toggle}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold border border-white/15 bg-white/8 text-white/80 hover:bg-white/15 transition-colors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10.5 5.43"/>
          <path d="M14 11a5 5 0 00-7.07 0l-1.93 1.93a5 5 0 007.07 7.07L13.5 18.57"/>
        </svg>
        לינק אישי לפרסום
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)}/>
          <div
            style={{ position: "fixed", top: pos.top, right: pos.right, width: 288 }}
            className="z-[100] bg-white border border-[#E2E8F0] rounded-[14px] shadow-xl p-4"
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-[#0D2744]">הלינק האישי שלך</div>
              <button onClick={() => setOpen(false)} className="text-[#94A3B8] hover:text-[#374151]">✕</button>
            </div>

            {available === false ? (
              <div className="text-xs text-[#B45309] bg-[#FEF3C7] rounded-[9px] px-3 py-2.5">
                הפיצ'ר הזה ממתין לעדכון מסד נתונים שטרם הופעל. פנה למי שמריץ עדכונים במערכת.
              </div>
            ) : (
              <>
                <div className="text-xs text-[#64748B] mb-3">
                  כל ליד שיגיע דרך הלינק הזה ישויך אליך ותקבל התראה
                </div>
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[9px] px-3 py-2 text-[11px] font-mono text-[#475569] break-all mb-3 select-all">
                  {url || "טוען..."}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={copy}
                    className={`py-2 rounded-[9px] text-xs font-bold transition-colors ${copied ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#0D2744] text-white hover:bg-[#00488D]"}`}>
                    {copied ? "✓ הועתק!" : "העתק לינק"}
                  </button>
                  <button onClick={whatsapp} disabled={!url}
                    className="py-2 rounded-[9px] text-xs font-bold bg-[#DCFCE7] text-[#166534] hover:bg-[#BBF7D0] disabled:opacity-50">
                    שתף בוואטסאפ
                  </button>
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}
