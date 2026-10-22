import {NextRequest,NextResponse} from 'next/server'
import sql from '@/lib/db'
import {RegistrationError,validateRegistrationAnswers} from '@/lib/event-registration'
import {registrationBody,registrationFailure,registrationReady} from '@/lib/event-registration-server'

async function publicForm(slug:string){
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(slug))throw new RegistrationError('הקישור אינו תקין',404)
 if(!await registrationReady())throw new RegistrationError('ההרשמה אינה זמינה כרגע',503)
 const [row]=await sql`SELECT e.id,e.name,e.date,e.time,e.location,e.status,f.title,f.description,f.logo,f.fields,f.enabled,f.version
 FROM events e JOIN event_registration_forms f ON f.event_id=e.id WHERE e.slug=${slug} LIMIT 1`
 if(!row)throw new RegistrationError('טופס ההרשמה אינו קיים או טרם נפתח',404)
 return row
}
export async function GET(_req:NextRequest,ctx:{params:Promise<{slug:string}>}){
 try{const {slug}=await ctx.params,r=await publicForm(slug),open=r.enabled&&!['done','cancelled'].includes(r.status)
  return NextResponse.json({event:{name:r.name,date:r.date,time:r.time,location:r.location},form:{title:r.title,description:r.description,logo:r.logo,fields:open?r.fields:[],version:r.version,enabled:open}},{headers:{'Cache-Control':'no-store'}})
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
  const emailField=r.fields.find((f:any)=>f.type==='email')
  const [result]=await sql`SELECT * FROM register_event_attendee(${r.id},${answers.name},${answers.phone},${emailField?answers[emailField.id]||'':''},'registration',${d.key}::uuid,${JSON.stringify(answers)}::jsonb,${JSON.stringify(r.fields)}::jsonb,${r.version},true)`
  return NextResponse.json({ok:true,waitlisted:result.is_waitlisted})
 }catch(e){return registrationFailure(e)}
}
