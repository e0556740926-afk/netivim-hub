// "ועידה" registration design — shared by the public page, the form builder
// and the registration API. Client-safe: no server imports.
import type {RegistrationField} from './event-registration'

export const PAGE_DESIGNS = {default:'עיצוב רגיל',veida:'עיצוב ועידת נתיבים'} as const
export type PageDesign = keyof typeof PAGE_DESIGNS
export function pageDesign(v:unknown):PageDesign{return v==='veida'?'veida':'default'}

/** The conference design has a fixed form; the builder locks these fields. */
export const VEIDA_FIELDS:RegistrationField[]=[
 {id:'name',label:'שם מלא',type:'text',required:true},
 {id:'phone',label:'טלפון נייד',type:'tel',required:true},
 {id:'email',label:'דוא״ל',type:'email',required:true},
 {id:'city',label:'עיר',type:'text',required:false},
 {id:'role_org',label:'תפקיד וארגון',type:'text',required:false},
]

/** Companion details sent beside the answers; stored as its own waitlisted attendee row. */
export type VeidaGuest={name:string;phone:string;role:string}
export function parseGuest(v:unknown):VeidaGuest|null{
 if(v==null||v===false)return null
 if(typeof v!=='object'||Array.isArray(v))throw new Error('פרטי המלווה אינם תקינים')
 const g=v as Record<string,unknown>
 const name=String(g.name??'').trim().slice(0,120),phone=String(g.phone??'').trim().slice(0,30),role=String(g.role??'').trim().slice(0,160)
 if(name.length<2)throw new Error('יש למלא את שם המלווה')
 if(phone&&!isIsraeliMobile(phone))throw new Error('מספר הטלפון של המלווה אינו תקין')
 return {name,phone:phone?normalizeMobile(phone):'',role}
}

export function normalizeMobile(v:string){let d=v.replace(/\D/g,'');if(d.startsWith('972'))d='0'+d.slice(3);return d}
export function isIsraeliMobile(v:string){return /^05\d{8}$/.test(normalizeMobile(v))}

/** Registration number shown on the confirmation and in messages. */
export function regNo(id:number|string){return String(id).padStart(4,'0')}

// Hebrew numerals (gematria) with the 15/16 exceptions and geresh/gershayim.
const ONES=['','א','ב','ג','ד','ה','ו','ז','ח','ט'],TENS=['','י','כ','ל','מ','נ','ס','ע','פ','צ'],HUNDREDS=['','ק','ר','ש','ת']
export function hebrewNumeral(n:number):string{
 let s='',x=n%1000
 while(x>=400){s+='ת';x-=400}
 if(x>=100){s+=HUNDREDS[Math.floor(x/100)];x%=100}
 if(x===15)s+='טו';else if(x===16)s+='טז';else{s+=TENS[Math.floor(x/10)];s+=ONES[x%10]}
 return s.length===1?s+'׳':s.slice(0,-1)+'״'+s.slice(-1)
}
/** "י״ט בטבת תשפ״ז" for an ISO date (YYYY-MM-DD). */
export function hebrewDate(iso:string):string{
 const d=new Date(iso.slice(0,10)+'T12:00:00')
 if(Number.isNaN(d.getTime()))return ''
 const parts=new Intl.DateTimeFormat('he-IL-u-ca-hebrew',{day:'numeric',month:'long',year:'numeric'}).formatToParts(d)
 const day=Number(parts.find(p=>p.type==='day')?.value),year=Number(parts.find(p=>p.type==='year')?.value)
 const month=parts.find(p=>p.type==='month')?.value||''
 if(!day||!year||!month)return ''
 return `${hebrewNumeral(day)} ב${month.replace(/^ב/,'')} ${hebrewNumeral(year)}`
}
const WEEKDAYS=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']
export function weekday(iso:string){const d=new Date(iso.slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?'':WEEKDAYS[d.getDay()]}
export function shortDate(iso:string){const [y,m,d]=iso.slice(0,10).split('-');return y&&m&&d?`${Number(d)}.${Number(m)}.${y}`:''}

/** Personalised WhatsApp text for a coordinator's invitation. */
export const DEFAULT_INVITE_TEMPLATE='שלום {שם},\nאני שמח להזמין אותך לוועידת נתיבים – ערב של מפגש עם השותפים שלנו מכל הארץ.\n{מתי}\nלאישור הגעה (פחות מדקה): {קישור}\nמחכה לראותך,\n{רכז}'
export function fillInvite(template:string,v:{name:string;link:string;when:string;inviter:string}){
 const first=v.name.trim().split(/\s+/)[0]||''
 return (template.trim()||DEFAULT_INVITE_TEMPLATE).replaceAll('{שם}',first).replaceAll('{שם_מלא}',v.name.trim()).replaceAll('{קישור}',v.link).replaceAll('{מתי}',v.when).replaceAll('{רכז}',v.inviter.trim())
}
/** Neon returns DATE columns as JS Dates; API JSON gives strings. Either → YYYY-MM-DD. */
export function isoDate(v:unknown):string{if(!v)return '';if(v instanceof Date)return Number.isNaN(v.getTime())?'':v.toISOString().slice(0,10);const s=String(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):''}
export function whenLine(e:{date?:unknown;time?:string|null;location?:string|null}){
 const iso=isoDate(e.date)
 return [iso?`יום ${weekday(iso)}, ${hebrewDate(iso)} (${shortDate(iso)})`:'',e.time?`בשעה ${e.time}`:'',e.location||''].filter(Boolean).join(' · ')
}
