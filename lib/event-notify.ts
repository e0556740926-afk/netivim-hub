// WhatsApp messages around event registration. Best-effort and no-throw:
// a failed notification never fails the registration that triggered it.
import sql from '@/lib/db'
import {logAudit} from '@/lib/audit'
import {sendWhatsApp} from '@/lib/whatsapp'
import {regNo,whenLine} from '@/lib/veida'

type Ev={id:number|string;name:string;date?:unknown;time?:string|null;location?:string|null}
const first=(name:string)=>name.trim().split(/\s+/)[0]||''

async function logSend(kind:string,attendeeId:number,ok:boolean){
 await logAudit({entityType:'event_attendee',entityId:attendeeId,action:'event.'+kind,actorName:'מערכת',summary:ok?'נשלח בוואטסאפ':'שליחה בוואטסאפ נכשלה'} as any)
}

export async function sendRegistrationConfirmation(p:{event:Ev;attendeeId:number;name:string;phone:string;guest:string|null}){
 try{
  const lines=[`שלום ${first(p.name)}, ההרשמה שלך ל${p.event.name} התקבלה ✓`,whenLine(p.event),`מספר הרשמה: ${regNo(p.attendeeId)}`]
  if(p.guest)lines.push(`בקשת המלווה (${p.guest}) ממתינה לאישור – נעדכן אותך כאן.`)
  lines.push('יום לפני האירוע נשלח לך פרטי הגעה וחניה.','יש שאלה על האירוע או על המסלולים? אפשר לכתוב לנו כאן.')
  const r=await sendWhatsApp(p.phone,lines.filter(Boolean).join('\n'))
  await logSend('confirmation',p.attendeeId,!!r.ok)
 }catch(e){console.error('[event-notify] confirmation',e instanceof Error?e.name:'error')}
}

/** Tells the registrant whether their companion was approved or not. */
export async function sendCompanionDecision(companionId:number,approved:boolean){
 try{
  const [row]=await sql`SELECT g.name AS guest,h.id AS host_id,h.name AS host,h.phone,e.name AS event,e.date,e.time,e.location
   FROM event_attendees g JOIN event_attendees h ON h.id=g.companion_of JOIN events e ON e.id=g.event_id WHERE g.id=${companionId} LIMIT 1`
  if(!row?.phone)return
  const text=approved
   ?`שלום ${first(row.host)}, המלווה שלך (${row.guest}) אושר/ה ל${row.event} ✓\n${whenLine(row)}\nנשמח לראות את שניכם.`
   :`שלום ${first(row.host)}, לצערנו לא נוכל לאשר את הגעת המלווה (${row.guest}) ל${row.event}, בשל מגבלת מקום.\nההרשמה שלך בתוקף ונשמח מאוד לראותך.`
  const r=await sendWhatsApp(row.phone,text)
  await logSend(approved?'companion_approved':'companion_declined',Number(row.host_id),!!r.ok)
 }catch(e){console.error('[event-notify] companion',e instanceof Error?e.name:'error')}
}
