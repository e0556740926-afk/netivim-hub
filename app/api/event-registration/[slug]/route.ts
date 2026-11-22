import {NextRequest,NextResponse} from 'next/server'
import sql from '@/lib/db'
import {hasColumn} from '@/lib/schema'
import {RegistrationError,validateRegistrationAnswers} from '@/lib/event-registration'
import {registrationBody,registrationFailure,registrationReady} from '@/lib/event-registration-server'
import {pageDesign,parseGuest,regNo} from '@/lib/veida'
import {sendRegistrationConfirmation} from '@/lib/event-notify'

async function publicForm(slug:string){
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(slug))throw new RegistrationError('הקישור אינו תקין',404)
 if(!await registrationReady())throw new RegistrationError('ההרשמה אינה זמינה כרגע',503)
 const designed=await hasColumn('events','page_design')
 const [row]=designed
  ?await sql`SELECT e.id,e.name,e.date,e.time,e.location,e.status,e.page_design,f.title,f.description,f.logo,f.fields,f.enabled,f.version
   FROM events e JOIN event_registration_forms f ON f.event_id=e.id WHERE e.slug=${slug} LIMIT 1`
  :await sql`SELECT e.id,e.name,e.date,e.time,e.location,e.status,f.title,f.description,f.logo,f.fields,f.enabled,f.version
   FROM events e JOIN event_registration_forms f ON f.event_id=e.id WHERE e.slug=${slug} LIMIT 1`
 if(!row)throw new RegistrationError('טופס ההרשמה אינו קיים או טרם נפתח',404)
 return {...(row as any),page_design:pageDesign(row.page_design)} as any
}

/** Personal invitation token (?i=) → the invitee's name/phone for prefill. Never throws. */
async function inviteFor(eventId:number,token:string|null){
 if(!token||!/^[A-Za-z0-9]{8,32}$/.test(token))return null
 try{
  if(!await hasColumn('event_attendees','invite_id'))return null
  const [inv]=await sql`SELECT i.id,i.inviter_id,c.name,c.phone FROM event_invites i JOIN contacts c ON c.id=i.contact_id WHERE i.event_id=${eventId} AND i.token=${token} LIMIT 1`
  return inv||null
 }catch{return null}
}
/** Coordinator link (?ref=<users.slug>) → the inviter's user id. Never throws. */
async function refUser(ref:string|null){
 if(!ref||!/^[a-zA-Z0-9_-]{1,80}$/.test(ref))return null
 try{const [u]=await sql`SELECT id FROM users WHERE slug=${ref} AND deleted_at IS NULL LIMIT 1`;return u?.id??null}catch{return null}
}

export async function GET(req:NextRequest,ctx:{params:Promise<{slug:string}>}){
 try{const {slug}=await ctx.params,r=await publicForm(slug),open=r.enabled&&!['done','cancelled'].includes(r.status)
  const inv=r.page_design==='veida'?await inviteFor(Number(r.id),req.nextUrl.searchParams.get('i')):null
  if(inv){try{await sql`UPDATE event_invites SET opened_at=COALESCE(opened_at,now()) WHERE id=${inv.id}`}catch{}}
  return NextResponse.json({design:r.page_design,event:{name:r.name,date:r.date,time:r.time,location:r.location},invite:inv?{name:inv.name||'',phone:inv.phone||''}:null,
   form:{title:r.title,description:r.description,logo:r.logo,fields:open?r.fields:[],version:r.version,enabled:open}},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return registrationFailure(e)}
}

export async function POST(req:NextRequest,ctx:{params:Promise<{slug:string}>}){
 try{
  const {slug}=await ctx.params,d=await registrationBody(req)
  if(d.website)return NextResponse.json({ok:true,waitlisted:false}) // hidden spam trap, never stores a row
  if(typeof d.key!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(d.key))throw new RegistrationError('יש לרענן את טופס ההרשמה')
  const r=await publicForm(slug)
  if(!r.enabled||['done','cancelled'].includes(r.status))throw new RegistrationError('ההרשמה לאירוע סגורה כרגע',409)
  if(d.version!==r.version)throw new RegistrationError('הטופס השתנה. רעננו את העמוד לפני ההרשמה.',409)
  const answers=validateRegistrationAnswers(r.fields,d.answers)
  let guest=null
  if(r.page_design==='veida'){try{guest=parseGuest(d.guest)}catch(e){throw new RegistrationError(e instanceof Error?e.message:'פרטי המלווה אינם תקינים')}}
  const emailField=r.fields.find((f:any)=>f.type==='email')
  const [result]=await sql`SELECT * FROM register_event_attendee(${r.id},${answers.name},${answers.phone},${emailField?answers[emailField.id]||'':''},'registration',${d.key}::uuid,${JSON.stringify(answers)}::jsonb,${JSON.stringify(r.fields)}::jsonb,${r.version},true)`
  const attendeeId=Number(result.attendee_id)
  if(r.page_design==='veida'&&await hasColumn('event_attendees','companion_of')){
   // Someone who cancelled through the bot and registers again is active again.
   if(result.already_registered)await sql`UPDATE event_attendees SET declined_at=NULL,waitlisted=false WHERE id=${attendeeId} AND companion_of IS NULL AND declined_at IS NOT NULL`
   const inv=await inviteFor(Number(r.id),typeof d.invite==='string'?d.invite:null)
   const inviter=inv?.inviter_id??await refUser(typeof d.ref==='string'?d.ref:null)
   if(inviter||inv)await sql`UPDATE event_attendees SET inviter_id=COALESCE(inviter_id,${inviter}),invite_id=COALESCE(invite_id,${inv?.id??null}) WHERE id=${attendeeId}`
   if(guest){
    // One companion per registrant: re-registering updates it instead of adding another row.
    const [existing]=await sql`SELECT id FROM event_attendees WHERE event_id=${r.id} AND companion_of=${attendeeId} ORDER BY id LIMIT 1`
    const extra=JSON.stringify({role_org:guest.role})
    if(existing)await sql`UPDATE event_attendees SET name=${guest.name},phone=${guest.phone},registration_answers=${extra}::jsonb WHERE id=${existing.id} AND declined_at IS NULL`
    else await sql`INSERT INTO event_attendees(event_id,name,phone,email,waitlisted,source,companion_of,inviter_id,registration_answers)
     VALUES(${r.id},${guest.name},${guest.phone},'',true,'companion',${attendeeId},${inviter},${extra}::jsonb)`
   }
   if(!result.already_registered)await sendRegistrationConfirmation({event:r,attendeeId,name:String(answers.name),phone:String(answers.phone),guest:guest?.name||null}).catch(()=>{})
  }
  // The conference page shows a registration number on its confirmation; the regular form keeps its minimal reply.
  if(r.page_design!=='veida')return NextResponse.json({ok:true,waitlisted:result.is_waitlisted})
  return NextResponse.json({ok:true,waitlisted:result.is_waitlisted,already:!!result.already_registered,registrationNo:regNo(attendeeId)})
 }catch(e){return registrationFailure(e)}
}
