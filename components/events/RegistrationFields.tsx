"use client"
import {RegistrationField} from '@/lib/event-registration'
export default function RegistrationFields({fields,values,onChange,disabled=false}:{fields:RegistrationField[];values:Record<string,string|boolean>;onChange:(id:string,value:string|boolean)=>void;disabled?:boolean}){
 return <div className="er-fields">{fields.map(f=>{
  const props={id:`registration-${f.id}`,name:f.id,required:f.required,disabled,'aria-label':f.label}
  return <label key={f.id} className={`er-field ${f.type==='textarea'?'er-wide':''} ${f.type==='checkbox'?'er-check er-wide':''}`} htmlFor={props.id}>
   {f.type==='checkbox'?<><input {...props} type="checkbox" checked={values[f.id]===true} onChange={e=>onChange(f.id,e.target.checked)}/><span>{f.label}{f.required?' *':''}</span></>:<><span>{f.label}{f.required?' *':''}</span>{f.type==='select'?<select {...props} value={String(values[f.id]||'')} onChange={e=>onChange(f.id,e.target.value)}><option value="">בחרו אפשרות</option>{f.options?.map(o=><option key={o} value={o}>{o}</option>)}</select>:f.type==='textarea'?<textarea {...props} rows={3} maxLength={4000} value={String(values[f.id]||'')} onChange={e=>onChange(f.id,e.target.value)}/>:<input {...props} type={f.type==='id'?'text':f.type} inputMode={f.type==='id'?'numeric':undefined} pattern={f.type==='id'?'[0-9]{9}':undefined} minLength={f.type==='id'?9:undefined} maxLength={f.type==='id'?9:500} autoComplete={f.id==='name'?'name':f.type==='tel'?'tel':f.type==='email'?'email':'off'} dir={['tel','email','id'].includes(f.type)?'ltr':undefined} value={String(values[f.id]||'')} onChange={e=>onChange(f.id,e.target.value)}/>}</>}
  </label>
 })}</div>
}
