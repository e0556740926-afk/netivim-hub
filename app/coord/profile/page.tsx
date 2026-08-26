"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"

export default function CoordProfile() {
  const { user, logout } = useAuth()
  const [stats, setStats] = useState({ month:0, year:0 })
  const [coord, setCoord] = useState<any>(null)
  const [report, setReport] = useState({ achievements:"", challenges:"", leads_count:0, next_week_plan:"" })
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState("")
  const [aiSummary, setAiSummary] = useState("")
  const [calToken, setCalToken] = useState("")
  const [calCopied, setCalCopied] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const y = new Date().getFullYear()
  const m = new Date().getMonth()+1
  const week = Math.ceil(new Date().getDate()/7)

  useEffect(() => { if (user) { load(); loadCalToken() } }, [user])

  async function loadCalToken() {
    const res = await fetch(`/api/calendar-token?user_id=${user!.id}`)
    const d = await res.json()
    setCalToken(d.token||"")
  }

  async function copyCalLink() {
    const url = `${window.location.origin}/api/calendar.ics/${calToken}`
    await navigator.clipboard.writeText(url)
    setCalCopied(true); setTimeout(()=>setCalCopied(false),2000)
  }

  async function load() {
    const cRes = await fetch(`/api/coord?user_id=${user!.id}`)
    const { coord: c } = await cRes.json()
    if (!c) return
    setCoord(c)
    const lRes = await fetch(`/api/leads?coordinator_id=${c.id}`)
    const { leads } = await lRes.json()
    const monthLeads = (leads||[]).filter((l:any)=>l.created_at?.slice(5,7)===String(m).padStart(2,"0"))
    setStats({ month: monthLeads.length, year: (leads||[]).length })
  }

  async function getAiSummary() {
    if (!coord) return
    setAiLoading(true); setAiSummary("")
    const res = await fetch("/api/ai-summary", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ coordinator_id: coord.id, coordinator_name: user?.name })
    })
    const d = await res.json()
    setAiSummary(d.summary || "")
    setAiLoading(false)
  }

  async function sendReport() {
    if (!report.achievements || !report.next_week_plan) { setErr("יש למלא שדות חובה"); return }
    if (!coord) return
    const d = new Date()
    const mon = new Date(d.setDate(d.getDate()-d.getDay()+1))
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ coordinator_id: coord.id, week_start: mon.toISOString().slice(0,10), ...report })
    })
    setSent(true)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-14 h-14 rounded-full bg-[#0D2744] text-white flex items-center justify-center text-base font-bold">
          {user?.name?.split(" ").map((w:string)=>w[0]).join("")}
        </div>
        <div className="flex-1">
          <div className="text-lg font-extrabold">{user?.name}</div>
          <div className="text-sm text-[#64748B]">רכז שטח{user?.area ? ` · ${user.area}` : ""}</div>
        </div>
        <button onClick={logout} className="text-xs text-[#64748B] border border-[#E2E8F0] px-3 py-1.5 rounded-lg hover:bg-[#F8FAFC]">יציאה</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-3 text-center">
          <div className="text-2xl font-extrabold text-[#0D2744]">{stats.month}</div>
          <div className="text-xs text-[#64748B]">לידים החודש</div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-3 text-center">
          <div className="text-2xl font-extrabold text-[#0D2744]">{stats.year}</div>
          <div className="text-xs text-[#64748B]">לידים {y}</div>
        </div>
      </div>

      {/* Calendar */}
      {calToken && <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-4 mb-4">
        <div className="text-sm font-bold text-[#0D2744] mb-1">📅 היומן האישי שלי</div>
        <div className="text-xs text-[#64748B] mb-3">חבר את האירועים והמשימות שלך ל-Google Calendar</div>
        <div className="flex gap-2">
          <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(window.location.origin+"/api/calendar.ics/"+calToken)}`}
            target="_blank"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-[#E2E8F0] rounded-[10px] text-xs font-semibold text-[#374151] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google Calendar
          </a>
          <button onClick={copyCalLink}
            className="flex-1 py-2.5 border border-[#E2E8F0] rounded-[10px] text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC] transition-colors">
            {calCopied ? "✓ הועתק!" : "העתק לינק"}
          </button>
        </div>
        <div className="text-[10px] text-[#94A3B8] mt-2 text-center">הלינק אישי — אל תשתף אותו עם אחרים</div>
      </div>}

      {/* AI Summary */}
      <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[16px] p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold text-[#5B21B6]">✨ סיכום שבועי AI</div>
          <button onClick={getAiSummary} disabled={aiLoading}
            className="px-3 py-1.5 bg-[#5B21B6] text-white text-xs font-bold rounded-[8px] disabled:opacity-60 hover:bg-[#4C1D95] transition-colors">
            {aiLoading ? "מייצר..." : "צור סיכום"}
          </button>
        </div>
        {aiSummary
          ? <div className="text-sm text-[#374151] leading-relaxed bg-white rounded-[10px] p-3 border border-[#DDD6FE]">{aiSummary}</div>
          : <div className="text-xs text-[#8B5CF6]">לחץ לקבלת סיכום אוטומטי של פעילות השבוע שלך</div>
        }
      </div>

      {/* Weekly report */}
      {sent
        ? <div className="bg-[#DCFCE7] rounded-[16px] p-6 text-center">
            <div className="text-4xl mb-2">✓</div>
            <div className="text-base font-extrabold text-[#166534]">כל הכבוד! הדיווח נשלח</div>
            <div className="text-sm text-[#166534] opacity-85 mt-1">שבוע {week} · נשלח למנהל</div>
            <button onClick={()=>{setSent(false);setReport({achievements:"",challenges:"",leads_count:0,next_week_plan:""})}}
              className="mt-3 text-xs font-bold text-[#166534] underline">מלא דיווח נוסף</button>
          </div>
        : <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-4">
            <div className="text-base font-extrabold mb-0.5">דיווח שבועי</div>
            <div className="text-xs text-[#64748B] mb-4">שבוע {week} · {y}</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold block mb-1">הישגים מרכזיים *</label>
                <textarea value={report.achievements} onChange={e=>setReport(r=>({...r,achievements:e.target.value}))} rows={3}
                  placeholder="מה הצלחת לקדם?" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">אתגרים</label>
                <textarea value={report.challenges} onChange={e=>setReport(r=>({...r,challenges:e.target.value}))} rows={2}
                  placeholder="במה נתקעת?" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">כמה לידים איספתי?</label>
                <input value={report.leads_count||""} onChange={e=>setReport(r=>({...r,leads_count:+e.target.value}))} type="number"
                  className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">תכנון שבוע הבא *</label>
                <textarea value={report.next_week_plan} onChange={e=>setReport(r=>({...r,next_week_plan:e.target.value}))} rows={2}
                  placeholder="שלוש נקודות עיקריות" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/>
              </div>
              {err && <div className="text-xs text-[#960010]">{err}</div>}
              <button onClick={sendReport} className="w-full py-3 rounded-[11px] bg-[#0D2744] text-white text-sm font-bold hover:bg-[#00488D] transition-colors">שלח דיווח</button>
            </div>
          </div>
      }
    </div>
  )
}