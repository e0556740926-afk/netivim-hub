"use client"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Card from "@/components/ui/Card"

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [open, setOpen] = useState<number|null>(null)
  const [filter, setFilter] = useState("")

  useEffect(() => {
    fetch("/api/reports").then(r=>r.json()).then(d=>setReports(d.reports||[]))
  }, [])

  const filtered = filter ? reports.filter(r=>r.coordinator_name===filter) : reports
  const names = [...new Set(reports.map((r:any)=>r.coordinator_name))]

  return <div className="p-6 md:p-8 fade-up">
    <h1 className="text-2xl font-extrabold text-[#0D2744] mb-1">דיווחים שבועיים</h1>
    <div className="text-sm text-[#64748B] mb-5">{reports.length} דיווחים</div>

    <div className="flex gap-2 mb-5">
      <select value={filter} onChange={e=>setFilter(e.target.value)} className="px-3 py-2 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
        <option value="">כל הרכזים</option>
        {names.map(n=><option key={n as string} value={n as string}>{n as string}</option>)}
      </select>
      <span className="text-xs text-[#94A3B8] self-center">{filtered.length} דיווחים</span>
    </div>

    <div className="space-y-3">
      {filtered.map(r=>{
        const isOpen = open===r.id
        return <Card key={r.id}>
          <div onClick={()=>setOpen(isOpen?null:r.id)} className="p-4 flex items-center gap-4 cursor-pointer hover:bg-[#F8FAFC] transition-colors">
            <div className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">
              {(r.coordinator_name||"").split(" ").map((w:string)=>w[0]).join("")}
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">{r.coordinator_name}</div>
              <div className="text-xs text-[#64748B]">שבוע {fd(r.week_start)} · {r.area}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-[#00488D]">{r.leads_count} לידים</div>
              <div className="text-xs text-[#64748B]">{new Date(r.submitted_at).toLocaleDateString("he-IL")}</div>
            </div>
            <span className="text-[#94A3B8] text-sm">{isOpen?"▲":"▼"}</span>
          </div>
          {isOpen && <div className="border-t border-[#E2E8F0] p-4 bg-[#F8FAFC] grid grid-cols-2 gap-4">
            <div><div className="text-xs font-bold text-[#374151] mb-1">הישגים מרכזיים</div>
              <div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.achievements||"—"}</div></div>
            <div><div className="text-xs font-bold text-[#374151] mb-1">אתגרים וחסמים</div>
              <div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.challenges||"—"}</div></div>
            <div className="col-span-2"><div className="text-xs font-bold text-[#374151] mb-1">תכנון שבוע הבא</div>
              <div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.next_week_plan||"—"}</div></div>
          </div>}
        </Card>
      })}
      {filtered.length===0 && <div className="text-center py-12 text-sm text-[#94A3B8]">אין דיווחים עדיין</div>}
    </div>
  </div>
}