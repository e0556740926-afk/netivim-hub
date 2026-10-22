import {NextRequest,NextResponse} from 'next/server'
import sql from '@/lib/db'
import {defaultRegistration,parseRegistrationForm,RegistrationError} from '@/lib/event-registration'
import {registrationAccess,registrationBody,registrationFailure,registrationReady} from '@/lib/event-registration-server'
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){
 try{
  const {id}=await ctx.params,event=await registrationAccess(req,Number(id))
  if(!await registrationReady())return NextResponse.json({form:defaultRegistration(event.name),event,available:false},{headers:{'Cache-Control':'no-store'}})
  const [form]=await sql`SELECT title,description,logo,fields,enabled,version FROM event_registration_forms WHERE event_id=${Number(id)}`
  return NextResponse.json({form:form||defaultRegistration(event.name),event,available:true},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return registrationFailure(e)}
}
export async function PUT(req:NextRequest,ctx:{params:Promise<{id:string}>}){
 try{
  const {id}=await ctx.params,event=await registrationAccess(req,Number(id),true)
  if(!await registrationReady())throw new RegistrationError('יש להחיל את מיגרציית טפסי האירועים לפני שמירה',503)
  const f=parseRegistrationForm(await registrationBody(req))
  if(f.enabled&&!event.slug)throw new RegistrationError('לאירוע חסר קישור אישי. יש לשמור קישור לאירוע לפני פתיחת הרשמה')
  if(f.enabled&&['done','cancelled'].includes(event.status))throw new RegistrationError('לא ניתן לפתוח הרשמה לאירוע שהסתיים או בוטל')
  const [saved]=await sql`WITH updated AS (
   UPDATE event_registration_forms SET title=${f.title},description=${f.description},logo=${f.logo},fields=${JSON.stringify(f.fields)}::jsonb,enabled=${f.enabled},version=version+1,updated_at=now()
   WHERE event_id=${Number(id)} AND version=${f.version} RETURNING title,description,logo,fields,enabled,version
  ), inserted AS (
   INSERT INTO event_registration_forms(event_id,title,description,logo,fields,enabled)
   SELECT ${Number(id)},${f.title},${f.description},${f.logo},${JSON.stringify(f.fields)}::jsonb,${f.enabled} WHERE ${f.version}=0
   ON CONFLICT(event_id) DO NOTHING RETURNING title,description,logo,fields,enabled,version
  ) SELECT * FROM updated UNION ALL SELECT * FROM inserted`
  if(!saved)throw new RegistrationError('הטופס עודכן בחלון אחר. רעננו לפני שמירה נוספת.',409)
  return NextResponse.json({form:saved})
 }catch(e){return registrationFailure(e)}
}
