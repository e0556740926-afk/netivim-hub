"use client"
import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { leadColor, pct, MONTH_HE } from "@/lib/utils"
import KPICard from "@/components/ui/KPICard"
import Speedometer from "@/components/ui/Speedometer"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import PageLoader from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

interface Board { name:string; area:string; actual:number; target:number }
const MEDAL = ["🥇","🥈","🥉"]
const ST_LABEL: Record<string,string> = { marketing:"בפרסום", pending_approval:"ממתין לאישור", approved:"מאושר", planning:"תכנון", done:"בוצע" }

export default function Dashboard() {
  const { user } = useAuth()
  const [board, setBoard] = useState<Board[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [radar, setRadar] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [kpis, setKpis] = useState({ events:0, budgetPct:0, lateTasks:0, pendingCount:0 })
  const [orgLeads, setOrgLeads] = useState(0)
  const [orgTarget, setOrgTarget] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const month = new Date().getMonth()

  const loadAll = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const res = await fetch("/api/dashboard")
      if (!res.ok) throw new Error()
      const d = await res.json()
      const { coordinators, targets, leads, events, expenses, tasks, reports } = d

      const b: Board[] = (coordinators||[]).map((c:any)=>{
        const t = (targets||[]).find((x:any)=>x.coordinator_id===c.id)?.target_leads||0
        const a = (leads||[]).filter((l:any)=>l.coordinator_id===c.id).length
        return { name:c.name, area:c.area, actual:a, target:t }
      }).sort((a:Board,b:Board)=>b.actual-a.actual)
      setBoard(b)

      const totLeads = (leads||[]).length
      const totTarget = (targets||[]).reduce((s:number,t:any)=>s+(+t.target_leads||0),0)
      setOrgLeads(totLeads); setOrgTarget(totTarget)

      const active = (events||[]).filter((e:any)=>e.status!=="done"&&e.status!=="cancelled")
      const pend = (events||[]).filter((e:any)=>!e.approved&&e.status==="pending_approval")
      setPending(pend.slice(0,3))

      const totBudget = (events||[]).reduce((s:number,e:any)=>s+(+e.budget_planned||0),0)
      const totSpent = (expenses||[]).reduce((s:number,e:any)=>s+(+e.amount||0),0)
      const budgetPct = totBudget>0?Math.round(totSpent/totBudget*100):0
      const today = new Date().toISOString().slice(0,10)
      const lateTasks = (tasks||[]).filter((t:any)=>t.status!=="done"&&t.due_date&&t.due_date<today).length

      setKpis({ events:active.length, budgetPct, lateTasks, pendingCount:pend.length })

      const expByEvent: Record<number,number>={}
      ;(expenses||[]).forEach((e:any)=>{ if(e.event_id) expByEvent[e.event_id]=(expByEvent[e.event_id]||0)+(+e.amount||0) })
      setRadar(active.slice(0,4).map((e:any)=>({...e,spent:expByEvent[e.id]||0})))

      const al: any[]=[]
      const subIds=new Set((reports||[]).map((r:any)=>r.coordinator_id))
      const missing=(coordinators||[]).filter((c:any)=>!subIds.has(c.id))
      if(missing.length) al.push({type:"error",title:"דיווח שבועי חסר",body:`${missing.map((c:any)=>c.name).join(", ")} לא הגישו`,cta:"שלח תזכורת"})
      if(lateTasks>0) al.push({type:"warning",title:`${lateTasks} משימות באיחור`,body:"עברו את תאריך היעד",cta:"צפה במשימות"})
      if(pend.length) al.push({type:"warning",title:"ממתינים לאישורך",body:`${pend.length} אירועים דורשים אישור`,cta:"עבור לאישורים"})
      setAlerts(al)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [])

  useEffect(()=>{ loadAll() },[loadAll])

  async function approveEvent(id:number) {
    await fetch(`/api/events/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({approve:true})})
    setPending(p=>p.filter(e=>e.id!==id))
    setKpis(k=>({...k,pendingCount:k.pendingCount-1}))
  }

  if(loading) return <PageLoader/>
  if(error) return <div className="p-4 md:p-6"><ErrorState retry={loadAll}/></div>

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">מגדל פיקוח</h1>
          <div className="text-sm text-[#64748B] mt-1">{MONTH_HE[month]} {new Date().getFullYear()} · מעודכן בזמן אמת</div>
        </div>
        <div className="px-3 py-1.5 bg-[#DCFCE7] text-[#166534] text-sm font-semibold rounded-lg">{board.length} רכזים פעילים</div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPICard label="אירועים פעילים" value={kpis.events}/>
        <KPICard label="ניצול תקציב" value={`${kpis.budgetPct}%`} color={kpis.budgetPct>90?"#960010":kpis.budgetPct>75?"#B45309":"#0D2744"}/>
        <KPICard label="משימות באיחור" value={kpis.lateTasks} color={kpis.lateTasks>0?"#960010":"#0D2744"}/>
        <KPICard label="ממתינים לאישור" value={kpis.pendingCount} color={kpis.pendingCount>0?"#B45309":"#166534"}/>
      </div>

      {/* Pending approval */}
      {pending.length>0 && <Card className="mb-4 border-r-4 border-[#B45309]">
        <div className="px-4 py-3 border-b border-[#E2E8F0] text-sm font-bold text-[#B45309]">⏳ ממתינים לאישורך</div>
        <div className="p-3 space-y-2">
          {pending.map(e=><div key={e.id} className="flex items-center gap-3 p-3 bg-[#F0F4F8] rounded-[10px]">
            <div className="flex-1"><div className="text-sm font-semibold">{e.name}</div><div className="text-xs text-[#64748B]">{e.date} · ₪{(+e.budget_planned).toLocaleString()}</div></div>
            <button onClick={()=>approveEvent(e.id)} className="px-4 py-1.5 bg-[#166534] text-white text-sm font-semibold rounded-lg hover:bg-[#15803d] transition-colors">אשר ✓</button>
          </div>)}
        </div>
      </Card>}

      {/* Speedometer + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 mb-4">
        <Card className="p-5 flex flex-col items-center gap-3">
          <div className="text-sm font-bold self-start">מד לידים ארגוני</div>
          <Speedometer actual={orgLeads} target={orgTarget} size={170}/>
          <div className="text-xs text-[#64748B] text-center">{orgLeads} / {orgTarget} לידים החודש</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-bold mb-4">דירוג רכזים · לידים החודש</div>
          <div className="space-y-3">
            {board.map((c,i)=>{
              const p=pct(c.actual,c.target); const col=leadColor(p)
              return <div key={c.name} className="flex items-center gap-3">
                <div className="w-6 text-sm font-bold text-[#94A3B8] text-center">{MEDAL[i]||i+1}</div>
                <div className="w-8 h-8 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold">{c.name.split(" ").map(w=>w[0]).join("")}</div>
                <div className="w-24 text-sm font-semibold truncate">{c.name}</div>
                <div className="w-12 text-xs text-[#64748B]">{c.area}</div>
                <div className="flex-1 h-2 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${p}%`,background:col}} className="h-full rounded-full transition-all duration-700"/></div>
                <div className="w-16 text-left text-sm font-bold" style={{color:col}}>{c.actual}/{c.target}</div>
              </div>
            })}
            {board.length===0&&<div className="text-sm text-[#94A3B8] text-center py-4">אין רכזים</div>}
          </div>
        </Card>
      </div>

      {/* Radar + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card className="p-5">
          <div className="text-sm font-bold mb-4">📡 רדאר אירועים קרובים</div>
          <div className="space-y-2.5">
            {radar.map(e=>{
              const d=new Date(e.date); const bp=e.budget_planned>0?Math.round(+e.spent/e.budget_planned*100):0
              return <div key={e.id} className="flex items-center gap-3 p-3 border border-[#E2E8F0] rounded-[11px] hover:border-[#00488D] transition-colors">
                <div className="w-12 text-center flex-shrink-0"><div className="text-lg font-extrabold leading-none">{d.getDate()}</div><div className="text-xs text-[#64748B]">{["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"][d.getMonth()]}</div></div>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{e.name}</div><div className="text-xs text-[#64748B] truncate">{e.location}</div></div>
                <Badge text={ST_LABEL[e.status]||e.status}/>
                <div className="w-20 flex-shrink-0"><div className="h-1.5 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${Math.min(bp,100)}%`,background:bp>90?"#960010":"#00488D"}} className="h-full rounded-full"/></div><div className="text-xs text-[#64748B] mt-1">₪{e.spent?.toLocaleString()}</div></div>
              </div>
            })}
            {radar.length===0&&<div className="text-sm text-[#94A3B8] text-center py-4">אין אירועים קרובים</div>}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-bold mb-4">🚨 מרכז פעולות</div>
          <div className="space-y-2.5">
            {alerts.map((a,i)=>{
              const COLORS:Record<string,{bg:string,border:string,text:string}>={error:{bg:"#FFF0F0",border:"#960010",text:"#960010"},warning:{bg:"#FFFBEB",border:"#B45309",text:"#B45309"},info:{bg:"#F0F7FF",border:"#00488D",text:"#00488D"}}; const c=COLORS[a.type]||{bg:"#F8FAFC",border:"#64748B",text:"#64748B"}
              return <div key={i} style={{background:c.bg,borderRight:`3px solid ${c.border}`}} className="p-3 rounded-[11px]">
                <div style={{color:c.text}} className="text-sm font-semibold">{a.title}</div>
                <div className="text-xs text-[#475569] mt-1">{a.body}</div>
                <div className="text-xs font-bold text-[#00488D] mt-2 cursor-pointer">{a.cta} →</div>
              </div>
            })}
            {alerts.length===0&&<div className="p-4 text-center text-sm text-[#94A3B8]">✓ אין התראות פעילות</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}