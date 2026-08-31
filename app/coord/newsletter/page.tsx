"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
function fd(d: string) {
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`
}

export default function CoordNewsletterPage() {
  const { user } = useAuth()
  const [coord, setCoord] = useState<any>(null)
  const [subscribers, setSubscribers] = useState<any[]>([])
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setOrigin(window.location.origin)
    if (!user) return
    fetch(`/api/coord?user_id=${user.id}`).then(r => r.json()).then(async ({ coord }) => {
      if (!coord) { setLoading(false); return }
      setCoord(coord)
      const res = await fetch(`/api/newsletter/subscribers?coordinator_id=${coord.id}`)
      const d = await res.json()
      setSubscribers(d.subscribers || [])
      setLoading(false)
    })
  }, [user])

  const shareUrl = coord ? `${origin}/newsletter/${coord.slug}` : ""

  async function copy() {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  function whatsapp() {
    const msg = encodeURIComponent(`היי! מוזמנים להצטרף לניוזלטר החודשי של נתיבים:\n${shareUrl}`)
    window.open(`https://wa.me/?text=${msg}`, "_blank")
  }

  if (loading) return <div className="p-4 max-w-2xl mx-auto text-sm text-[#94A3B8] text-center py-10">טוען...</div>

  return (
    <div className="p-4 max-w-2xl mx-auto fade-up">
      <div className="text-xl font-extrabold mb-3">ניוזלטר להורים</div>

      {/* Personal link */}
      <div className="bg-[#0D2744] rounded-[18px] p-4 mb-4">
        <div className="text-white text-sm font-bold mb-1">📬 הלינק האישי שלך</div>
        <div className="text-[#60A5FA] text-xs mb-3">שתף עם הורים — כל מי שנרשם דרכו יופיע כאן</div>
        <div className="text-xs font-mono bg-white/10 rounded-[10px] p-2.5 mb-3 text-white/90 break-all">{shareUrl || "טוען..."}</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={copy} className="py-2.5 bg-white/20 hover:bg-white/30 text-white text-sm font-bold rounded-[10px] transition-colors">
            {copied ? "✓ הועתק!" : "העתק לינק"}
          </button>
          <button onClick={whatsapp} className="py-2.5 bg-[#166534] text-white text-sm font-bold rounded-[10px] hover:bg-[#15803d] transition-colors">שתף בוואטסאפ</button>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4 text-center mb-4">
        <div className="text-3xl font-extrabold text-[#0D2744]">{subscribers.length}</div>
        <div className="text-xs text-[#64748B] mt-0.5">הורים נרשמו דרכך</div>
      </div>

      {/* List */}
      <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-4">
        <div className="text-sm font-bold mb-3">נרשמים ({subscribers.length})</div>
        {subscribers.length === 0 ? (
          <div className="text-sm text-[#94A3B8] text-center py-4">עדיין לא נרשם אף אחד דרך הלינק שלך</div>
        ) : (
          <div className="space-y-2">
            {subscribers.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between pb-2.5 border-b border-[#F1F5F9] last:border-0">
                <div>
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-xs text-[#64748B]">{s.email}</div>
                </div>
                <div className="text-xs text-[#94A3B8]">{fd(s.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-[#94A3B8] text-center mt-4">
        גיליונות הניוזלטר נשלחים על ידי ההנהלה מדי חודש
      </div>
    </div>
  )
}
