"use client"
import { useEffect, useState } from "react"
import Modal from "./Modal"
import Button from "./Button"
import { useToast } from "./Toast"

export default function CalendarPopup({token,label}:{token:string;label?:string}){
 const [open,setOpen]=useState(false),[url,setUrl]=useState(""),[copied,setCopied]=useState(false)
 const toast=useToast()
 useEffect(()=>{setUrl(token?`${window.location.origin}/api/calendar.ics/${token}`:"");setCopied(false)},[token])
 async function copy(){if(!url)return;try{await navigator.clipboard.writeText(url);setCopied(true);toast.success("לינק היומן הועתק")}catch{toast.error("לא ניתן להעתיק אוטומטית. אפשר לסמן את הכתובת ולהעתיק ידנית.")}}
 return <><button type="button" className="ui-btn" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>{label||"לינק יומן"}</button>
  <Modal open={open} onClose={()=>setOpen(false)} title="חיבור היומן האישי" subtitle="האירועים והמשימות שלכם, גם ביומן שבו אתם משתמשים." width="500px" footer={<><Button onClick={copy} disabled={!url}>{copied?"✓ הועתק":"העתקת לינק היומן"}</Button><Button variant="secondary" onClick={()=>setOpen(false)}>סגירה</Button></>}>
   <ol className="text-sm leading-8 list-decimal pr-5 mb-5"><li>העתיקו את הקישור האישי.</li><li>ב־Google Calendar פתחו הגדרות ← הוספת יומן ← לפי כתובת URL.</li><li>הדביקו את הקישור ואשרו את הוספת היומן.</li></ol>
   <label className="ui-field">הקישור האישי שלכם<input className="ui-input text-xs" dir="ltr" readOnly value={url} placeholder="טוען קישור…"/></label>
   {!url&&<p className="ui-note mt-3" role="status">לא התקבל עדיין קישור אישי. אפשר לסגור ולנסות שוב לאחר טעינת המסך.</p>}
   <p className="ui-note mt-4">הקישור אישי ומאפשר צפייה ביומן. שתפו אותו רק עם מי שתרצו לאפשר לו לצפות.</p>
  </Modal>
 </>
}
