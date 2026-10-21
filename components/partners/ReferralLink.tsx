"use client"
import {useState} from "react"
import PartnerDialog from "./PartnerDialog"

export default function ReferralLink({coords,contacts,initialContact,onClose}:{coords:any[];contacts:any[];initialContact?:any;onClose:()=>void}) {
  const [contactId,setContactId]=useState(initialContact?String(initialContact.id):"")
  const [coordId,setCoordId]=useState(String(initialContact?.coordinator_id||coords.find(c=>c.name===initialContact?.owner)?.id||""))
  const [result,setResult]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[copied,setCopied]=useState(false)
  const coord=coords.find(c=>String(c.id)===coordId),contact=contacts.find(c=>String(c.id)===contactId)
  function reset(){setResult(null);setError("");setCopied(false)}
  async function generate(){
    setBusy(true);setError("")
    try{const r=await fetch('/api/contacts/referral-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({coordinator_id:Number(coordId),contact_id:contactId?Number(contactId):null})});const d=await r.json();if(!r.ok)throw Error(d.error||'לא ניתן ליצור קישור');setResult(d)}catch(e){setError(e instanceof Error?e.message:'לא ניתן ליצור קישור')}finally{setBusy(false)}
  }
  async function copy(){try{await navigator.clipboard.writeText(new URL(result.path,location.origin).href);setCopied(true)}catch{setError('ההעתקה לא הצליחה. אפשר לסמן את הקישור ולהעתיק ידנית.')}}
  return <PartnerDialog title="לינק אישי לרכז" subtitle="כל פנייה מגיעה לאדם הנכון, עם מקור ברור." onClose={onClose} footer={<><button className="partner-btn partner-primary" onClick={result?copy:generate} disabled={busy||!coordId}>{busy?'מכין קישור…':result?(copied?'✓ הקישור הועתק':'העתקת הקישור'):'יצירת לינק אישי'}</button><button className="partner-btn" onClick={onClose}>סגירה</button></>}>
    <div className="referral-intro"><span className="referral-icon">↗</span><div><h3>קישור אחד. שיוך מסודר.</h3><p>הרכז מקבל את הליד, והשותף נשמר כמקור ההפניה.</p></div></div>
    <div className="partner-form">
      <label>מי יקבל את הלידים? <span>*</span><select disabled={busy} value={coordId} onChange={e=>{setCoordId(e.target.value);reset()}}><option value="">בחירת רכז</option>{coords.map(c=><option value={c.id} key={c.id}>{c.name} · {c.area||'רכז שטח'}</option>)}</select></label>
      <label>שותף מפנה <small>רשות</small><select disabled={busy} value={contactId} onChange={e=>{setContactId(e.target.value);const c=contacts.find(c=>String(c.id)===e.target.value);if(c){const owner=coords.find(x=>x.id===c.coordinator_id||x.name===c.owner);if(owner)setCoordId(String(owner.id))}reset()}}><option value="">לינק לרכז בלבד, ללא שותף</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}{c.org?' · '+c.org:''}</option>)}</select></label>
    </div>
    <div className="referral-route"><span>כך תיראה ההפניה</span><div><b>{contact?.org||'פנייה ישירה'}</b><i>←</i><b>{contact?.name||'טופס אישי'}</b><i>←</i><b>{coord?.name||'בחירת רכז'}</b></div><p>רכז מטפל: <strong>{coord?.name||'טרם נבחר'}</strong>{contact&&<> · שיוך לעמותה / ארגון: <strong>{contact.org||'ללא ארגון'}</strong></>}</p></div>
    {contact&&coord&&contact.owner&&contact.owner!==coord.name&&<p className="partner-notice">הלידים מהקישור ייכנסו על שם {coord.name}. הרכז האחראי על איש הקשר עצמו ({contact.owner}) יישאר ללא שינוי.</p>}
    {result&&<div className="referral-result"><span>✓ הקישור מוכן לשיתוף</span><input aria-label="הקישור האישי" dir="ltr" readOnly value={typeof window!=='undefined'?new URL(result.path,location.origin).href:result.path} onFocus={e=>e.target.select()}/><a href={result.path} target="_blank" rel="noreferrer">תצוגה מקדימה של הטופס ↗</a><p>הקישור תקף ל־180 יום. השיוך נבדק בשרת בעת שליחת הטופס.</p></div>}
    {error&&<p className="partner-error" role="alert">{error}</p>}
  </PartnerDialog>
}
