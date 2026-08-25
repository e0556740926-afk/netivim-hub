"use client"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"

const TYPE_ICON: Record<string,string> = { contact:"👥", lead:"⭐", event:"📅", task:"✅" }
const TYPE_LABEL: Record<string,string> = { contact:"איש קשר", lead:"ליד", event:"אירוע", task:"משימה" }
const TYPE_PATH: Record<string,string> = { contact:"/admin/contacts", lead:"/admin/contacts", event:"/admin/events", task:"/admin/tasks" }

export default function GlobalSearch() {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const timer = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [ref])

  function handleChange(val: string) {
    setQ(val)
    clearTimeout(timer.current)
    if (val.length < 2) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`)
      const d = await res.json()
      setResults(d.results || [])
      setOpen(true)
      setLoading(false)
    }, 300)
  }

  function go(r: any) {
    router.push(TYPE_PATH[r.type] || "/admin/dashboard")
    setQ(""); setResults([]); setOpen(false)
  }

  return (
    <div ref={ref} className="relative px-3 py-2 border-b border-white/10">
      <div className="flex items-center gap-2 bg-white/10 rounded-[9px] px-3 py-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input value={q} onChange={e=>handleChange(e.target.value)}
          placeholder="חיפוש גלובלי..."
          className="bg-transparent text-white text-xs placeholder-white/40 outline-none flex-1 min-w-0"/>
        {loading && <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin flex-shrink-0"/>}
        {q && <button onClick={()=>{setQ("");setResults([]);setOpen(false)}} className="text-white/40 hover:text-white text-sm">✕</button>}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full right-0 left-0 mt-1 mx-3 bg-white rounded-[11px] shadow-xl border border-[#E2E8F0] overflow-hidden z-50 max-h-72 overflow-y-auto">
          {results.map((r,i) => (
            <div key={i} onClick={()=>go(r)}
              className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#F0F7FF] cursor-pointer border-b border-[#F1F5F9] last:border-0 transition-colors">
              <span className="text-base flex-shrink-0">{TYPE_ICON[r.type]||"📋"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#0D2744] truncate">{r.name}</div>
                {r.subtitle && <div className="text-xs text-[#64748B] truncate">{r.subtitle}</div>}
              </div>
              <span className="text-xs text-[#94A3B8] flex-shrink-0">{TYPE_LABEL[r.type]}</span>
            </div>
          ))}
        </div>
      )}
      {open && q.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full right-0 left-0 mt-1 mx-3 bg-white rounded-[11px] shadow-xl border border-[#E2E8F0] px-4 py-3 text-sm text-[#94A3B8] z-50">
          לא נמצאו תוצאות עבור "{q}"
        </div>
      )}
    </div>
  )
}
