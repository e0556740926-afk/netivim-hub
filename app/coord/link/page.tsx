"use client"
import WorkspaceHeader from "@/components/ui/WorkspaceHeader"
import { useToast } from "@/components/ui/Toast"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd } from "@/lib/utils"

export default function CoordLink() {
  const toast=useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const [coord, setCoord] = useState<any>(null)
  const [linkLeads, setLinkLeads] = useState<any[]>([])
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
    if (!user) return
    fetch(`/api/coord?user_id=${user.id}`).then(r=>r.json()).then(async ({ coord }) => {
      if (!coord) return
      setCoord(coord)
      const res = await fetch(`/api/leads?coordinator_id=${coord.id}`)
      const { leads } = await res.json()
      setLinkLeads((leads||[]).filter((l:any)=>l.source==="link"))
    }).catch(()=>setError(true)).finally(()=>setLoading(false))
  }, [user])

  const shareUrl = coord ? `${origin}/j/${coord.slug}` : ""
  const systemUrl = origin

  async function copy(url: string) {
    if(!url)return
    try{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{toast.error("לא ניתן להעתיק כרגע. נסו שוב.")}
  }

  function whatsapp() {
    const msg = encodeURIComponent(`היי! אני ${user?.name} מנתיבים.\nמעניין אותך לשמוע עוד? השאר פרטים ואחזור אליך:\n${shareUrl}`)
    window.open(`https://wa.me/?text=${msg}`, "_blank")
  }

  if (error) return <div className="p-6"><ErrorState retry={()=>window.location.reload()}/></div>

  if(loading)return <div className="ui-page ui-personal"><SkeletonCard rows={5}/></div>
  return <div className="ui-page ui-personal space-y-4">
    <WorkspaceHeader title="הלינק האישי שלי" description="קישור אחד לשיתוף. הפניות שמגיעות דרכו נשמרות עם השיוך שלכם."/>

    {/* PUBLIC LEAD FORM - main */}
    <div className="bg-[#193d33] rounded-[18px] p-4">
      <div className="text-white text-sm font-bold mb-1">📋 לינק לנערים</div>
      <div className="text-[#60A5FA] text-xs mb-3">שלח את זה לנערים שמעניין אותם להצטרף</div>
      <div className="text-xs font-mono bg-white/10 rounded-[10px] p-2.5 mb-3 text-white/90 break-all">{shareUrl||"טוען..."}</div>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!shareUrl} onClick={()=>copy(shareUrl)} className="py-2.5 bg-white/20 hover:bg-white/30 text-white text-sm font-bold rounded-[10px] transition-colors">
          {copied ? "✓ הועתק!" : "העתק לינק"}
        </button>
        <button disabled={!shareUrl} onClick={whatsapp} className="py-2.5 bg-[#28634e] text-white text-sm font-bold rounded-[10px] hover:bg-[#15803d] transition-colors">שתף בוואטסאפ</button>
      </div>
    </div>

    {/* Stats */}
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white border border-[#e1e8df] rounded-[14px] p-4 text-center">
        <div className="text-3xl font-extrabold text-[#193d33]">{linkLeads.length}</div>
        <div className="text-xs text-[#63756b] mt-0.5">מילאו את הטופס</div>
      </div>
      <div className="bg-white border border-[#e1e8df] rounded-[14px] p-4 text-center">
        <div className="text-3xl font-extrabold text-[#28634e]">{linkLeads.filter(l=>l.status!=="irrelevant").length}</div>
        <div className="text-xs text-[#63756b] mt-0.5">פוטנציאל ממשי</div>
      </div>
    </div>

    {/* Leads list */}
    <div className="bg-white border border-[#e1e8df] rounded-[16px] p-4">
      <div className="text-sm font-bold mb-3">הגיעו מהלינק שלי ({linkLeads.length})</div>
      {linkLeads.length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">עדיין אף אחד לא מילא</div>}
      <div className="space-y-2">
        {linkLeads.map(l=><div key={l.id} className="flex items-center gap-3 pb-2.5 border-b border-[#edf1e9] last:border-0">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{l.name}</div>
            <div className="text-xs text-[#63756b]">{fd(l.created_at?.slice(0,10))} · {l.phone}</div>
          </div>
          <a href={`https://wa.me/972${l.phone?.replace(/^0/,"")}`} target="_blank" className="px-3 py-1.5 bg-[#eaf1e7] text-[#28634e] text-xs font-bold rounded-[8px]">↗ וואטסאפ</a>
        </div>)}
      </div>
    </div>

    {/* System URL — clearly separated */}
    <div className="border border-[#e1e8df] rounded-[14px] p-4 bg-[#f7f9f5]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-[#94A3B8]"/>
        <div className="text-xs font-bold text-[#63756b] uppercase tracking-wide">כניסה למערכת</div>
      </div>
      <div className="text-xs text-[#94A3B8] mb-2">הכתובת הזו היא כניסה לאפליקציה — לא לשיתוף עם נערים</div>
      <div className="text-xs font-mono bg-white border border-[#e1e8df] rounded-[8px] p-2 text-[#63756b] mb-2 break-all">{systemUrl}</div>
      <button onClick={()=>copy(systemUrl)} className="text-xs text-[#63756b] underline">העתק כתובת המערכת</button>
    </div>
  </div>
}