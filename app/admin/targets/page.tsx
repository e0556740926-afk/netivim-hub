"use client"
import {useEffect,useState} from "react"
import {createClient} from "@/lib/supabase/client"
import {currentMonth,currentYear,pct,leadColor} from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"

interface Row{id:number;name:string;area:string;coord_id:number;monthly:number;annual:number;actual:number}

export default function TargetsPage(){
  const [rows,setRows]=useState<Row[]>([])
  const [def,setDef]=useState(50)
  const sb=createClient()
  const m=currentMonth(),y=currentYear()

  useEffect(()=>{load()},[])

  async function load(){
    const[c,t,l]=await Promise.all([
      sb.from("coordinators").select("id,name,area"),
      sb.from("monthly_targets").select("coordinator_id,target_leads").eq("month",m).eq("year",y),
      sb.from("leads").select("coordinator_id").gte("created_at",`${y}-${String(m).padStart(2,"0")}-01`),
    ])
    const coords=c.data||[];const targets=t.data||[];const leads=l.data||[]
    setRows(coords.map((c:any)=>{
      const mt=targets.find((t:any)=>t.coordinator_id===c.id)?.target_leads||0
      const a=leads.filter((l:any)=>l.coordinator_id===c.id).length
      return{id:Math.random(),name:c.name,area:c.area,coord_id:c.id,monthly:mt,annual:mt*12,actual:a}
    }))
  }

  async function setTarget(coord_id:number,val:number){
    await sb.from("monthly_targets").upsert({coordinator_id:coord_id,month:m,year:y,target_leads:val},{onConflict:"coordinator_id,month,year"})
    setRows(r=>r.map(x=>x.coord_id===coord_id?{...x,monthly:val,annual:val*12}:x))
  }

  async function applyDefault(){
    await Promise.all(rows.map(r=>setTarget(r.coord_id,def)))
  }

  return <div className="p-6 md:p-8 fade-up">
    <h1 className="text-2xl font-extrabold text-[#0D2744] mb-1">הגדרת יעדי לידים</h1>
    <div className="text-sm text-[#64748B] mb-5">יעד חודשי ושנתי לכל רכז</div>

    <Card className="mb-4">
      <div className="p-4 flex items-center gap-4 flex-wrap">
        <div className="text-sm font-bold">יעד ברירת מחדל לכולם</div>
        <input value={def} onChange={e=>setDef(+e.target.value)} type="number" className="w-20 px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm text-center focus:outline-none focus:border-[#00488D]"/>
        <Button onClick={applyDefault}>החל על כל הרכזים</Button>
        <div className="text-xs text-[#94A3B8]">משנה את היעד החודשי של כל הרכזים בבת אחת</div>
      </div>
    </Card>

    <Card>
      <div className="grid grid-cols-[1.4fr_.8fr_1fr_1fr_.9fr_1.4fr] px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-bold text-[#64748B]">
        <div>רכז</div><div>אזור</div><div>יעד חודשי</div><div>יעד שנתי</div><div>בוצע</div><div>% מהיעד</div>
      </div>
      {rows.map(r=>{
        const p=pct(r.actual,r.monthly);const col=leadColor(p)
        return <div key={r.coord_id} className="grid grid-cols-[1.4fr_.8fr_1fr_1fr_.9fr_1.4fr] px-4 py-3 border-b border-[#F1F5F9] items-center last:border-b-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">{r.name.split(" ").map((w:string)=>w[0]).join("")}</div>
            <div className="text-sm font-semibold">{r.name}</div>
          </div>
          <div className="text-sm text-[#64748B]">{r.area}</div>
          <div><input value={r.monthly} onChange={e=>setTarget(r.coord_id,+e.target.value)} type="number" className="w-18 px-2 py-1.5 border border-[#CBD5E1] rounded-lg text-sm text-center focus:outline-none focus:border-[#00488D]"/></div>
          <div className="text-sm text-[#475569]">{r.annual}</div>
          <div className="text-sm font-bold" style={{color:col}}>{r.actual}</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${p}%`,background:col}} className="h-full rounded-full transition-all"/></div>
            <div className="text-xs font-bold w-10 text-right" style={{color:col}}>{p}%</div>
          </div>
        </div>
      })}
    </Card>
  </div>
}