import {NextRequest,NextResponse} from 'next/server'
import sql from '@/lib/db'
import {currentUser} from '@/lib/auth-server'
import {organizationInput,organizationRegistryReady,OrganizationError} from '@/lib/partner-organizations'

const readers=['admin','ceo','rav','recruitment_manager','advisor','field_manager','coordinator','secretary','viewer']
const writers=['admin','recruitment_manager','advisor','field_manager','coordinator','secretary']
async function authorize(req:NextRequest,write=false){const user=await currentUser(req);if(!user)throw new OrganizationError('לא מורשה',401);if(!(write?writers:readers).includes(user.role))throw new OrganizationError('אין הרשאה לפעולה זו',403);return user}
function failure(e:any){if(e instanceof OrganizationError)return NextResponse.json({error:e.message},{status:e.status});if(e?.code==='23505')return NextResponse.json({error:'כבר קיימת עמותה או מוסד בשם זה. השתמשו ברשומה הקיימת.'},{status:409});return NextResponse.json({error:'לא ניתן לשמור את הפרטים כרגע. נסו שוב.'},{status:500})}
async function ready(){if(!(await organizationRegistryReady()))throw new OrganizationError('מאגר העמותות והמוסדות ממתין להפעלת עדכון מסד הנתונים',503)}
export async function GET(req:NextRequest){try{await authorize(req);if(!(await organizationRegistryReady()))return NextResponse.json({organizations:[],available:false});const organizations=await sql`SELECT id,name,registration_number,city,address,phone,email,website,contact_name,notes,version,created_at,updated_at FROM partner_organizations ORDER BY name`;return NextResponse.json({organizations,available:true},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:NextRequest){try{const user=await authorize(req,true);await ready();let body:any;try{body=await req.json()}catch{throw new OrganizationError('בקשה לא תקינה',400)}if(!body||typeof body!=='object'||Array.isArray(body))throw new OrganizationError('בקשה לא תקינה',400);const d=organizationInput(body);const [organization]=await sql`INSERT INTO partner_organizations(name,registration_number,city,address,phone,email,website,contact_name,notes,created_by) VALUES(${d.name},${d.registration_number},${d.city},${d.address},${d.phone},${d.email},${d.website},${d.contact_name},${d.notes},${user.id}) RETURNING *`;return NextResponse.json({organization},{status:201})}catch(e){return failure(e)}}
export async function PATCH(req:NextRequest){try{await authorize(req,true);await ready();let body:any;try{body=await req.json()}catch{throw new OrganizationError('בקשה לא תקינה',400)}if(!body||typeof body!=='object'||Array.isArray(body))throw new OrganizationError('בקשה לא תקינה',400);const id=Number(body.id),version=Number(body.version);if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(version)||version<=0)throw new OrganizationError('יש לפתוח מחדש את כרטיס העמותה או המוסד',400);const d=organizationInput(body)
  // One statement updates the master record and legacy contact labels atomically.
  const [organization]=await sql`WITH updated AS (
    UPDATE partner_organizations SET name=${d.name},registration_number=${d.registration_number},city=${d.city},address=${d.address},phone=${d.phone},email=${d.email},website=${d.website},contact_name=${d.contact_name},notes=${d.notes},version=version+1,updated_at=now()
    WHERE id=${id} AND version=${version} RETURNING *
  ), synced AS (UPDATE contacts c SET org=u.name FROM updated u WHERE c.partner_organization_id=u.id RETURNING c.id)
  SELECT u.* FROM updated u`
  if(!organization)throw new OrganizationError('הפרטים השתנו מאז שפתחתם את הכרטיס. סגרו ופתחו אותו מחדש לפני שמירה.',409)
  return NextResponse.json({organization})
}catch(e){return failure(e)}}
