import sql from '@/lib/db'
import {hasColumn} from '@/lib/schema'
import {canTouchEvent} from '@/lib/event-access'
import {accessLevel} from '@/lib/permission-matrix'
import {NextRequest,NextResponse} from 'next/server'
import {RegistrationError} from './event-registration'

export async function registrationReady(){return await hasColumn('event_registration_forms','version')&&await hasColumn('event_attendees','registration_answers')}
type RegistrationEvent={id:number|string;name:string;slug:string|null;date:string|null;time:string;location:string;status:string;capacity:number|null;registration_can_edit:boolean}
export async function registrationAccess(req:NextRequest,id:number,write=false):Promise<RegistrationEvent>{
 if(!Number.isSafeInteger(id)||id<1)throw new RegistrationError('אירוע לא תקין',404)
 const access=await canTouchEvent(req,id),user=access.scope.me
 if(!user)throw new RegistrationError('יש להתחבר למערכת',401)
 const level=accessLevel(user,'events')
 if(!access.ok||level==='NONE'||(write&&!['M','E','O','T'].includes(level)))throw new RegistrationError('אין הרשאה',403)
 const [event]=await sql`SELECT id,name,slug,date,time,location,status,capacity FROM events WHERE id=${id} LIMIT 1`
 if(!event)throw new RegistrationError('האירוע לא נמצא',404)
 return {...event,registration_can_edit:['M','E','O','T'].includes(level)} as RegistrationEvent
}
export async function registrationBody(req:NextRequest){
 const text=await req.text()
 if(text.length>330000)throw new RegistrationError('הטופס גדול מדי',413)
 try{const d=JSON.parse(text);if(!d||typeof d!=='object'||Array.isArray(d))throw Error();return d}catch{throw new RegistrationError('בקשה לא תקינה')}
}
export function registrationFailure(e:unknown){
 const message=e instanceof Error?e.message:''
 if(e instanceof RegistrationError)return NextResponse.json({error:e.message},{status:e.status})
 if(message.includes('FORM_CHANGED'))return NextResponse.json({error:'הטופס השתנה. רעננו את העמוד לפני ההרשמה.'},{status:409})
 if(message.includes('REGISTRATION_CLOSED'))return NextResponse.json({error:'ההרשמה לאירוע סגורה כרגע'},{status:409})
 console.error('[event registration]',e instanceof Error?e.name:'UnknownError')
 return NextResponse.json({error:'הפעולה לא הושלמה. אפשר לנסות שוב.'},{status:503})
}
