"use client"
import Modal from "@/components/ui/Modal"

/** Aggregate performance view. The API scopes a coordinator to their own events, so the same component serves both screens. */
export default function EventInsightsModal({ open, onClose, insights, mode = "admin" }: {
  open: boolean
  onClose: () => void
  insights: any | null
  mode?: "admin" | "coord"
}) {
  return (
    <Modal open={open} onClose={onClose} title={mode === "coord" ? "📊 הביצועים שלי — מצטבר" : "📊 ביצועי אירועים — מצטבר"} width="640px">
      {!insights ? <div className="text-sm text-[#94A3B8] text-center py-6">טוען...</div> : <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="bg-[#f7f9f5] rounded-[10px] p-3 text-center"><div className="text-lg font-extrabold">{insights.totals.events}</div><div className="text-[10px] text-[#63756b]">אירועים שבוצעו</div></div>
          <div className="bg-[#f7f9f5] rounded-[10px] p-3 text-center"><div className="text-lg font-extrabold text-[#28634e]">{insights.totals.leads}</div><div className="text-[10px] text-[#63756b]">לידים סה"כ</div></div>
          <div className="bg-[#f7f9f5] rounded-[10px] p-3 text-center"><div className="text-lg font-extrabold">₪{insights.totals.spent.toLocaleString()}</div><div className="text-[10px] text-[#63756b]">הוצאה כוללת</div></div>
          <div className="bg-[#f7f9f5] rounded-[10px] p-3 text-center"><div className="text-lg font-extrabold text-[#28634e]">{insights.totals.costPerLead?`₪${insights.totals.costPerLead}`:"—"}</div><div className="text-[10px] text-[#63756b]">עלות/ליד ממוצעת</div></div>
        </div>
        <div className="text-xs font-bold mb-2">מגמה חודשית (אירועים שבוצעו)</div>
        <div className="space-y-1.5 mb-4">
          {insights.byMonth.length===0 && <div className="text-xs text-[#94A3B8]">אין עדיין אירועים שבוצעו</div>}
          {insights.byMonth.map((m:any)=>(
            <div key={m.month} className="flex items-center gap-2 text-xs">
              <div className="w-16 text-[#63756b]">{m.month}</div>
              <div className="flex-1 h-2 bg-[#f4f6f2] rounded-full overflow-hidden"><div style={{width:`${Math.min(100,m.leads*5)}%`}} className="h-full bg-[#5B21B6] rounded-full"/></div>
              <div className="w-20 text-left font-semibold">{m.leads} לידים · {m.events} אירועים</div>
            </div>
          ))}
        </div>
        {mode === "admin" && <>
          <div className="text-xs font-bold mb-2">לפי רכז (אירועים שבוצעו)</div>
          <div className="space-y-1">
            {insights.byCoordinator.filter((c:any)=>c.coordinator_name).map((c:any)=>(
              <div key={c.coordinator_name} className="flex items-center justify-between text-xs py-1 border-b border-[#edf1e9] last:border-0">
                <span className="font-medium">{c.coordinator_name}</span>
                <span className="text-[#63756b]">{c.events} אירועים · <b className="text-[#28634e]">{c.leads}</b> לידים</span>
              </div>
            ))}
          </div>
        </>}
      </>}
    </Modal>
  )
}
