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
  const [aiLoading, setAiLoading] = useState(false)
  const y = new Date().getFullYear()
  const m = new Date().getMonth()+1
  const week = Math.ceil(new Date().getDate()/7)

  useEffect(() => { if (user) load() }, [user])

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