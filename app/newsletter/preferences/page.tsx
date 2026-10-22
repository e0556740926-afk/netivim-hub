"use client"
import { useState } from "react"
import Link from "next/link"
import PublicShell from "@/components/ui/PublicShell"
import Button from "@/components/ui/Button"
import Modal from "@/components/ui/Modal"
import { uiRequest, uiMutation } from "@/lib/ui-request"
export default function PreferencesPage(){
 const [email,setEmail]=useState(""),[subscriber,setSubscriber]=useState<any>(null),[area,setArea]=useState(""),[frequency,setFrequency]=useState("monthly")
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false),[unsubscribed,setUnsubscribed]=useState(false),[confirm,setConfirm]=useState(false)
 async function lookup(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");setSaved(false);try{const d=await uiRequest(`/api/newsletter/preferences?email=${encodeURIComponent(email.trim())}`);if(!d.subscriber)throw new Error("לא נמצאה הרשמה לכתובת זו");setSubscriber(d.subscriber);setArea(d.subscriber.area||"");setFrequency(d.subscriber.frequency||"monthly")}catch(e){setSubscriber(null);setError(e instanceof Error?e.message:"לא הצלחנו לטעון את ההרשמה")}finally{setBusy(false)}}
 async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");setSaved(false);try{await uiMutation("/api/newsletter/preferences","PATCH",{email:email.trim(),area:area.trim(),frequency});setSaved(true)}catch(e){setError(e instanceof Error?e.message:"השמירה לא הושלמה")}finally{setBusy(false)}}
 async function unsubscribe(){if(busy)return;setBusy(true);setError("");try{await uiMutation("/api/newsletter/preferences","PATCH",{email:email.trim(),unsubscribe:true});setConfirm(false);setUnsubscribed(true)}catch(e){setConfirm(false);setError(e instanceof Error?e.message:"ההסרה לא הושלמה")}finally{setBusy(false)}}
 return <PublicShell eyebrow="ניוזלטר נתיבים" title={"בדיוק כמו\nשמתאים לכם."} description="בחרו איך להישאר בקשר. כאן מעדכנים פרטים, משנים את תדירות העדכון או מסירים את ההרשמה.">
  {unsubscribed?<div className="ui-public-success" role="status"><span>✓</span><h2>ההרשמה הוסרה</h2><p className="ui-note">לא תקבלו יותר עדכונים מהניוזלטר. אפשר לחזור ולהירשם בכל עת.</p><Link href="/newsletter" className="ui-btn mt-6">הרשמה מחדש</Link></div>:<>
   <span className="ui-eyebrow">העדפות אישיות</span><h2>נשארים בקשר, בדרך שלכם</h2><p className="ui-note mb-6">{subscriber?"עדכנו את הפרטים ובחרו את תדירות העדכונים.":"הזינו את כתובת הדוא״ל שנרשמתם איתה."}</p>
   {error&&<p role="alert" className="ui-error">{error}</p>}{saved&&<p className="ui-badge mb-4" role="status">✓ ההעדפות עודכנו</p>}
   {!subscriber?<form className="ui-public-form" onSubmit={lookup}><label className="ui-field">כתובת דוא״ל<input type="email" dir="ltr" className="ui-input" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><Button type="submit" disabled={busy}>{busy?"טוען…":"הצגת ההעדפות שלי"}</Button></form>:<form className="ui-public-form" onSubmit={save}>
    <div className="ui-note break-all" dir="ltr">{email}</div><label className="ui-field">עיר או אזור מגורים<input className="ui-input" value={area} onChange={e=>{setArea(e.target.value);setSaved(false)}}/></label>
    <label className="ui-field">תדירות העדכונים<select className="ui-input" value={frequency} onChange={e=>{setFrequency(e.target.value);setSaved(false)}}><option value="monthly">פעם בחודש</option><option value="quarterly">פעם ברבעון</option></select></label>
    <Button type="submit" disabled={busy}>{busy?"שומר…":"שמירת העדפות"}</Button><Button variant="secondary" disabled={busy} onClick={()=>{setSubscriber(null);setSaved(false)}}>חיפוש כתובת אחרת</Button>
    <button type="button" className="ui-note underline min-h-11 text-[#a74450]" disabled={busy} onClick={()=>setConfirm(true)}>הסרה מלאה מרשימת התפוצה</button>
   </form>}
   <nav className="ui-public-links"><Link href="/newsletter/archive">ארכיון הגיליונות</Link><Link href="/newsletter">הרשמה לניוזלטר</Link></nav>
  </>}
  <Modal open={confirm} onClose={()=>{if(!busy)setConfirm(false)}} title="הסרה מרשימת התפוצה" subtitle="אפשר להירשם שוב בהמשך." width="440px" footer={<><Button variant="danger" disabled={busy} onClick={unsubscribe}>{busy?"מסיר…":"אישור הסרה"}</Button><Button variant="secondary" disabled={busy} onClick={()=>setConfirm(false)}>להישאר ברשימה</Button></>}><p className="text-sm">לא יישלחו עוד עדכונים לכתובת <b dir="ltr">{email}</b>.</p></Modal>
 </PublicShell>
}
