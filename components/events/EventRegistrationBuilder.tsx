"use client"
import {useEffect,useState} from 'react'
import {defaultRegistration,duplicateRegistrationField,fieldTypes,parseRegistrationForm,RegistrationField,RegistrationForm} from '@/lib/event-registration'
import {uiRequest,uiMutation} from '@/lib/ui-request'
import Button from '@/components/ui/Button'
import RegistrationFields from './RegistrationFields'
import EventRegistrationSurface from './EventRegistrationSurface'
import './event-registration.css'

export default function EventRegistrationBuilder({event}:{event:any}){
 const [form,setForm]=useState<RegistrationForm>(()=>defaultRegistration(event.name)),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[available,setAvailable]=useState<boolean|null>(null)
 const [retry,setRetry]=useState(0)
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[dirty,setDirty]=useState(false)
 const [editable,setEditable]=useState(false)
 const link=typeof window==='undefined'?'':`${window.location.origin}/register/${encodeURIComponent(event.slug||'')}`
 useEffect(()=>{let active=true;setLoading(true);setError('');setAvailable(null);uiRequest(`/api/events/${event.id}/registration`).then(d=>{if(active){setForm(d.form);setAvailable(d.available);setEditable(!!d.event?.registration_can_edit);setDirty(false)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[event.id,retry])
 function update(next:RegistrationForm){setForm(next);setDirty(true);setMessage('');setError('')}
 function field(id:string,patch:Partial<RegistrationField>){update({...form,fields:form.fields.map(f=>f.id===id?{...f,...patch}:f)})}
 function duplicate(index:number){try{update({...form,fields:duplicateRegistrationField(form.fields,index,'field_'+crypto.randomUUID().replaceAll('-','').slice(0,16))})}catch(e){setError(e instanceof Error?e.message:'השכפול נכשל')}}
 function move(index:number,delta:number){const fields=[...form.fields],to=index+delta;if(to<0||to>=fields.length)return;[fields[index],fields[to]]=[fields[to],fields[index]];update({...form,fields})}
 async function save(e:React.FormEvent){e.preventDefault();if(saving||!editable)return;setError('');setMessage('');try{const clean=parseRegistrationForm(form);setSaving(true);const d=await uiMutation(`/api/events/${event.id}/registration`,'PUT',clean);setForm(d.form);setDirty(false);setMessage(d.form.enabled?'הטופס נשמר וההרשמה פתוחה':'הטופס נשמר. ההרשמה סגורה כרגע')}catch(e){setError(e instanceof Error?e.message:'השמירה נכשלה')}finally{setSaving(false)}}
 async function upload(file:File|undefined){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>200*1024){setError('יש לבחור PNG, JPG או WebP עד 200KB');return}const reader=new FileReader();reader.onload=()=>update({...form,logo:String(reader.result)});reader.onerror=()=>setError('לא ניתן לקרוא את התמונה');reader.readAsDataURL(file)}
 async function copy(){try{await navigator.clipboard.writeText(link);setMessage('קישור ההרשמה הועתק')}catch{setError('לא ניתן להעתיק אוטומטית. אפשר לסמן ולהעתיק את הקישור המוצג.')}}
 if(loading)return <p role="status" className="ui-note">טוען את בונה הטופס…</p>
 if(available===null)return <div className="ui-error" role="alert"><p>{error||'לא ניתן לטעון את בונה הטופס'}</p><Button variant="secondary" onClick={()=>setRetry(v=>v+1)}>ניסיון נוסף</Button></div>
 return <div className="er-builder">
  {!available&&<div className="ui-error" role="alert">שמירת טפסים תתאפשר לאחר החלת מיגרציית ההרשמה. אפשר לעצב ולצפות בתצוגה המקדימה.</div>}
  <div className="er-share"><div><b>קישור רישום לאירוע</b><p>הנרשמים יופיעו בטאב ״נרשמים״ של האירוע. קישור איסוף הלידים הקיים נשאר פעיל בנפרד.</p></div><input aria-label="קישור רישום לאירוע" value={link} readOnly dir="ltr" onFocus={e=>e.target.select()}/><Button size="sm" variant="secondary" disabled={!event.slug||form.version===0} onClick={copy}>העתקת קישור</Button>{event.slug&&form.version>0&&<a className="ui-btn ui-btn-sm" href={link} target="_blank" rel="noreferrer">פתיחת הטופס ↗</a>}</div>
  <div className="er-builder-grid"><form onSubmit={save} className="er-editor">
   <h3>בונה טופס הרישום</h3><p className="ui-note">הכותרת והלוגו שייכים לטופס הזה בלבד. שם וטלפון נשארים חובה לזיהוי נרשמים ולמניעת כפילויות.</p>
   <fieldset disabled={saving||!editable}><label className="ui-field">כותרת האירוע בטופס<input className="ui-input" maxLength={120} required value={form.title} onChange={e=>update({...form,title:e.target.value})}/></label><label className="ui-field">פתיח / הנחיות<textarea className="ui-input" rows={3} maxLength={2000} value={form.description} onChange={e=>update({...form,description:e.target.value})}/></label>
   <div className="er-logo-editor"><label className="ui-field">לוגו האירוע<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{upload(e.target.files?.[0]);e.target.value=''}}/><small>PNG, JPG או WebP · עד 200KB</small></label>{form.logo&&<><img src={form.logo} alt="לוגו האירוע"/><Button size="sm" variant="secondary" onClick={()=>update({...form,logo:''})}>הסרת הלוגו</Button></>}</div>
   <h4>השדות בטופס · {form.fields.length}/20</h4>
   {form.fields.map((f,index)=>{const locked=['name','phone'].includes(f.id);return <section key={f.id} className="er-field-editor"><header><b>שדה {index+1}</b><div><button type="button" disabled={form.fields.length>=20} aria-label={`שכפול השדה ${f.label}`} onClick={()=>duplicate(index)}>שכפול</button><button type="button" aria-label={`העלאת ${f.label}`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" aria-label={`הורדת ${f.label}`} disabled={index===form.fields.length-1} onClick={()=>move(index,1)}>↓</button>{!locked&&<button type="button" aria-label={`הסרת השדה ${f.label}`} onClick={()=>update({...form,fields:form.fields.filter(x=>x.id!==f.id)})}>הסרה</button>}</div></header><label className="ui-field">שם השדה<input className="ui-input" maxLength={80} required value={f.label} onChange={e=>field(f.id,{label:e.target.value})}/></label><div className="er-field-options"><label className="ui-field">סוג השדה<select className="ui-input" disabled={locked} value={f.type} onChange={e=>field(f.id,{type:e.target.value as RegistrationField['type'],options:e.target.value==='select'?['אפשרות ראשונה']:undefined})}>{Object.entries(fieldTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="ui-check"><input type="checkbox" disabled={locked} checked={f.required} onChange={e=>field(f.id,{required:e.target.checked})}/>שדה חובה</label></div>{f.type==='select'&&<label className="ui-field">אפשרויות — כל אפשרות בשורה נפרדת<textarea className="ui-input" value={(f.options||[]).join('\n')} onChange={e=>field(f.id,{options:e.target.value.split('\n')})}/></label>}</section>})}
   <Button variant="secondary" fullWidth disabled={form.fields.length>=20} onClick={()=>update({...form,fields:[...form.fields,{id:'field_'+crypto.randomUUID().replaceAll('-','').slice(0,16),label:'שדה חדש',type:'text',required:false}]})}>+ הוספת שדה</Button>
   <label className="er-open-toggle"><input type="checkbox" checked={form.enabled} onChange={e=>update({...form,enabled:e.target.checked})}/><span><b>פתיחת ההרשמה</b><small>{form.enabled?'לאחר שמירה, ניתן יהיה להירשם דרך הקישור':'הטופס יישמר כשההרשמה סגורה'}</small></span></label></fieldset>
   {error&&<p className="ui-error" role="alert">{error}</p>}{message&&<p className="er-saved" role="status">{message}</p>}
   <div className="er-save"><span>{!editable?'הרשאת צפייה בלבד':dirty?'יש שינויים שלא נשמרו':form.version===0?'הטופס טרם נשמר':'כל השינויים נשמרו'}</span><Button type="submit" disabled={saving||!available||!editable}>{saving?'שומר…':'שמירת הטופס'}</Button></div>
  </form><aside className="er-preview"><span className="ui-eyebrow">תצוגה מקדימה · ללא שליחה</span><EventRegistrationSurface form={form} event={event} preview><p className="er-required">* שדה חובה</p><RegistrationFields fields={form.fields} values={{}} disabled onChange={()=>{}}/><div className="er-preview-submit">הרשמה לאירוע ←</div></EventRegistrationSurface></aside></div>
 </div>
}
