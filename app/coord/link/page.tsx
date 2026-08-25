"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd } from "@/lib/utils"

export default function CoordLink() {
  const { user } = useAuth()
  const [coord, setCoord] = useState<any>(null)
  const [linkLeads, setLinkLeads] = useState<any[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!user) return
    fetch(`/api/coord?user_id=${user.id}`).then(r=>r.json()).then(async ({ coord }) => {
      if (!coord) return
      setCoord(coord)
      const res = await fetch(`/api/leads?coordinator_id=${coord.id}`)
      const { leads } = await res.json()
      setLinkLeads((leads||[]).filter((l:any)=>l.source==="link"))
    })
  }, [user])

  const url = coord ? `${typeof window!=="undefined"?window.location.origin:""}/j/${coord.slug}` : ""

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(()=>setCopied(false), 2000)
  }

  function whatsapp() {
    const msg = encodeURIComponent(`היי! אני ${user?.name} מנתיבים. השאר פרטים ואחזור אליך: ${url}`)
    window.open(`https://wa.me/?text=${msg}`, "_blank")
  }

  return <div className="p-4 fade-up">
    <div className="text-xl font-extrabold mb-3">הלינק האישי שלי</div>

    <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-4 mb-3">
      <div className="text-xs text-[#64748B] mb-1.5">הכתובת שלך</div>
      <div className="text-xs font-mono bg-[#F0F4F8] rounded-[9px] p-2.5 mb-3 break-all text-[#0D2744] direction-ltr text-left">{url||"טוען..."}</div>
      <div className="flex gap-2">
        <button onClick={copy} className="flex-1 text-center py-2.5 rounded-[10px] border border-[#E2E8F0] text-sm font-semibold hover:bg-[#F8FAFC] transition-colors">
          {copied ? "✓ הועתק!" : "העתק"}
        </button>
        <button onClick={whatsapp} className="flex-1 text-center py-2.5 rounded-[10px] bg-[#166534] text-white text-sm font-bold hover:bg-[#15803d] transition-colors">שתף בוואטסאפ</button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 mb-3">
      <div className="bg-[#0D2744] text-white rounded-[14px] p-4 text-center">
        <div className="text-3xl font-extrabold">{linkLeads.length}</div>
        <div className="text-xs opacity-75 mt-0.5">מילאו את הטופס</div>
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4 text-center">
        <div className="text-3xl font-extrabold text-[#00488D]">{linkLeads.filter(l=>l.status!=="irrelevant").length}</div>
        <div className="text-xs text-[#64748B] mt-0.5">פוטנציאל ממשי</div>
      </div>
    </div>

    <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-4">
      <div className="text-sm font-bold mb-3">הגיעו מהלינק ({linkLeads.length})</div>
      {linkLeads.length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">עדיין אף אחד לא מילא את הטופס</div>}
      <div className="space-y-2">
        {linkLeads.map(l=><div key={l.id} className="flex items-center gap-3 pb-2.5 border-b border-[#F1F5F9] last:border-0">
          <div className="flex-1">
            <div className="text-sm font-semibold">{l.name}</div>
            <div className="text-xs text-[#64748B]">{fd(l.created_at?.slice(0,10))} · {l.phone}</div>
          </div>
          <a href={`https://wa.me/972${l.phone?.replace(/^0/,"")}`} target="_blank" className="px-3 py-1.5 bg-[#DCFCE7] text-[#166534] text-xs font-bold rounded-[8px] hover:bg-[#BBF7D0]">צור קשר</a>
        </div>)}
      </div>
    </div>
  </div>
}