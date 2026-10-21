"use client"
import Badge from "@/components/ui/Badge"
import { ST, MONTHS_HE } from "./shared"

/**
 * One event card with stats, budget bar and action buttons. The admin
 * passes `onApprove` and selection props; the coordinator omits them.
 */
export default function EventCard({ e, spent, isEditing, isResults, selected, onToggleSelect, onEdit, onResults, onApprove, onManage, onDuplicate, onDelete, showCoordinator }: {
  e: any
  spent: number
  isEditing: boolean
  isResults: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onEdit: () => void
  onResults: () => void
  onApprove?: () => void
  onManage: () => void
  onDuplicate: () => void
  onDelete: () => void
  showCoordinator?: boolean
}) {
  const bp = e.budget_planned>0 ? Math.round(spent/e.budget_planned*100) : 0
  const realLeads = e.leads_from_event>0 ? e.leads_from_event : (e.leads_collected||0)
  const roi = realLeads>0&&spent>0 ? Math.round(spent/realLeads) : null
  const today = new Date().toISOString().slice(0,10)
  const isPast = e.date && e.date<today && e.status!=="done" && e.status!=="cancelled"
  const pendingApproval = !e.approved && e.status==="pending_approval"

  return (
    <div className={`bg-white border rounded-[14px] transition-all ${isEditing?"border-[#00488D] shadow-md":isResults?"border-[#166534] shadow-md":selected?"border-[#00488D] bg-[#F0F7FF]":isPast?"border-[#FDE68A]":"border-[#E2E8F0] hover:border-[#CBD5E1]"}`}>
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-3 mb-3">
          {onToggleSelect && (
            <input type="checkbox" checked={!!selected} onClick={ev=>ev.stopPropagation()} onChange={onToggleSelect}
              className="accent-[#00488D] w-4 h-4 mt-1 flex-shrink-0"/>
          )}
          {e.date && <div className="text-center flex-shrink-0 w-12 bg-[#F0F7FF] rounded-[10px] py-2">
            <div className="text-base font-extrabold leading-none text-[#0D2744]">{new Date(e.date).getDate()}</div>
            <div className="text-[10px] text-[#64748B]">{MONTHS_HE[new Date(e.date).getMonth()]}</div>
          </div>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-base font-bold text-[#0D2744]">{e.name}</div>
              {isPast && <span className="text-[10px] px-2 py-0.5 bg-[#FEF3C7] text-[#B45309] rounded-full font-semibold">⏰ דורש עדכון תוצאות</span>}
              {e.status==="done" && <span className="text-[10px] px-2 py-0.5 bg-[#DCFCE7] text-[#166534] rounded-full font-semibold">✓ בוצע</span>}
            </div>
            <div className="text-xs text-[#64748B] mt-0.5 flex gap-2 flex-wrap">
              {e.time && <span>🕐 {e.time}</span>}
              {e.location && <span>📍 {e.location}</span>}
              {e.partner_name && <span>🤝 {e.partner_name}</span>}
              {showCoordinator && e.coordinator_name && <span>👤 {e.coordinator_name}</span>}
              {e.waitlist_count>0 && <span className="text-[#B45309]">⏳ {e.waitlist_count} בהמתנה</span>}
            </div>
          </div>
          <Badge text={ST[e.status]||e.status}/>
        </div>

        {pendingApproval && !onApprove && (
          <div className="flex items-center gap-2 text-xs text-[#B45309] bg-[#FEF3C7] rounded-[8px] px-3 py-2 mb-3">⏳ מחכה לאישור המנהל</div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
            <div className="text-sm font-bold">₪{(+e.budget_planned||0).toLocaleString()}</div>
            <div className="text-[10px] text-[#64748B]">תקציב</div>
          </div>
          <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
            <div className="text-sm font-bold">{e.target_attendees||0}
              {(e.attendee_count>0||e.actual_attendees>0) && <span className="text-[#166534]">/{e.attendee_count||e.actual_attendees}</span>}
            </div>
            <div className="text-[10px] text-[#64748B]">יעד/בפועל</div>
          </div>
          <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
            <div className="text-sm font-bold text-[#00488D]">{realLeads}</div>
            <div className="text-[10px] text-[#64748B]">{e.leads_from_event>0?"לידים ✓":"לידים"}</div>
          </div>
          <div className="bg-[#F8FAFC] rounded-[9px] p-2 text-center">
            <div className="text-sm font-bold">{roi?`₪${roi}`:"—"}</div>
            <div className="text-[10px] text-[#64748B]">עלות/ליד</div>
          </div>
        </div>

        {/* Budget bar */}
        {e.budget_planned>0 && <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#64748B]">ניצול תקציב · ₪{spent.toLocaleString()} מתוך ₪{(+e.budget_planned).toLocaleString()}</span>
            <span style={{color:bp>90?"#960010":bp>70?"#B45309":"#64748B"}} className="font-semibold">{bp}%</span>
          </div>
          <div className="h-1.5 bg-[#F0F4F8] rounded-full overflow-hidden">
            <div style={{width:`${Math.min(bp,100)}%`,background:bp>90?"#960010":bp>70?"#B45309":"#00488D"}} className="h-full rounded-full transition-all"/>
          </div>
        </div>}

        {e.summary && <div className="text-xs text-[#475569] bg-[#F9FAFB] rounded-[9px] p-3 mb-3">📝 {e.summary}</div>}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={onEdit}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${isEditing?"bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]":"border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE]"}`}>
            ✎ עריכה
          </button>
          <button onClick={onResults}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${isResults?"bg-[#DCFCE7] border-[#BBF7D0] text-[#166534]":isPast?"bg-[#FEF3C7] border-[#FDE68A] text-[#B45309] animate-pulse":"border-[#E2E8F0] hover:bg-[#F0FFF4] hover:border-[#BBF7D0] hover:text-[#166534]"}`}>
            📊 עדכון תוצאות
          </button>
          {onApprove && pendingApproval && (
            <button onClick={onApprove} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0] hover:bg-[#BBF7D0] transition-colors">
              ✓ אשר אירוע
            </button>
          )}
          <button onClick={onManage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
            👥 ניהול{e.checked_in_count>0?` (${e.checked_in_count} הגיעו)`:""}
          </button>
          <button onClick={onDuplicate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE] transition-colors">
            ⧉ שכפל
          </button>
          <button onClick={onDelete} className="mr-auto flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] text-[#94A3B8] hover:bg-[#FFF0F0] hover:text-[#960010] hover:border-[#FECACA] transition-colors">
            ✕ מחק
          </button>
        </div>
      </div>
    </div>
  )
}
