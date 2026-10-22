"use client"
import {useEffect,useRef,useState} from 'react'
import {RegistrationForm,validateRegistrationAnswers} from '@/lib/event-registration'
import {uiRequest,uiMutation} from '@/lib/ui-request'
import RegistrationFields from './RegistrationFields'
import EventRegistrationSurface from './EventRegistrationSurface'
import './event-registration.css'
export default function PublicEventRegistration({slug}:{slug:string}){
 const [record,setRecord]=useState<{form:RegistrationForm;event:any}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState<null|{waitlisted:boolean}>(null)
 const [values,setValues]=useState<Record<string,string|boolean>>({}),[website,setWebsite]=useState(''),[requestKey,setRequestKey]=useState('')
 const version=useRef(0)
 useEffect(()=>{const current=++version.current;setLoading(true);setError('');setRecord(null);setDone(null);setValues({});setRequestKey(crypto.randomUUID());uiRequest(`/api/event-registration/${encodeURIComponent(slug)}`).then(d=>{if(version.current===current)setRecord(d)}).catch(e=>{if(version.current===current)setError(e.message)}).finally(()=>{if(version.current===current)setLoading(false)});return()=>{version.current++}},[slug])
 async function submit(e:React.FormEvent){e.preventDefault();if(!record||busy)return;setError('');try{const answers=validateRegistrationAnswers(record.form.fields,values);setBusy(true);const result=await uiMutation(`/api/event-registration/${encodeURIComponent(slug)}`,'POST',{version:record.form.version,key:requestKey,answers,website});setDone({waitlisted:result.waitlisted})}catch(e){setError(e instanceof Error?e.message:'ההרשמה לא הושלמה')}finally{setBusy(false)}}
 if(loading||!record)return <main className="er-public er-public-loading" dir="rtl"><div className="er-state-card">{loading?<p role="status">טוען את פרטי האירוע…</p>:<><h1>לא הצלחנו לפתוח את הטופס</h1><p role="alert">{error}</p></>}</div></main>
 return <main className="er-public" dir="rtl"><EventRegistrationSurface form={record.form} event={record.event}>
  {done?<div className="er-success" role="status"><span aria-hidden="true">✓</span><h2>{done.waitlisted?'הבקשה התקבלה ברשימת ההמתנה':'ההרשמה התקבלה!'}</h2><p>{done.waitlisted?'המקומות באירוע מלאים כרגע. צוות האירוע יוכל לעדכן אם יתפנה מקום.':'תודה שנרשמתם. נשמח לפגוש אתכם באירוע.'}</p></div>:!record.form.enabled?<div className="er-closed" role="status"><h2>ההרשמה סגורה כרגע</h2><p>אפשר לפנות למארגני האירוע לקבלת פרטים נוספים.</p></div>:<form onSubmit={submit}><p className="er-required">* שדה חובה</p><fieldset disabled={busy}><RegistrationFields fields={record.form.fields} values={values} onChange={(id,value)=>setValues(v=>({...v,[id]:value}))}/><div className="er-honey" aria-hidden="true"><label>Website<input name="website" autoComplete="off" tabIndex={-1} value={website} onChange={e=>setWebsite(e.target.value)}/></label></div></fieldset>{error&&<p className="er-error" role="alert">{error}</p>}<button className="er-submit" disabled={busy||!requestKey}>{busy?'שומר את ההרשמה…':'הרשמה לאירוע'}<span aria-hidden="true">←</span></button><p className="er-privacy">הפרטים ישמשו את צוות נתיבים לניהול ההרשמה והאירוע.</p></form>}
 </EventRegistrationSurface></main>
}
