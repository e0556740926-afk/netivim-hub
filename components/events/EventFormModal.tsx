"use client"
import Modal from "@/components/ui/Modal"
import Button from "@/components/ui/Button"
import { STATUS_OPTIONS, COORD_STATUS_OPTIONS, InputClass, type EventForm } from "./shared"

/**
 * New/edit event form, shared by admin and coordinator screens.
 * `mode="coord"` hides the manager-only controls (approved flag, the
 * approved/marketing statuses) and labels the budget as a request.
 */
export default function EventFormModal({ open, onClose, editEvent, form, setForm, contacts, saving, onSave, mode = "admin" }: {
  open: boolean
  onClose: () => void
  editEvent: any | null
  form: EventForm
  setForm: (fn: (f: EventForm) => EventForm) => void
  contacts: any[]
  saving: boolean
  onSave: () => void
  mode?: "admin" | "coord"
}) {
  const coord = mode === "coord"
  // A coordinator can't put an event into an approved-only status; once
  // a manager approved it they can still close it out (done/cancelled).
  const statusOptions = !coord ? STATUS_OPTIONS
    : editEvent?.approved
      ? STATUS_OPTIONS.filter(s => s.v === editEvent.status || s.v === "done" || s.v === "cancelled")
      : COORD_STATUS_OPTIONS
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editEvent ? `✎ עריכת אירוע — ${editEvent.name||""}` : (coord ? "הצעת אירוע חדש" : "אירוע חדש")}
      footer={<>
        <Button onClick={onSave} disabled={saving}>{saving?"שומר...":editEvent?"שמור שינויים":coord?"שלח לאישור":"שמור שינויים"}</Button>
        <Button variant="secondary" onClick={onClose}>ביטול</Button>
      </>}
    >
      {coord && !editEvent && <div className="text-xs text-[#B45309] bg-[#FEF3C7] rounded-[8px] px-3 py-2 mb-3">האירוע יישלח לאישור המנהל לפני הביצוע</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold block mb-1">שם האירוע *</label>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className={InputClass} placeholder="לדוגמה: יריד תעסוקה בני ברק"/>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">תאריך</label>
          <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className={InputClass}/>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">שעה</label>
          <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} className={InputClass}/>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold block mb-1">מיקום</label>
          <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} className={InputClass} placeholder="עיר / אולם"/>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{coord ? "תקציב מבוקש (₪)" : "תקציב מתוכנן (₪)"}</label>
          <input type="number" value={form.budget_planned} onChange={e=>setForm(f=>({...f,budget_planned:e.target.value}))} className={InputClass} placeholder="0"/>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">יעד משתתפים</label>
          <input type="number" value={form.target_attendees} onChange={e=>setForm(f=>({...f,target_attendees:e.target.value}))} className={InputClass} placeholder="0"/>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">קיבולת מקסימלית (לא חובה)</label>
          <input type="number" value={form.capacity} onChange={e=>setForm(f=>({...f,capacity:e.target.value}))} className={InputClass} placeholder="ללא הגבלה"/>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">שותף מארח (לא חובה)</label>
          <select value={form.partner_contact_id} onChange={e=>setForm(f=>({...f,partner_contact_id:e.target.value}))} className={InputClass+" bg-white"}>
            <option value="">— ללא —</option>
            {contacts.map((c:any)=><option key={c.id} value={c.id}>{c.name}{c.org?` · ${c.org}`:""}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">סטטוס</label>
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className={InputClass+" bg-white"}>
            {statusOptions.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
          {coord && editEvent?.approved && <div className="text-[10px] text-[#166534] mt-1">✓ אושר ע"י מנהל</div>}
        </div>
        {!coord && (
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={form.approved} onChange={e=>setForm(f=>({...f,approved:e.target.checked}))} className="accent-[#00488D] w-4 h-4"/>
            <label className="text-sm font-medium text-[#374151]">מאושר על ידי הנהלה</label>
          </div>
        )}
      </div>
      {editEvent?.slug && (
        <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex items-center gap-3">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&margin=6&data=${encodeURIComponent(`${typeof window!=="undefined"?window.location.origin:""}/j/event/${editEvent.slug}`)}`}
            alt="QR לקליטת לידים" width={64} height={64} className="rounded-[8px] flex-shrink-0"/>
          <div className="text-xs text-[#64748B] leading-relaxed">
            קישור לקליטת לידים באירוע — לידים שנכנסים דרכו מתויגים אוטומטית לאירוע הזה.
            <div className="font-mono text-[#00488D] mt-1 break-all">/j/event/{editEvent.slug}</div>
          </div>
        </div>
      )}
    </Modal>
  )
}
