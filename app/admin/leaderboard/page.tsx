"use client"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import {useEffect,useState} from "react"
import {pct,leadColor} from "@/lib/utils"
import Card from "@/components/ui/Card"
import Speedometer from "@/components/ui/Speedometer"

export default function LeaderboardPage(){
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [board,setBoard]=useState<any[]>([])
  const [org,setOrg]=useState({actual:0,target:0})
  const MEDAL=["🥇","🥈","🥉"]

  useEffect(()=>{
    fetch("/api/targets").then(r=>r.json()).then(({coordinators,targets,leads})=>{
      const rows=coordinators.map((c:any)=>{
        const t=targets.find((x:any)=>x.coordinator_id===c.id)?.target_leads||0
        const mine=leads.filter((l:any)=>l.coordinator_id===c.id)
        const a=mine.length
        const fromEvents=mine.filter((l:any)=>l.event_id).length
        return{name:c.name,area:c.area,actual:a,target:t,fromEvents}
      }).sort((a:any,b:any)=>b.actual-a.actual)
      setBoard(rows)
      setOrg({actual:leads.length,target:targets.reduce((s:any,t:any)=>s+ +t.target_leads,0)})
    })
  },[])

  if (error) return <div className="p-6"><ErrorState retry={()=>window.location.reload()}/></div>

  return <div className="p-4 md:p-6 lg:p-8 fade-up">
    <h1 className="text-2xl font-extrabold mb-5">Leaderboard · לידים החודש</h1>
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5 mb-5">
      <Card className="p-5 flex flex-col items-center gap-3">
        <div className="text-sm font-bold">מד לידים ארגוני</div>
        <Speedometer actual={org.actual} target={org.target} size={160}/>
        <div className="text-xs text-[#64748B] text-center">{org.actual} / {org.target} לידים</div>
      </Card>
      <Card>
        <div className="p-4 border-b border-[#E2E8F0] text-xs font-bold text-[#64748B] grid grid-cols-[2rem_2fr_1fr_1fr_1fr_2fr_3rem] gap-3">
          <div>#</div><div>רכז</div><div>אזור</div><div>לידים</div><div title="מתוכם מאירועים">מאירועים</div><div>התקדמות</div><div>%</div>
        </div>
        {board.map((r,i)=>{
          const p=pct(r.actual,r.target);const col=leadColor(p)
          return <div key={r.name} className="grid grid-cols-[2rem_2fr_1fr_1fr_1fr_2fr_3rem] gap-3 px-4 py-3 border-b border-[#F1F5F9] items-center last:border-b-0">
            <div className="text-base">{MEDAL[i]||i+1}</div>
            <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold">{r.name.split(" ").map((w:string)=>w[0]).join("")}</div><div className="text-sm font-semibold">{r.name}</div></div>
            <div className="text-sm text-[#64748B]">{r.area}</div>
            <div className="text-sm font-bold" style={{color:col}}>{r.actual}</div>
            <div className="text-sm text-[#5B21B6] font-semibold">{r.fromEvents>0?`🎪 ${r.fromEvents}`:"—"}</div>
            <div className="h-2 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${p}%`,background:col}} className="h-full rounded-full transition-all"/></div>
            <div className="text-xs font-bold text-right" style={{color:col}}>{p}%</div>
          </div>
        })}
      </Card>
    </div>
  </div>
}