"use client"
import { useEffect, useRef, useState } from "react"
import { uiRequest, uiMutation } from "@/lib/ui-request"
import Button from "@/components/ui/Button"
import Modal from "@/components/ui/Modal"
import { useToast } from "@/components/ui/Toast"
import { EMPTY_ATTENDEE, EMPTY_VENDOR, VENDOR_CATEGORIES, InputClass } from "./shared"
import EventRegistrationBuilder from './EventRegistrationBuilder'

/**
 * Attendees + vendors management for one event. Owns its own fetching so
 * the admin and coordinator screens only pass the event and a reload
 * callback (counts shown on the card change when attendees change).
 */
export default function EventManageModal({ event, onClose, onChanged, initialTab='attendees' }: {
  event: any | null
  onClose: () => void
  onChanged: () => void
  initialTab?:'attendees'|'registration'
}) {
  const { success, error: showError } = useToast()
  const [tab, setTab] = useState<"attendees"|"vendors"|"registration">(initialTab)
  const [attendees, setAttendees] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [newAttendee, setNewAttendee] = useState({...EMPTY_ATTENDEE})
  const [newVendor, setNewVendor] = useState({...EMPTY_VENDOR})
  const [busy, setBusy] = useState(false)
  const [loading,setLoading] = useState(false)
  const [loadError,setLoadError] = useState(false)
  const [confirmDelete,setConfirmDelete] = useState<{kind:"attendee"|"vendor";id:number;name:string}|null>(null)
  const id = event?.id ?? null
  const loadVersion=useRef(0)

  async function reload() {
    if(!id)return
    const version=++loadVersion.current
    setLoading(true);setLoadError(false)
    try { const [a,v]=await Promise.all([uiRequest(`/api/events/${id}/attendees`),uiRequest(`/api/events/${id}/vendors`)]);if(version===loadVersion.current){setAttendees(a.attendees||[]);setVendors(v.vendors||[])} }
    catch {if(version===loadVersion.current)setLoadError(true)}finally{if(version===loadVersion.current)setLoading(false)}
  }
  useEffect(()=>{setAttendees([]);setVendors([]);setTab(initialTab);setNewAttendee({...EMPTY_ATTENDEE});setNewVendor({...EMPTY_VENDOR});setConfirmDelete(null);if(id)reload();return()=>{loadVersion.current++}},[id,initialTab]) // eslint-disable-line react-hooks/exhaustive-deps
  async function act(run:()=>Promise<void>) {
    if(busy)return
    setBusy(true)
    try{await run()}catch(e){showError(e instanceof Error?e.message:"הפעולה לא הושלמה")}
    finally{setBusy(false)}
  }
  function addAttendee(){if(!id||!newAttendee.name.trim())return;act(async()=>{
    const d=await uiMutation(`/api/events/${id}/attendees`,"POST",newAttendee)
    setNewAttendee({...EMPTY_ATTENDEE});success(d.waitlisted?"נוסף לרשימת המתנה — הקיבולת מלאה":"המשתתף נוסף");await reload();onChanged()
  })}
  function toggleCheckin(a:any){act(async()=>{await uiMutation(`/api/events/${id}/attendees`,"PATCH",{id:a.id,checked_in:!a.checked_in});setAttendees(list=>list.map(x=>x.id===a.id?{...x,checked_in:!x.checked_in}:x));onChanged()})}
  function promoteAttendee(a:any){act(async()=>{await uiMutation(`/api/events/${id}/attendees`,"PATCH",{id:a.id,promote:true});await reload();onChanged()})}
  function addVendor(){if(!id||!newVendor.name.trim())return;act(async()=>{
    await uiMutation(`/api/events/${id}/vendors`,"POST",{...newVendor,amount:+newVendor.amount||0});setNewVendor({...EMPTY_VENDOR});success("הספק נוסף");await reload()
  })}
  function toggleDeposit(v:any){act(async()=>{await uiMutation(`/api/events/${id}/vendors`,"PATCH",{...v,deposit_paid:!v.deposit_paid});setVendors(list=>list.map(x=>x.id===v.id?{...x,deposit_paid:!x.deposit_paid}:x))})}
  function removeConfirmed(){if(!confirmDelete)return;const target=confirmDelete;act(async()=>{
    await uiMutation(`/api/events/${id}/${target.kind==="vendor"?"vendors":"attendees"}`,"DELETE",{id:target.id})
    if(target.kind==="vendor")setVendors(list=>list.filter(v=>v.id!==target.id));else{setAttendees(list=>list.filter(a=>a.id!==target.id));onChanged()}
    setConfirmDelete(null);success("הרשומה נמחקה")
  })}

  return (
    <><Modal open={event!==null} onClose={()=>{if(!busy)onClose()}} title={`ניהול אירוע · ${event?.name||""}`} width={tab==='registration'?'1050px':'700px'}>
      {loadError&&<div className="ui-error" role="alert">לא ניתן לטעון את הרשומות. <button className="underline" onClick={reload}>ניסיון נוסף</button></div>}
      {loading&&<p className="ui-note mb-3" role="status">טוען רשומות…</p>}
      <div className="flex gap-2 p-1 bg-[#f4f6f2] rounded-[10px] mb-3">
        <button onClick={()=>setTab("attendees")} className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${tab==="attendees"?"bg-white text-[#193d33] shadow-sm":"text-[#63756b]"}`}>נרשמים ({attendees.length})</button>
        <button onClick={()=>setTab("vendors")} className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${tab==="vendors"?"bg-white text-[#193d33] shadow-sm":"text-[#63756b]"}`}>ספקים ({vendors.length})</button>
        <button onClick={()=>setTab('registration')} className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${tab==='registration'?'bg-white text-[#193d33] shadow-sm':'text-[#63756b]'}`}>טופס רישום</button>
      </div>

      {tab==='registration'&&event?<EventRegistrationBuilder key={event.id} event={event}/>:tab === "attendees" ? <>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mb-3">
          <input value={newAttendee.name} onChange={e=>setNewAttendee(a=>({...a,name:e.target.value}))} placeholder="שם *" className={InputClass}/>
          <input value={newAttendee.phone} onChange={e=>setNewAttendee(a=>({...a,phone:e.target.value}))} placeholder="טלפון" className={InputClass}/>
          <button onClick={addAttendee} disabled={busy||!newAttendee.name.trim()} className="px-3 py-2 bg-[#193d33] text-white rounded-[9px] text-sm font-bold disabled:opacity-50 whitespace-nowrap">+ הוסף</button>
        </div>
        {attendees.length===0 ? <div className="text-xs text-[#94A3B8] text-center py-4">אין עדיין נרשמים</div> : (
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {attendees.map((a:any)=>(
              <div key={a.id} className={`flex items-center gap-2 px-3 py-2 rounded-[9px] border ${a.waitlisted?"border-[#FDE68A] bg-[#FFFBEB]":"border-[#e1e8df]"}`}>
                <input type="checkbox" checked={a.checked_in} disabled={a.waitlisted||busy} aria-label={`סימון הגעה של ${a.name}`} onChange={()=>toggleCheckin(a)} className="accent-[#28634e] w-4 h-4"/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="text-xs text-[#94A3B8]">{a.phone}{a.waitlisted?" · ברשימת המתנה":a.checked_in?" · הגיע/ה ✓":""}</div>
                  {a.source==='registration'&&<div className="text-xs text-[#28634e]">נרשם דרך הטופס · {a.created_at?new Date(a.created_at).toLocaleString('he-IL'):''}</div>}
                  {a.registration_fields?.length>0&&<details className="er-attendee-answers"><summary>פרטי ההרשמה</summary><dl>{a.registration_fields.map((f:any)=><div key={f.id}><dt>{f.label}</dt><dd>{typeof a.registration_answers?.[f.id]==='boolean'?(a.registration_answers[f.id]?'כן':'לא'):String(a.registration_answers?.[f.id]||'—')}</dd></div>)}</dl></details>}
                </div>
                {a.waitlisted && <button disabled={busy} onClick={()=>promoteAttendee(a)} className="text-xs px-2 py-1 rounded-[6px] border border-[#28634e] text-[#28634e]">קדם</button>}
                <button disabled={busy} aria-label={`מחיקת המשתתף ${a.name}`} onClick={()=>setConfirmDelete({kind:"attendee",id:a.id,name:a.name})} className="text-xs px-2 py-1 rounded-[6px] border border-[#e1e8df] text-[#94A3B8] hover:text-[#a74450]">✕</button>
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
        <button onClick={addVendor} disabled={busy||!newVendor.name.trim()} className="w-full py-2 bg-[#193d33] text-white rounded-[9px] text-sm font-bold disabled:opacity-50 mb-3">+ הוסף ספק</button>
        {vendors.length===0 ? <div className="text-xs text-[#94A3B8] text-center py-4">אין עדיין ספקים</div> : (
          <div className="space-y-1.5">
            {vendors.map((v:any)=>(
              <div key={v.id} className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-[9px] border border-[#e1e8df]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{v.name} <span className="text-xs text-[#94A3B8]">· {VENDOR_CATEGORIES[v.category]||v.category}</span></div>
                  <div className="text-xs text-[#94A3B8]">{v.contact}{v.amount>0?` · ₪${(+v.amount).toLocaleString()}`:""}</div>
                </div>
                <label className="flex items-center gap-1 text-xs text-[#63756b]">
                  <input type="checkbox" checked={v.deposit_paid} disabled={busy} onChange={()=>toggleDeposit(v)} className="accent-[#28634e] w-3.5 h-3.5"/> מקדמה שולמה
                </label>
                <button disabled={busy} aria-label={`מחיקת הספק ${v.name}`} onClick={()=>setConfirmDelete({kind:"vendor",id:v.id,name:v.name})} className="text-xs px-2 py-1 rounded-[6px] border border-[#e1e8df] text-[#94A3B8] hover:text-[#a74450]">✕</button>
              </div>
            ))}
          </div>
        )}
      </>}
    </Modal>
    <Modal open={!!confirmDelete} onClose={()=>{if(!busy)setConfirmDelete(null)}} title="מחיקת רשומה" subtitle="המחיקה היא לצמיתות. בדקו שזו הרשומה הנכונה." width="440px" footer={<><Button variant="danger" disabled={busy} onClick={removeConfirmed}>{busy?"מוחק…":"מחיקה לצמיתות"}</Button><Button variant="secondary" disabled={busy} onClick={()=>setConfirmDelete(null)}>ביטול</Button></>}><p className="text-sm">האם למחוק את {confirmDelete?.kind==="vendor"?"הספק":"המשתתף"} <strong>{confirmDelete?.name}</strong> מהאירוע?</p></Modal></>
  )
}
