"use client"
import { useEffect, useState } from "react"
import Modal from "@/components/ui/Modal"
import { useToast } from "@/components/ui/Toast"
import { EMPTY_ATTENDEE, EMPTY_VENDOR, VENDOR_CATEGORIES, InputClass } from "./shared"

/**
 * Attendees + vendors management for one event. Owns its own fetching so
 * the admin and coordinator screens only pass the event and a reload
 * callback (counts shown on the card change when attendees change).
 */
export default function EventManageModal({ event, onClose, onChanged }: {
  event: any | null
  onClose: () => void
  onChanged: () => void
}) {
  const { success } = useToast()
  const [tab, setTab] = useState<"attendees"|"vendors">("attendees")
  const [attendees, setAttendees] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [newAttendee, setNewAttendee] = useState({...EMPTY_ATTENDEE})
  const [newVendor, setNewVendor] = useState({...EMPTY_VENDOR})
  const [busy, setBusy] = useState(false)
  const id = event?.id ?? null

  async function reload() {
    if (!id) return
    const [ar, vr] = await Promise.all([fetch(`/api/events/${id}/attendees`), fetch(`/api/events/${id}/vendors`)])
    setAttendees((await ar.json()).attendees||[])
    setVendors((await vr.json()).vendors||[])
  }
  useEffect(() => {
    if (!id) return
    setTab("attendees"); setNewAttendee({...EMPTY_ATTENDEE}); setNewVendor({...EMPTY_VENDOR})
    reload()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addAttendee() {
    if (!id || !newAttendee.name.trim()) return
    setBusy(true)
    const res = await fetch(`/api/events/${id}/attendees`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(newAttendee)})
    const d = await res.json()
    setBusy(false); setNewAttendee({...EMPTY_ATTENDEE})
    if (d.waitlisted) success("נוסף לרשימת המתנה — הקיבולת מלאה")
    reload(); onChanged()
  }
  async function toggleCheckin(a: any) {
    await fetch(`/api/events/${id}/attendees`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id, checked_in: !a.checked_in})})
    setAttendees(list=>list.map(x=>x.id===a.id?{...x,checked_in:!x.checked_in}:x))
    onChanged()
  }
  async function promoteAttendee(a: any) {
    await fetch(`/api/events/${id}/attendees`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id, promote:true})})
    reload(); onChanged()
  }
  async function removeAttendee(aid: number) {
    await fetch(`/api/events/${id}/attendees`, {method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:aid})})
    setAttendees(list=>list.filter(x=>x.id!==aid)); onChanged()
  }
  async function addVendor() {
    if (!id || !newVendor.name.trim()) return
    setBusy(true)
    await fetch(`/api/events/${id}/vendors`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...newVendor, amount:+newVendor.amount||0})})
    setBusy(false); setNewVendor({...EMPTY_VENDOR})
    reload()
  }
  async function toggleDeposit(v: any) {
    await fetch(`/api/events/${id}/vendors`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...v, deposit_paid:!v.deposit_paid})})
    setVendors(list=>list.map(x=>x.id===v.id?{...x,deposit_paid:!x.deposit_paid}:x))
  }
  async function removeVendor(vid: number) {
    await fetch(`/api/events/${id}/vendors`, {method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:vid})})
    setVendors(list=>list.filter(x=>x.id!==vid))
  }

  return (
    <Modal open={event!==null} onClose={onClose} title={`👥 ניהול — ${event?.name||""}`} width="560px">
      <div className="flex gap-2 p-1 bg-[#F0F4F8] rounded-[10px] mb-3">
        <button onClick={()=>setTab("attendees")} className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${tab==="attendees"?"bg-white text-[#0D2744] shadow-sm":"text-[#64748B]"}`}>נרשמים ({attendees.length})</button>
        <button onClick={()=>setTab("vendors")} className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${tab==="vendors"?"bg-white text-[#0D2744] shadow-sm":"text-[#64748B]"}`}>ספקים ({vendors.length})</button>
      </div>

      {tab === "attendees" ? <>
        <div className="flex gap-2 mb-3">
          <input value={newAttendee.name} onChange={e=>setNewAttendee(a=>({...a,name:e.target.value}))} placeholder="שם *" className={InputClass}/>
          <input value={newAttendee.phone} onChange={e=>setNewAttendee(a=>({...a,phone:e.target.value}))} placeholder="טלפון" className={InputClass}/>
          <button onClick={addAttendee} disabled={busy||!newAttendee.name.trim()} className="px-3 py-2 bg-[#0D2744] text-white rounded-[9px] text-sm font-bold disabled:opacity-50 whitespace-nowrap">+ הוסף</button>
        </div>
        {attendees.length===0 ? <div className="text-xs text-[#94A3B8] text-center py-4">אין עדיין נרשמים</div> : (
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {attendees.map((a:any)=>(
              <div key={a.id} className={`flex items-center gap-2 px-3 py-2 rounded-[9px] border ${a.waitlisted?"border-[#FDE68A] bg-[#FFFBEB]":"border-[#E2E8F0]"}`}>
                <input type="checkbox" checked={a.checked_in} disabled={a.waitlisted} onChange={()=>toggleCheckin(a)} className="accent-[#166534] w-4 h-4"/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="text-xs text-[#94A3B8]">{a.phone}{a.waitlisted?" · ברשימת המתנה":a.checked_in?" · הגיע/ה ✓":""}</div>
                </div>
                {a.waitlisted && <button onClick={()=>promoteAttendee(a)} className="text-xs px-2 py-1 rounded-[6px] border border-[#00488D] text-[#00488D]">קדם</button>}
                <button onClick={()=>removeAttendee(a.id)} className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] text-[#94A3B8] hover:text-[#960010]">✕</button>
              </div>
            ))}
          </div>
        )}
      </> : <>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={newVendor.name} onChange={e=>setNewVendor(v=>({...v,name:e.target.value}))} placeholder="שם ספק *" className={InputClass}/>
          <select value={newVendor.category} onChange={e=>setNewVendor(v=>({...v,category:e.target.value}))} className={InputClass+" bg-white"}>
            {Object.entries(VENDOR_CATEGORIES).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <input value={newVendor.contact} onChange={e=>setNewVendor(v=>({...v,contact:e.target.value}))} placeholder="איש קשר / טלפון" className={InputClass}/>
          <input type="number" value={newVendor.amount} onChange={e=>setNewVendor(v=>({...v,amount:e.target.value}))} placeholder="סכום (₪)" className={InputClass}/>
        </div>
        <button onClick={addVendor} disabled={busy||!newVendor.name.trim()} className="w-full py-2 bg-[#0D2744] text-white rounded-[9px] text-sm font-bold disabled:opacity-50 mb-3">+ הוסף ספק</button>
        {vendors.length===0 ? <div className="text-xs text-[#94A3B8] text-center py-4">אין עדיין ספקים</div> : (
          <div className="space-y-1.5">
            {vendors.map((v:any)=>(
              <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-[9px] border border-[#E2E8F0]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{v.name} <span className="text-xs text-[#94A3B8]">· {VENDOR_CATEGORIES[v.category]||v.category}</span></div>
                  <div className="text-xs text-[#94A3B8]">{v.contact}{v.amount>0?` · ₪${(+v.amount).toLocaleString()}`:""}</div>
                </div>
                <label className="flex items-center gap-1 text-xs text-[#64748B]">
                  <input type="checkbox" checked={v.deposit_paid} onChange={()=>toggleDeposit(v)} className="accent-[#166534] w-3.5 h-3.5"/> מקדמה שולמה
                </label>
                <button onClick={()=>removeVendor(v.id)} className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] text-[#94A3B8] hover:text-[#960010]">✕</button>
              </div>
            ))}
          </div>
        )}
      </>}
    </Modal>
  )
}
