"use client"
import { ST, MONTHS_HE } from "./shared"
import { Icon } from "@/components/shell/icons"

export default function EventCard({e,spent,isEditing,isResults,selected,onToggleSelect,onEdit,onResults,onApprove,onManage,onRegistration,onDuplicate,onDelete,showCoordinator}:{
 e:any;spent:number;isEditing:boolean;isResults:boolean;selected?:boolean;onToggleSelect?:()=>void
 onEdit:()=>void;onResults:()=>void;onApprove?:()=>void;onManage:()=>void;onDuplicate:()=>void;onDelete:()=>void;showCoordinator?:boolean
 onRegistration?:()=>void
}){
 const budget=Number(e.budget_planned)||0,bp=budget>0?Math.round(spent/budget*100):0
 const leads=e.leads_from_event>0?e.leads_from_event:(e.leads_collected||0)
 const roi=leads>0&&spent>0?Math.round(spent/leads):null
 const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Jerusalem"})
 const isPast=e.date&&String(e.date).slice(0,10)<today&&!["done","cancelled"].includes(e.status)
 const pending=!e.approved&&e.status==="pending_approval"
 const date=e.date?new Date(String(e.date).slice(0,10)+"T12:00:00"):null
 return <article className="ui-event-card" data-selected={selected||isEditing||isResults||undefined}>
  <header className="ui-event-head">
   {onToggleSelect&&<input type="checkbox" className="ui-event-check" aria-label={`בחירת אירוע ${e.name}`} checked={!!selected} onChange={onToggleSelect}/>}
   {date&&<time className="ui-event-date" dateTime={String(e.date).slice(0,10)}><b>{date.getDate()}</b><span>{MONTHS_HE[date.getMonth()]}</span></time>}
   <div className="ui-event-main"><h2>{e.name}</h2><div className="ui-event-meta">
    {e.time&&<span>{e.time}</span>}{e.location&&<span>{e.location}</span>}{e.partner_name&&<span>שותף · {e.partner_name}</span>}{showCoordinator&&e.coordinator_name&&<span>רכז · {e.coordinator_name}</span>}{e.waitlist_count>0&&<span>{e.waitlist_count} ברשימת המתנה</span>}
   </div></div>
   <span className={`ui-badge ${e.status==="cancelled"?"ui-badge-muted":""}`}>{ST[e.status]||e.status}</span>
  </header>
  {isPast&&<p className="ui-note mt-3 text-[#946014]">האירוע הסתיים — ממתין לעדכון תוצאות</p>}
  {pending&&!onApprove&&<p className="ui-note mt-3">ההצעה נשלחה וממתינה לאישור המנהל.</p>}
  <div className="ui-event-stats">
   <div><strong>₪{budget.toLocaleString("he-IL")}</strong><small>תקציב מתוכנן</small></div>
   <div><strong>{e.attendee_count||e.actual_attendees||0}<span className="text-sm font-normal text-[#63756b]"> / {e.target_attendees||0}</span></strong><small>משתתפים / יעד</small></div>
   <div><strong>{leads}</strong><small>{e.leads_from_event>0?"לידים מקושרים לאירוע":"לידים שנאספו"}</small></div>
   <div><strong>{roi!==null?`₪${roi}`:"—"}</strong><small>עלות לליד</small></div>
  </div>
  {budget>0&&<div className="ui-event-budget"><span>ניצול תקציב · ₪{spent.toLocaleString("he-IL")} מתוך ₪{budget.toLocaleString("he-IL")}</span><div className="ui-progress"><span style={{width:`${Math.min(bp,100)}%`,background:bp>90?"var(--ui-danger)":bp>70?"var(--ui-warning)":undefined}}/></div><b>{bp}%</b></div>}
  {e.summary&&<details><summary>סיכום האירוע</summary><p>{e.summary}</p></details>}
  <footer className="ui-event-actions">
   <button className="ui-btn ui-btn-sm" onClick={onEdit} aria-pressed={isEditing}>עריכת אירוע</button>
   <button className="ui-btn ui-btn-sm ui-btn-primary" onClick={onManage}><Icon name="people" size={15}/> נרשמים וספקים{e.checked_in_count>0?` · ${e.checked_in_count} הגיעו`:""}</button>
   {onRegistration&&<button className="ui-btn ui-btn-sm" onClick={onRegistration}>טופס רישום ↗</button>}
   <button className="ui-btn ui-btn-sm" onClick={onResults} aria-pressed={isResults}>עדכון תוצאות</button>
   {onApprove&&pending&&<button className="ui-btn ui-btn-sm" onClick={onApprove}>✓ אישור אירוע</button>}
   <button className="ui-btn ui-btn-sm" onClick={onDuplicate}>שכפול</button>
   <button className="ui-btn ui-btn-sm ui-btn-danger" onClick={onDelete}>מחיקה</button>
  </footer>
 </article>
}
