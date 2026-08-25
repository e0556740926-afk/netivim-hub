"use client"
import {useEffect,useState} from "react"
import {useRouter} from "next/navigation"
import {createClient} from "@/lib/supabase/client"
import {useAuth} from "@/lib/auth-context"
import {fd,leadColor,pct,MONTH_HE,currentMonth,currentYear} from "@/lib/utils"
import Speedometer from "@/components/ui/Speedometer"
import Badge from "@/components/ui/Badge"

interface Task{id:number;title:string;due_date:string;status:string}
interface MyEvent{id:number;name:string;date:string;location:string;status:string}

export default function CoordHome(){
  const {user}=useAuth()
  const router=useRouter()
  const [myLeads,setMyLeads]=useState(0)
  const [target,setTarget]=useState(0)
  const [linkCount,setLinkCount]=useState(0)
  const [tasks,setTasks]=useState<Task[]>([])
  const [events,setEvents]=useState<MyEvent[]>([])
  const [daily,setDaily]=useState("")
  const sb=createClient()
  const m=currentMonth(),y=currentYear()
  const MONTH_HE_ARR=["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"]

  useEffect(()=>{if(user)load()},[user])

  async function load(){
    const coord=await sb.from("coordinators").select("id,slug").eq("user_id",user!.id).single()
    if(!coord.data) return
    const cid=coord.data.id

    const[l,t,mt,e]=await Promise.all([
      sb.from("leads").select("id").eq("coordinator_id",cid).gte("created_at",`${y}-${String(m).padStart(2,"0")}-01`),
      sb.from("monthly_targets").select("target_leads").eq("coordinator_id",cid).eq("month",m).eq("year",y).single(),
      sb.from("leads").select("id").eq("coordinator_id",cid).eq("source","link"),
      sb.from("tasks").select("*").contains("assignees",[user!.name]).neq("status","done").order("due_date").limit(5),
    ])
    setMyLeads((l.data||[]).length)
    setTarget(t.data?.target_leads||0)
    setLinkCount((mt.data||[]).length)
    setTasks((e.data||[]))
    const evRes=await sb.from("events").select("*").eq("coordinator_id",cid).neq("status","done").order("date").limit(3)
    setEvents(evRes.data||[])
  }

  async function doneTask(id:number){
    await sb.from("tasks").update({status:"done"}).eq("id",id)
    setTasks(t=>t.filter(x=>x.id!==id))
  }

  const today=new Date().toISOString().slice(0,10)

  return <div className="p-4">
    <div className="text-xl font-extrabold mb-0.5">שלום {user?.name?.split(" ")[0]},</div>
    <div className="text-sm text-[#64748B] mb-4">יש לך {tasks.length} משימות פתוחות היום</div>

    {/* Lead speedometer card */}
    <div className="bg-[#0D2744] rounded-[18px] p-5 flex items-center gap-4 mb-3">
      <Speedometer actual={myLeads} target={target} size={104} dark/>
      <div className="text-white">
        <div className="text-xs opacity-70">יעד לידים · {MONTH_HE_ARR[m-1]}</div>
        <div style={{color:leadColor(pct(myLeads,target))}} className="text-3xl font-extrabold leading-tight">{pct(myLeads,target)}%</div>
        <div className="text-xs opacity-75 mt-1">נותרו {new Date(y,m,0).getDate()-new Date().getDate()} ימים</div>
      </div>
    </div>

    {/* Share link */}
    <div onClick={()=>router.push("/coord/link")} className="bg-[#00488D] rounded-[16px] p-4 flex items-center justify-between text-white cursor-pointer mb-4">
      <div><div className="text-base font-bold">שתף את הלינק שלי</div><div className="text-xs opacity-80">{linkCount} אנשים מילאו את הטופס</div></div>
      <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">↗</div>
    </div>

    {/* Tasks */}
    <div className="flex justify-between items-center mb-2.5">
      <div className="text-base font-bold">המשימות שלי</div>
      <div onClick={()=>router.push("/coord/tasks")} className="text-xs text-[#00488D] font-semibold cursor-pointer">הכל</div>
    </div>
    <div className="space-y-2 mb-4">
      {tasks.map(t=>{
        const late=t.due_date&&t.due_date<today
        const accent=late?"#960010":t.status==="waiting"?"#B45309":"#00488D"
        return <div key={t.id} style={{borderRight:`3px solid ${accent}`}} className="bg-white border border-[#E2E8F0] rounded-[12px] p-3 flex items-center gap-3">
          <div onClick={()=>doneTask(t.id)} style={{borderColor:accent,color:accent}} className="w-6 h-6 flex-shrink-0 rounded-[7px] border-2 cursor-pointer flex items-center justify-center text-xs font-bold">✓</div>
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{t.title}</div><div style={{color:accent}} className="text-xs font-semibold mt-0.5">{late?"⚠ ":""}{fd(t.due_date)}</div></div>
        </div>
      })}
      {tasks.length===0&&<div className="text-sm text-[#94A3B8] text-center py-3">אין משימות פתוחות 🎉</div>}
    </div>

    {/* Events */}
    {events.length>0&&<><div className="text-base font-bold mb-2.5">האירועים שלי</div>
    <div className="space-y-2 mb-4">
      {events.map(e=>{
        const d=new Date(e.date)
        const stLabel={planning:"תכנון",pending_approval:"ממתין לאישור",approved:"מאושר",marketing:"בפרסום",done:"בוצע"}[e.status]||e.status
        return <div key={e.id} className="bg-white border border-[#E2E8F0] rounded-[12px] p-3 flex items-center gap-3">
          <div className="w-11 text-center flex-shrink-0"><div className="text-base font-extrabold leading-none">{d.getDate()}</div><div className="text-xs text-[#64748B]">{MONTH_HE_ARR[d.getMonth()]}</div></div>
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{e.name}</div><div className="text-xs text-[#64748B] truncate">{e.location}</div></div>
          <Badge text={stLabel}/>
        </div>
      })}
    </div></>}

    {/* Daily input */}
    <div className="bg-[#DBEAFE] rounded-[16px] p-4">
      <div className="text-sm font-bold text-[#0D2744] mb-2">מה עשית היום לקידום היעד?</div>
      <input value={daily} onChange={e=>setDaily(e.target.value)} placeholder="בשורה אחת…" className="w-full px-3 py-2.5 border border-[#BFDBFE] rounded-[10px] text-sm bg-white focus:outline-none focus:border-[#00488D]"/>
      <div className="mt-2.5 text-center py-2.5 rounded-[10px] bg-[#0D2744] text-white text-sm font-semibold cursor-pointer">שמור לדיווח השבועי</div>
    </div>
  </div>
}