import {isValidIsraeliId} from './israeli-id'

export const fieldTypes={text:'טקסט קצר',textarea:'טקסט ארוך',tel:'טלפון',email:'אימייל',number:'מספר',select:'בחירה מרשימה',checkbox:'תיבת סימון',id:'תעודת זהות'} as const
export type RegistrationField={id:string;label:string;type:keyof typeof fieldTypes;required:boolean;options?:string[]}
export type RegistrationForm={title:string;description:string;logo:string;enabled:boolean;version:number;fields:RegistrationField[]}
export const defaultFields:RegistrationField[]=[{id:'name',label:'שם מלא',type:'text',required:true},{id:'phone',label:'טלפון',type:'tel',required:true},{id:'email',label:'אימייל',type:'email',required:false}]
export function defaultRegistration(title:string):RegistrationForm{return {title,description:'מלאו את הפרטים כדי להירשם לאירוע.',logo:'',enabled:false,version:0,fields:defaultFields.map(f=>({...f}))}}
export class RegistrationError extends Error{constructor(message:string,public status=400){super(message)}}
export function duplicateRegistrationField(fields:RegistrationField[],index:number,newId:string):RegistrationField[]{
 if(fields.length>=20)throw new RegistrationError('אפשר להגדיר עד 20 שדות בטופס')
 const original=fields[index]
 if(!original)throw new RegistrationError('השדה לשכפול לא נמצא')
 if(!/^[a-z][a-z0-9_]{0,47}$/.test(newId)||fields.some(f=>f.id===newId))throw new RegistrationError('מזהה השדה החדש אינו תקין')
 const copy={...original,id:newId,label:`${original.label} (עותק)`.slice(0,80),...(original.options?{options:[...original.options]}:{})}
 return [...fields.slice(0,index+1),copy,...fields.slice(index+1)]
}
export function parseRegistrationForm(value:unknown):RegistrationForm{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new RegistrationError('הגדרות הטופס אינן תקינות')
 const d=value as any
 if(typeof d.title!=='string'||!d.title.trim()||d.title.trim().length>120)throw new RegistrationError('יש להזין כותרת עד 120 תווים')
 if(typeof d.description!=='string'||d.description.length>2000)throw new RegistrationError('התיאור ארוך מדי')
 if(typeof d.logo!=='string'||(d.logo!==''&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(d.logo))||d.logo.length>280000)throw new RegistrationError('יש להעלות לוגו מסוג PNG, JPG או WebP עד 200KB')
 if(typeof d.enabled!=='boolean'||!Number.isInteger(d.version)||d.version<0)throw new RegistrationError('גרסת הטופס אינה תקינה')
 if(!Array.isArray(d.fields)||d.fields.length<2||d.fields.length>20)throw new RegistrationError('אפשר להגדיר בין 2 ל־20 שדות')
 const ids=new Set<string>()
 const fields=d.fields.map((f:any):RegistrationField=>{
  if(!f||typeof f!=='object'||!/^([a-z][a-z0-9_]{0,47})$/.test(f.id)||ids.has(f.id))throw new RegistrationError('מזהי השדות אינם תקינים')
  ids.add(f.id)
  if(typeof f.label!=='string'||!f.label.trim()||f.label.trim().length>80||!Object.hasOwn(fieldTypes,f.type)||typeof f.required!=='boolean')throw new RegistrationError('יש להשלים כותרת וסוג לכל שדה')
  let options:string[]|undefined
  if(f.type==='select'){
   if(!Array.isArray(f.options)||f.options.length<1||f.options.length>30||f.options.some((o:unknown)=>typeof o!=='string'||!o.trim()||o.length>100))throw new RegistrationError('שדה בחירה דורש 1–30 אפשרויות לא ריקות')
   options=f.options.map((o:string)=>o.trim())
   if(new Set(options).size!==options!.length)throw new RegistrationError('אפשרויות הבחירה צריכות להיות שונות')
  }
  return {id:f.id,label:f.label.trim(),type:f.type,required:f.required,...(options?{options}:{})}
 })
 if(!fields.some((f:RegistrationField)=>f.id==='name'&&f.type==='text'&&f.required)||!fields.some((f:RegistrationField)=>f.id==='phone'&&f.type==='tel'&&f.required))throw new RegistrationError('שם וטלפון הם שדות חובה לצורך זיהוי ההרשמה')
 return {title:d.title.trim(),description:d.description.trim(),logo:d.logo,enabled:d.enabled,version:d.version,fields}
}
export function validateRegistrationAnswers(fields:RegistrationField[],input:unknown):Record<string,string|boolean>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new RegistrationError('יש למלא את פרטי ההרשמה')
 const data=input as Record<string,unknown>,answers:Record<string,string|boolean>={}
 const known=new Set(fields.map(f=>f.id))
 if(Object.keys(data).some(key=>!known.has(key)))throw new RegistrationError('הטופס השתנה. רעננו את העמוד ונסו שוב.',409)
 for(const field of fields){
  const value=data[field.id]
  if(field.type==='checkbox'){
   if(value!=null&&typeof value!=='boolean')throw new RegistrationError(`יש לבדוק את השדה: ${field.label}`)
   if(field.required&&value!==true)throw new RegistrationError(`יש לסמן: ${field.label}`)
   answers[field.id]=value===true;continue
  }
  if(value!=null&&typeof value!=='string')throw new RegistrationError(`ערך לא תקין: ${field.label}`)
  const text=(value as string|undefined)?.trim()||''
  if(!text){if(field.required)throw new RegistrationError(`יש למלא: ${field.label}`);answers[field.id]='';continue}
  if(text.length>(field.type==='textarea'?4000:500))throw new RegistrationError(`הערך ארוך מדי: ${field.label}`)
  if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))throw new RegistrationError(`כתובת אימייל לא תקינה: ${field.label}`)
  if(field.type==='tel'&&(!/^\+?[0-9()\s-]+$/.test(text)||text.replace(/\D/g,'').length<9||text.replace(/\D/g,'').length>15))throw new RegistrationError(`מספר טלפון לא תקין: ${field.label}`)
  if(field.type==='number'&&(!/^-?\d+(\.\d+)?$/.test(text)||!Number.isFinite(Number(text))||Math.abs(Number(text))>1e9))throw new RegistrationError(`יש להזין מספר: ${field.label}`)
  if(field.type==='select'&&!field.options?.includes(text))throw new RegistrationError(`בחרו אפשרות מהרשימה: ${field.label}`)
  if(field.type==='id'&&!isValidIsraeliId(text))throw new RegistrationError(`תעודת זהות לא תקינה: ${field.label}`)
  answers[field.id]=field.type==='tel'?text.replace(/[^+0-9]/g,''):text
 }
 return answers
}
