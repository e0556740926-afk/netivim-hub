"use client"
import {useEffect,useState} from "react"
import {createClient} from "@/lib/supabase/client"
import {useAuth} from "@/lib/auth-context"
import {currentYear,MONTH_HE} from "@/lib/utils"

export default function CoordProfile(){
  const {user,logout}=useAuth()
  const [myLeads,setMyLeads]=useState(0)
  const [yearLeads,setYearLeads]=useState(0)
  const [eventCount,setEventCount]=useState(0)
  const [report,setReport]=useState({achievements:"",challenges:"",leads_count:0,next_week_plan:""})
  const [sent,setSent]=useState(false)
  const [err,setErr]=useState("")
  const sb=createClient()
  const y=currentYear()
  const now=new Date()
  const week=Math.ceil((now.getDate()-now.getDay()+1)/7)

  useEffect(()=>{if(user)load()},[user])

  async function load(){
    const c=await sb.from("coordinators").select("id").eq("user_id",user!.id).single()
    if(!c.data) return
    const cid=c.data.id
    const[l,yl,e]=await Promise.all([
      sb.from("leads").select("id").eq("coordinator_id",cid).gte("created_at",`${y}-${String(now.getMonth()+1).padStart(2,"0")}-01`),
      sb.from("leads").select("id").eq("coordinator_id",cid).gte("created_at",`${y}-01-01`),
      sb.from("events").select("id").eq("coordinator_id",cid)
    ])
    setMyLeads((l.data||[]).length)
    setYearLeads((yl.data||[]).length)
    setEventCount((e.data||[]).length)
  }

  async function sendReport(){
    if(!report.achievements||!report.next_week_plan){setErr("יש למלא שדות חובה");return}
    const c=await sb.from("coordinators").select("id").eq("user_id",user!.id).single()
    if(!c.data) return
    await sb.from("weekly_reports").insert({coordinator_id:c.data.id,week_start:new Date(now.setDate(now.getDate()-now.getDay()+1)).toISOString().slice(0,10),...report})
    setSent(true)
  }

  return <div className="p-4 fade-up">
    <div className="flex items-center gap-3 mb-5">
      <div className="w-14 h-14 rounded-full bg-[#0D2744] text-white flex items-center justify-center text-base font-bold">{user?.name?.split(" ").map((w:string)=>w[0]).join("")}</div>
      <div><div className="text-lg font-extrabold">{user?.name}</div><div className="text-sm text-[#64748B]">רכז שטח</div></div>
      <button onClick={logout} className="mr-auto text-xs text-[#64748B] border border-[#E2E8F0] px-3 py-1.5 rounded-lg hover:bg-[#F8FAFC]">יציאה</button>
    </div>

    {/* Stats */}
    <div className="grid grid-cols-3 gap-2.5 mb-5">
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-3 text-center"><div className="text-xl font-extrabold">{myLeads}</div><div className="text-xs text-[#64748B]">לידים החודש</div></div>
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-3 text-center"><div className="text-xl font-extrabold">{yearLeads}</div><div className="text-xs text-[#64748B]">לידים {y}</div></div>
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-3 text-center"><div className="text-xl font-extrabold">{eventCount}</div><div className="text-xs text-[#64748B]">אירועים</div></div>
    </div>

    {/* Weekly Report */}
    {sent?<div className="bg-[#DCFCE7] rounded-[16px] p-6 text-center pop">
      <div className="text-4xl mb-2">✓</div>
      <div className="text-base font-extrabold text-[#166534]">כל הכבוד! הדיווח נשלח</div>
      <div className="text-sm text-[#166534] opacity-85 mt-1">שבוע {week} · נשלח למנהל הארגון</div>
      <button onClick={()=>{setSent(false);setReport({achievements:"",challenges:"",leads_count:0,next_week_plan:""})}} className="mt-3 text-xs font-bold text-[#166534] underline cursor-pointer">מלא דיווח נוסף</button>
    </div>:<div className="bg-white border border-[#E2E8F0] rounded-[16px] p-4">
      <div className="text-base font-extrabold mb-0.5">דיווח שבועי</div>
      <div className="text-xs text-[#64748B] mb-4">שבוע {week} · {y}</div>
      <div className="space-y-3">
        <div><label className="text-xs font-semibold block mb-1">הישגים מרכזיים השבוע *</label><textarea value={report.achievements} onChange={e=>setReport(r=>({...r,achievements:e.target.value}))} rows={3} placeholder="מה הצלחת לקדם?" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">אתגרים וחסמים</label><textarea value={report.challenges} onChange={e=>setReport(r=>({...r,challenges:e.target.value}))} rows={2} placeholder="במה נתקעת?" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">כמה לידים איספתי השבוע?</label><input value={report.leads_count} onChange={e=>setReport(r=>({...r,leads_count:+e.target.value}))} type="number" placeholder="0" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">מה אני מתכנן לשבוע הבא? *</label><textarea value={report.next_week_plan} onChange={e=>setReport(r=>({...r,next_week_plan:e.target.value}))} rows={2} placeholder="שלוש נקודות עיקריות" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/></div>
        {err&&<div className="text-xs text-[#B45309] text-center">{err}</div>}
        <button onClick={sendReport} className="w-full py-3 rounded-[11px] bg-[#0D2744] text-white text-sm font-bold hover:bg-[#164e8a] transition-colors">שלח דיווח</button>
      </div>
    </div>}
  </div>
}