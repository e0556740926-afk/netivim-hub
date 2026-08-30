"use client"
import { useState, useEffect } from "react"
import Modal from "@/components/ui/Modal"

export default function PersonalLinkPopup() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState("")
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    if (!open) return
    fetch("/api/personal-slug").then(r => r.json()).then(d => {
      setAvailable(!!d.available)
      if (d.slug) setUrl(`${window.location.origin}/j/${d.slug}`)
    }).catch(() => setAvailable(false))
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
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold border border-white/15 bg-white/8 text-white/80 hover:bg-white/15 transition-colors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10.5 5.43"/>
          <path d="M14 11a5 5 0 00-7.07 0l-1.93 1.93a5 5 0 007.07 7.07L13.5 18.57"/>
        </svg>
        לינק אישי לפרסום
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="🔗 הלינק האישי שלך"
        width="380px"
        footer={available !== false ? <>
          <button onClick={copy}
            className={`flex-1 py-2 rounded-[9px] text-xs font-bold transition-colors ${copied ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#0D2744] text-white hover:bg-[#00488D]"}`}>
            {copied ? "✓ הועתק!" : "העתק לינק"}
          </button>
          <button onClick={whatsapp} disabled={!url}
            className="flex-1 py-2 rounded-[9px] text-xs font-bold bg-[#DCFCE7] text-[#166534] hover:bg-[#BBF7D0] disabled:opacity-50">
            שתף בוואטסאפ
          </button>
        </> : undefined}
      >
        {available === false ? (
          <div className="text-xs text-[#B45309] bg-[#FEF3C7] rounded-[9px] px-3 py-2.5">
            הפיצ'ר הזה ממתין לעדכון מסד נתונים שטרם הופעל. פנה למי שמריץ עדכונים במערכת.
          </div>
        ) : (
          <>
            <div className="text-xs text-[#64748B] mb-3">
              כל ליד שיגיע דרך הלינק הזה ישויך אליך ותקבל התראה
            </div>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[9px] px-3 py-2 text-[11px] font-mono text-[#475569] break-all select-all">
              {url || "טוען..."}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
