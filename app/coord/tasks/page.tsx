"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd } from "@/lib/utils"

const COLS = [
  { key:"todo", label:"לביצוע", bg:"#F8FAFC", border:"#E2E8F0", fg:"#374151" },
  { key:"inprogress", label:"בתהליך", bg:"#F0F7FF", border:"#BFDBFE", fg:"#1E40AF" },
  { key:"waiting", label:"ממתין", bg:"#FFFBEB", border:"#FDE68A", fg:"#B45309" },
  { key:"done", label:"בוצע", bg:"#F0FFF4", border:"#BBF7D0", fg:"#166534" },
]

export default function CoordTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<any[]>([])
  const today = new Date().toISOString().slice(0,10)

  useEffect(() => {
    if (!user) return
    fetch(`/api/tasks?name=${encodeURIComponent(user.name)}`).then(r=>r.json()).then(d=>setTasks(d.tasks||[]))
  }, [user])

  async function move(id: number, status: string) {
    await fetch("/api/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status,status_only:true})})
    setTasks(t=>t.map(x=>x.id===id?{...x,status}:x))
  }

  return <div className="p-4 fade-up">
    <div className="text-xl font-extrabold mb-3">המשימות שלי</div>
    <div className="flex gap-3 overflow-x-auto pb-3">
      {COLS.map(col => {
        const colTasks = tasks.filter(t=>t.status===col.key)
        return <div key={col.key} style={{background:col.bg,borderColor:col.border}} className="border rounded-[14px] p-3 min-w-[200px] w-52 flex-shrink-0">
          <div style={{color:col.fg}} className="text-xs font-bold mb-3 flex items-center justify-between">
            {col.label} <span className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center text-xs">{colTasks.length}</span>
          </div>
          <div className="space-y-2">
            {colTasks.map(t=>{
              const late = t.due_date && t.due_date.slice(0,10)<today && t.status!=="done"
              const accent = late?"#960010":col.key==="waiting"?"#B45309":col.key==="done"?"#166534":"#00488D"
              return <div key={t.id} style={{borderRight:`3px solid ${accent}`}} className="bg-white border border-[#E2E8F0] rounded-[11px] p-3">
                <div className="text-xs font-semibold mb-1.5">{t.title}</div>
                {t.due_date&&<div style={{color:accent}} className="text-xs font-semibold mb-2">{late?"⚠ ":""}{fd(t.due_date.slice(0,10))}</div>}
                <div className="grid grid-cols-2 gap-1">
                  {COLS.filter(c=>c.key!==col.key).slice(0,2).map(nc=><button key={nc.key} onClick={()=>move(t.id,nc.key)} style={{color:nc.fg,background:nc.bg,borderColor:nc.border}} className="border rounded-[7px] text-xs py-1 font-semibold">
                    {nc.key==="done"?"✓ בוצע":nc.key==="inprogress"?"▶ התחל":nc.key==="waiting"?"⏳ ממתין":"← חזור"}
                  </button>)}
                </div>
              </div>
            })}
            {colTasks.length===0&&<div className="text-xs text-[#94A3B8] text-center py-2">ריק</div>}
          </div>
        </div>
      })}
    </div>
  </div>
}