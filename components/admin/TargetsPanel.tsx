"use client"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import {useEffect,useState} from "react"
import {pct,leadColor} from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"

export default function TargetsPanel(){
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rows,setRows]=useState<any[]>([])
  const [def,setDef]=useState(50)
  const m=new Date().getMonth()+1,y=new Date().getFullYear()

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true); setError(false)
    try {
      const res=await fetch("/api/targets")
      const {coordinators,targets,leads}=await res.json()
      setRows(coordinators.map((c:any)=>{
        const t=targets.find((x:any)=>x.coordinator_id===c.id)?.target_leads||0
        const a=leads.filter((l:any)=>l.coordinator_id===c.id).length
        return{coord_id:c.id,name:c.name,area:c.area,monthly:t,annual:t*12,actual:a}
      }))
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }

  async function setTarget(coord_id:number,val:number){
    await fetch("/api/targets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({coordinator_id:coord_id,target_leads:val})})
    setRows(r=>r.map(x=>x.coord_id===coord_id?{...x,monthly:val,annual:val*12}:x))
  }

  async function applyDefault(){await Promise.all(rows.map(r=>setTarget(r.coord_id,def)))}

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={4}/>)}</div>

  return <div className="fade-up">
    <div className="text-sm text-[#63756b] mb-4">יעד לידים חודשי ושנתי לכל רכז</div>
    <Card className="mb-4"><div className="p-4 flex items-center gap-4 flex-wrap">
      <div className="text-sm font-bold">יעד ברירת מחדל</div>
      <input value={def} onChange={e=>setDef(+e.target.value)} type="number" className="w-20 px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm text-center focus:outline-none focus:border-[#28634e]"/>
      <Button onClick={applyDefault}>החל על כל הרכזים</Button>
    </div></Card>
    <Card>
      <div className="hidden lg:grid grid-cols-[1.4fr_.8fr_1fr_1fr_.9fr_1.4fr] px-4 py-3 bg-[#f7f9f5] border-b border-[#e1e8df] text-xs font-bold text-[#63756b]">
        <div>רכז</div><div>אזור</div><div>יעד חודשי</div><div>שנתי</div><div>בוצע</div><div>%</div>
      </div>
      {rows.map(r=>{const p=pct(r.actual,r.monthly);const col=leadColor(p);return(
        <div key={r.coord_id} className="hidden lg:grid grid-cols-[1.4fr_.8fr_1fr_1fr_.9fr_1.4fr] px-4 py-3 border-b border-[#edf1e9] items-center last:border-b-0">
          <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-[#eaf1e7] text-[#28634e] flex items-center justify-center text-xs font-bold">{r.name.split(" ").map((w:string)=>w[0]).join("")}</div><div className="text-sm font-semibold">{r.name}</div></div>
          <div className="text-sm text-[#63756b]">{r.area}</div>
          <div><input value={r.monthly} onChange={e=>setTarget(r.coord_id,+e.target.value)} type="number" className="w-18 px-2 py-1.5 border border-[#c6d2c7] rounded-lg text-sm text-center focus:outline-none focus:border-[#28634e]"/></div>
          <div className="text-sm">{r.annual}</div>
          <div className="text-sm font-bold" style={{color:col}}>{r.actual}</div>
          <div className="flex items-center gap-2"><div className="flex-1 h-2 bg-[#f4f6f2] rounded-full overflow-hidden"><div style={{width:`${p}%`,background:col}} className="h-full rounded-full"/></div><div className="text-xs font-bold w-8 text-right" style={{color:col}}>{p}%</div></div>
        </div>
      )})}
    </Card>
  </div>
}