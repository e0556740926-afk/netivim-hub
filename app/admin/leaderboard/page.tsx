"use client"
import {useEffect,useState} from "react"
import {createClient} from "@/lib/supabase/client"
import {leadColor,pct,currentMonth,currentYear} from "@/lib/utils"
import Card from "@/components/ui/Card"
import Speedometer from "@/components/ui/Speedometer"

interface Entry{name:string;area:string;actual:number;target:number;rank:number}

export default function LeaderboardPage(){
  const [board,setBoard]=useState<Entry[]>([])
  const [org,setOrg]=useState({actual:0,target:0})
  const sb=createClient()
  const m=currentMonth(),y=currentYear()
  const MEDAL=["🥇","🥈","🥉"]

  useEffect(()=>{
    async function load(){
      const[c,t,l]=await Promise.all([
        sb.from("coordinators").select("id,name,area"),
        sb.from("monthly_targets").select("coordinator_id,target_leads").eq("month",m).eq("year",y),
        sb.from("leads").select("coordinator_id").gte("created_at",`${y}-${String(m).padStart(2,"0")}-01`),
      ])
      const coords=c.data||[];const targets=t.data||[];const leads=l.data||[]
      const rows=coords.map((c:any)=>{
        const tgt=targets.find((t:any)=>t.coordinator_id===c.id)?.target_leads||0
        const act=leads.filter((l:any)=>l.coordinator_id===c.id).length
        return{name:c.name,area:c.area,actual:act,target:tgt}
      }).sort((a,b)=>b.actual-a.actual).map((r,i)=>({...r,rank:i+1}))
      setBoard(rows)
      setOrg({actual:leads.length,target:targets.reduce((s:any,t:any)=>s+t.target_leads,0)})
    }
    load()
  },[])

  return <div className="p-6 md:p-8 fade-up">
    <h1 className="text-2xl font-extrabold mb-5">Leaderboard · לידים החודש</h1>
    <div className="grid grid-cols-[240px_1fr] gap-5 mb-5">
      <Card className="p-5 flex flex-col items-center gap-3">
        <div className="text-sm font-bold">מד לידים ארגוני</div>
        <Speedometer actual={org.actual} target={org.target} size={160}/>
        <div className="text-xs text-[#64748B] text-center">{org.actual} / {org.target} לידים</div>
      </Card>
      <Card>
        <div className="p-4 border-b border-[#E2E8F0] text-xs font-bold text-[#64748B] grid grid-cols-[2rem_2fr_1fr_1fr_2fr_3rem] gap-3">
          <div>#</div><div>רכז</div><div>אזור</div><div>לידים</div><div>התקדמות</div><div>%</div>
        </div>
        {board.map(r=>{
          const p=pct(r.actual,r.target);const col=leadColor(p)
          return <div key={r.name} className="grid grid-cols-[2rem_2fr_1fr_1fr_2fr_3rem] gap-3 px-4 py-3 border-b border-[#F1F5F9] items-center last:border-b-0">
            <div className="text-base">{MEDAL[r.rank-1]||r.rank}</div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">{r.name.split(" ").map((w:string)=>w[0]).join("")}</div>
              <div className="text-sm font-semibold">{r.name}</div>
            </div>
            <div className="text-sm text-[#64748B]">{r.area}</div>
            <div className="text-sm font-bold" style={{color:col}}>{r.actual}</div>
            <div className="h-2 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${p}%`,background:col}} className="h-full rounded-full transition-all duration-700"/></div>
            <div className="text-xs font-bold text-right" style={{color:col}}>{p}%</div>
          </div>
        })}
      </Card>
    </div>
  </div>
}