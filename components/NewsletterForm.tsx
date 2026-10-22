"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import PublicShell from "@/components/ui/PublicShell"
import Button from "@/components/ui/Button"
import { uiMutation } from "@/lib/ui-request"

export default function NewsletterForm({slug}:{slug?:string}){
 const [coordName,setCoordName]=useState(""),[form,setForm]=useState({name:"",email:"",area:""})
 const [sent,setSent]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false)
 useEffect(()=>{if(slug)fetch(`/api/coord/slug?slug=${encodeURIComponent(slug)}`).then(r=>r.json()).then(d=>setCoordName(d.coord?.name||"")).catch(()=>{})},[slug])
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");try{await uiMutation("/api/newsletter/subscribe","POST",{name:form.name.trim(),email:form.email.trim(),area:form.area.trim(),slug});setSent(true)}catch(e){setError(e instanceof Error?e.message:"ההרשמה נכשלה")}finally{setBusy(false)}}
 return <PublicShell eyebrow="ניוזלטר נתיבים" title={"סיפורים מהדרך.\nעדכונים עם משמעות."} description="עדכון חודשי קצר מהעשייה של נתיבים. אנשים, קהילה והזדמנויות — ישירות לתיבת הדואר שלכם." owner={coordName?<><small>דרך הרכז שלכם</small><b>{coordName}</b></>:undefined}>
  {sent?<div className="ui-public-success" role="status"><span aria-hidden="true">✓</span><h2>שמחים שאתם איתנו!</h2><p className="ui-note">ההרשמה נקלטה. עדכונים מנתיבים יגיעו לכתובת המייל שלכם.</p><Link className="ui-btn mt-6" href="/newsletter/archive">לגיליונות הקודמים</Link></div>:<>
   <span className="ui-eyebrow">נשארים בקשר</span><h2>הצטרפו לניוזלטר</h2><p className="ui-note mb-6">עדכון חודשי קצר. אפשר להסיר את ההרשמה בכל רגע.</p>
   <form className="ui-public-form" onSubmit={submit}>
    <label className="ui-field">שם מלא <input className="ui-input" required autoComplete="name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="איך קוראים לכם?"/></label>
    <label className="ui-field">כתובת דוא״ל <input className="ui-input" required type="email" dir="ltr" autoComplete="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="name@example.com"/></label>
    <label className="ui-field">עיר או אזור מגורים <small className="ui-note">לא חובה</small><input className="ui-input" autoComplete="address-level2" value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))}/></label>
    {error&&<p className="ui-error" role="alert">{error}</p>}
    <Button type="submit" size="lg" disabled={busy}>{busy?"מצרף אתכם…":"הרשמה לניוזלטר"}</Button>
   </form>
   <nav className="ui-public-links" aria-label="אפשרויות ניוזלטר"><Link href="/newsletter/archive">גיליונות קודמים</Link><Link href="/newsletter/preferences">ניהול העדפות</Link></nav>
  </>}
 </PublicShell>
}
