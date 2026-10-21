import {NextRequest,NextResponse} from 'next/server'
import sql from '@/lib/db'
import {currentUser} from '@/lib/auth-server'
import {hasColumn} from '@/lib/schema'
import {signReferral} from '@/lib/referral-token'

export async function POST(req:NextRequest){
  const user=await currentUser(req)
  if(!user)return NextResponse.json({error:'לא מורשה'},{status:401})
  if(!['admin','field_manager','recruitment_manager','coordinator'].includes(user.role))return NextResponse.json({error:'אין הרשאה ליצור קישורים'},{status:403})
  let d:any;try{d=await req.json()}catch{return NextResponse.json({error:'בקשה לא תקינה'},{status:400})}
  const coordinatorId=Number(d.coordinator_id),contactId=d.contact_id==null?null:Number(d.contact_id)
  if(!Number.isSafeInteger(coordinatorId)||coordinatorId<=0||(contactId!==null&&(!Number.isSafeInteger(contactId)||contactId<=0)))return NextResponse.json({error:'יש לבחור רכז ושותף תקינים'},{status:400})
  const [coord]=await sql`SELECT id,name,user_id FROM coordinators WHERE id=${coordinatorId} LIMIT 1`
  if(!coord)return NextResponse.json({error:'הרכז לא נמצא'},{status:404})
  if(user.role==='coordinator'&&Number(coord.user_id)!==user.id)return NextResponse.json({error:'ניתן ליצור קישור רק לעצמך'},{status:403})
  let contact:any=null
  if(contactId){
    if(!(await hasColumn('leads','contact_id')))return NextResponse.json({error:'שיוך לשותף דורש הפעלת עמודת contact_id בלידים לפני יצירת הקישור'},{status:409})
    const soft=await hasColumn('contacts','deleted_at')
    const rows=soft?await sql`SELECT id,name,org,owner,coordinator_id FROM contacts WHERE id=${contactId} AND deleted_at IS NULL LIMIT 1`:await sql`SELECT id,name,org,owner,coordinator_id FROM contacts WHERE id=${contactId} LIMIT 1`
    contact=rows[0];if(!contact)return NextResponse.json({error:'השותף לא נמצא'},{status:404})
    if(user.role==='coordinator'&&Number(contact.coordinator_id)!==coordinatorId)return NextResponse.json({error:'ניתן להשתמש רק בשותף המשויך אליך'},{status:403})
  }
  try{const token=signReferral(coordinatorId,contactId);return NextResponse.json({path:'/j/referral?ref='+encodeURIComponent(token),coordinator:{id:coord.id,name:coord.name},partner:contact?{id:contact.id,name:contact.name,org:contact.org}:null},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'יצירת קישורים אינה זמינה כרגע. יש להגדיר מפתח חתימה בשרת.'},{status:503})}
}
