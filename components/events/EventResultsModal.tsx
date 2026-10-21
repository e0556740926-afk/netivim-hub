"use client"
import Modal from "@/components/ui/Modal"
import Button from "@/components/ui/Button"
import { fd } from "@/lib/utils"
import { type ResultsForm } from "./shared"

/** Post-event debrief (תחקיר): actual numbers, summary, optional follow-up task. Shared by admin and coordinator. */
export default function EventResultsModal({ event, results, setResults, saving, onSave, onClose }: {
  event: any | null
  results: ResultsForm
  setResults: (fn: (r: ResultsForm) => ResultsForm) => void
  saving: boolean
  onSave: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={event !== null}
      onClose={onClose}
      title={`📊 עדכון תוצאות — ${event?.name||""}`}
      subtitle={event ? `${fd(event.date)} · ${event.location||""}` : undefined}
      accent="#166534"
      footer={<>
        <Button onClick={()=>event&&onSave()} disabled={saving}>{saving?"שומר...":"שמור תוצאות ✓"}</Button>
        <Button variant="secondary" onClick={onClose}>ביטול</Button>
      </>}
    >
      {event && <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-[#F0F4F8] rounded-[11px] p-3">
            <div className="text-xs font-bold text-[#64748B] mb-2">יעדים מקוריים</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-[#64748B]">משתתפים יעד</span><span className="font-bold">{event.target_attendees||0}</span></div>
              <div className="flex justify-between text-sm"><span className="text-[#64748B]">תקציב</span><span className="font-bold">₪{(+event.budget_planned||0).toLocaleString()}</span></div>
            </div>
          </div>
          <div className="bg-[#F0FFF4] border border-[#BBF7D0] rounded-[11px] p-3">
            <div className="text-xs font-bold text-[#166534] mb-2">תוצאות בפועל</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm items-center">
                <span className="text-[#64748B]">משתתפים</span>
                <input type="number" value={results.actual_attendees} onChange={e=>setResults(r=>({...r,actual_attendees:e.target.value}))}
                  className="w-20 px-2 py-0.5 border border-[#BBF7D0] rounded-[7px] text-sm text-center focus:outline-none focus:border-[#166534] font-bold" placeholder="0"/>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-[#64748B]">לידים (תיקון ידני)</span>
                <input type="number" value={results.leads_collected} onChange={e=>setResults(r=>({...r,leads_collected:e.target.value}))}
                  className="w-20 px-2 py-0.5 border border-[#BBF7D0] rounded-[7px] text-sm text-center focus:outline-none focus:border-[#166534] font-bold text-[#00488D]" placeholder="0"/>
              </div>
              <div className="text-[10px] text-[#64748B] text-left pt-1">
                {event.leads_from_event > 0
                  ? <>המערכת סופרת <b className="text-[#00488D]">{event.leads_from_event}</b> לידים אמיתיים המשויכים לאירוע — זה מה שיוצג ברשימה, אין צורך למלא ידנית.</>
                  : "אין עדיין לידים משויכים לאירוע זה (event_id) — השדה כאן משמש רק כגיבוי ידני."}
              </div>
            </div>
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs font-semibold block mb-1">סיכום האירוע</label>
          <textarea value={results.summary} onChange={e=>setResults(r=>({...r,summary:e.target.value}))} rows={3}
            placeholder="מה הלך טוב? מה ניתן לשפר? תובנות לאירוע הבא..."
            className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm resize-none focus:outline-none focus:border-[#166534]"/>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">
            משימת מעקב <span className="text-[#64748B] font-normal">(תיצור משימה אוטומטית — אופציונלי)</span>
          </label>
          <input value={results.follow_up} onChange={e=>setResults(r=>({...r,follow_up:e.target.value}))}
            placeholder='לדוגמה: "ליצור קשר עם 31 הלידים תוך 3 ימים"'
            className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#166534]"/>
        </div>
      </>}
    </Modal>
  )
}
