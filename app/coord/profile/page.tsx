"use client"
import {useEffect,useState} from "react"
import {useAuth} from "@/lib/auth-context"

export default function CoordProfile(){
  const {user,logout}=useAuth()
  const [stats,setStats]=useState({month:0,year:0,events:0})
  const [report,setReport]=useState({achievements:"",challenges:"",leads_count:0,next_week_plan:""})
  const [sent,setSent]=useState(false)
  const [err,setErr]=useState("")
  const y=new Date().getFullYear()
  const week=Math.ceil(new Date().getDate()/7)

  useEffect(()=>{if(user)load()},[user])

  async function load(){
    const cRes=await fetch(`/api/coord?user_id=${user!.id}`)
    const {coord}=await cRes.json()
    if(!coord) return
    const lRes=await fetch(`/api/leads?coordinator_id=${coord.id}`)
    const {leads}=await lRes.json()
    const m=new Date().getMonth()+1
    setStats({
      month:leads.filter((l:any)=>l.created_at?.slice(5,7)===String(m).padStart(2,"0")).length,
      year:leads.length,
      events:0
    })
  }

  async function sendReport(){
    if(!report.achievements||!report.next_week_plan){setErr("יש למלא שדות חובה");return}
    const cRes=await fetch(`/api/coord?user_id=${user!.id}`)
    const {coord}=await cRes.json()
    if(!coord) return
    const d=new Date();const mon=new Date(d.setDate(d.getDate()-d.getDay()+1))
    await fetch("/api/reports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({coordinator_id:coord.id,week_start:mon.toISOString().slice(0,10),...report})})
    setSent(true)
  }

  return <div className="p-4 fade-up">
    <div className="flex items-center gap-3 mb-5">
      <div className="w-14 h-14 rounded-full bg-[#0D2744] text-white flex items-center justify-center text-base font-bold">{user?.name?.split(" ").map((w:string)=>w[0]).join("")}</div>
      <div><div className="text-lg font-extrabold">{user?.name}</div><div className="text-sm text-[#64748B]">רכז שטח · {user?.area}</div></div>
      <button onClick={logout} className="mr-auto text-xs text-[#64748B] border border-[#E2E8F0] px-3 py-1.5 rounded-lg hover:bg-[#F8FAFC]">יציאה</button>
    </div>
    <div className="grid grid-cols-3 gap-2.5 mb-5">
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-3 text-center"><div className="text-xl font-extrabold">{stats.month}</div><div className="text-xs text-[#64748B]">לידים החודש</div></div>
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-3 text-center"><div className="text-xl font-extrabold">{stats.year}</div><div className="text-xs text-[#64748B]">לידים {y}</div></div>
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-3 text-center"><div className="text-xl font-extrabold">{stats.events}</div><div className="text-xs text-[#64748B]">אירועים</div></div>
    </div>
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