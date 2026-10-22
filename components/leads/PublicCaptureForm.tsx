"use client"
import { useEffect, useRef, useState } from "react"
import PublicShell from "@/components/ui/PublicShell"
import Button from "@/components/ui/Button"

export default function PublicCaptureForm({slug,kind}:{slug:string;kind:"source"|"event"}){
 const resolution=useRef(0)
 const [record,setRecord]=useState<any>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState("")
 const [form,setForm]=useState({firstName:"",lastName:"",age:"",phone:"",email:"",notes:"",consent:false,isParent:false})
 const [sent,setSent]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false)
 async function load(){const version=++resolution.current;setLoading(true);setLoadError("");try{
  const res=await fetch(`${kind==="source"?"/api/lead-sources/slug":"/api/events/by-slug"}?slug=${encodeURIComponent(slug)}`)
  if(!res.ok)throw new Error("לא ניתן לטעון את פרטי הקישור. נסו שוב.")
  const d=await res.json(),item=d[kind==="source"?"source":"event"]
  if(!item)throw new Error("הקישור אינו פעיל או אינו קיים. יש לפנות למי ששלח אותו.")
  if(version===resolution.current)setRecord(item)
 }catch(e){if(version===resolution.current)setLoadError(e instanceof Error?e.message:"טעינת הקישור נכשלה")}finally{if(version===resolution.current)setLoading(false)}}
 useEffect(()=>{
  setRecord(null);setSent(false);setError("");setForm({firstName:"",lastName:"",age:"",phone:"",email:"",notes:"",consent:false,isParent:false})
  load();return()=>{resolution.current++}
 },[slug,kind]) // eslint-disable-line react-hooks/exhaustive-deps
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!record||busy)return
  if(!form.firstName.trim()||!form.phone.trim()||!form.consent){setError("יש למלא שם וטלפון ולאשר קבלת עדכונים.");return}
  setBusy(true);setError("")
  try{
   const body={coordinator_id:record.coordinator_id||null,name:`${form.firstName.trim()} ${form.lastName.trim()}`.trim(),phone:form.phone.trim(),email:form.email.trim(),age:form.age?Number(form.age):null,source:kind==="event"?"event":"link",interest:"training",notes:form.notes,
    ...(kind==="event"?{event_id:record.id}:{lead_source_id:record.id,is_parent:form.isParent})}
   const res=await fetch("/api/leads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
   const d=await res.json().catch(()=>null)
   // Preserve the existing generic duplicate response; disclose no existing lead information.
   if(d?.error==="כפילות"){setSent(true);return}
   if(!res.ok||d?.error)throw new Error(d?.error||"השליחה לא הושלמה. נסו שוב.")
   setSent(true)
  }catch(e){setError(e instanceof Error?e.message:"לא הצלחנו לשלוח. נסו שוב.")}finally{setBusy(false)}
 }
 const set=(key:keyof typeof form,value:string|boolean)=>setForm(f=>({...f,[key]:value}))
 return <PublicShell title={"הצעד הראשון\nבדרך שלך."} description="ספרו לנו קצת על עצמכם. נציג נתיבים יחזור אליכם ויעזור למצוא את המסלול המתאים." owner={record?<><small>{kind==="event"?"נפגשנו באירוע":"הקישור נשלח דרך"}</small><b>{kind==="event"?record.name:record.label}</b>{kind==="event"&&record.date&&<small>{new Date(record.date).toLocaleDateString("he-IL")}{record.location?` · ${record.location}`:""}</small>}</>:undefined}>
  {loading?<p role="status" className="ui-note">טוען את פרטי הקישור…</p>:loadError?<div><h2>לא הצלחנו לפתוח את הקישור</h2><p className="ui-error" role="alert">{loadError}</p><Button variant="secondary" onClick={load}>ניסיון נוסף</Button></div>:sent?<div className="ui-public-success" role="status"><span aria-hidden="true">✓</span><h2>הפרטים התקבלו, תודה!</h2><p className="ui-note">נציג נתיבים יצור איתכם קשר בהקדם.</p></div>:<>
   <span className="ui-eyebrow">נעים להכיר</span><h2>משאירים פרטים, מתחילים דרך</h2><p className="ui-note mb-6">שם פרטי וטלפון הם שדות חובה. שאר הפרטים יעזרו לנו להכיר אתכם.</p>
   <form className="ui-public-form" onSubmit={submit}>
    <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3"><label className="ui-field">שם פרטי <input className="ui-input" autoComplete="given-name" required value={form.firstName} onChange={e=>set("firstName",e.target.value)}/></label><label className="ui-field">שם משפחה <input className="ui-input" autoComplete="family-name" value={form.lastName} onChange={e=>set("lastName",e.target.value)}/></label></div>
    <label className="ui-field">טלפון <input type="tel" dir="ltr" autoComplete="tel" className="ui-input" required value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="050-0000000"/></label>
    <div className="grid grid-cols-1 min-[360px]:grid-cols-[100px_1fr] gap-3"><label className="ui-field">גיל <input className="ui-input" type="number" min="1" max="120" value={form.age} onChange={e=>set("age",e.target.value)}/></label><label className="ui-field">דוא״ל <input type="email" dir="ltr" autoComplete="email" className="ui-input" value={form.email} onChange={e=>set("email",e.target.value)}/></label></div>
    <label className="ui-field">משהו שחשוב שנדע <textarea className="ui-input" rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)}/></label>
    {kind==="source"&&<label className="ui-check"><input type="checkbox" checked={form.isParent} onChange={e=>set("isParent",e.target.checked)}/><span>אני הורה ומשאיר/ה פרטים עבור הבן שלי</span></label>}
    <label className="ui-check"><input type="checkbox" required checked={form.consent} onChange={e=>set("consent",e.target.checked)}/><span>אני מאשר/ת קבלת עדכונים ומידע מנתיבים</span></label>
    {error&&<p role="alert" className="ui-error">{error}</p>}
    <Button type="submit" size="lg" disabled={busy}>{busy?"שולח…":"שליחת הפרטים"}</Button>
   </form>
   <p className="ui-note mt-5">הפרטים משמשים ליצירת קשר ולהמשך טיפול בפנייה שלכם.</p>
  </>}
 </PublicShell>
}
