import sql from '@/lib/db'
import {hasColumn} from '@/lib/schema'

export const organizationFields=['name','registration_number','city','address','phone','email','website','contact_name','notes'] as const
export function normalizeOrganizationName(value:unknown){return String(value||'').trim().replace(/\s+/g,' ')}
export function organizationInput(body:Record<string,unknown>){
  const d=Object.fromEntries(organizationFields.map(key=>[key,key==='name'?normalizeOrganizationName(body[key]):String(body[key]||'').trim()])) as Record<typeof organizationFields[number],string>
  if(!d.name||d.name.length>200)throw new OrganizationError('יש להזין שם עמותה או מוסד, עד 200 תווים',400)
  if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))throw new OrganizationError('כתובת הדוא״ל אינה תקינה',400)
  if(d.website){try{const u=new URL(/^https?:\/\//i.test(d.website)?d.website:'https://'+d.website);if(!['https:','http:'].includes(u.protocol)||!u.hostname.includes('.')||u.username||u.password)throw Error();d.website=u.href}catch{throw new OrganizationError('יש להזין כתובת אתר תקינה',400)}}
  if(organizationFields.some(key=>d[key].length>(key==='notes'?5000:500)))throw new OrganizationError('אחד הפרטים ארוך מדי',400)
  return d
}
export class OrganizationError extends Error{constructor(message:string,public status:number){super(message)}}
export async function organizationRegistryReady(){return (await hasColumn('partner_organizations','id'))&&(await hasColumn('contacts','partner_organization_id'))}

/** Existing text clients may select an existing name; they cannot create organizations implicitly. */
export async function resolveContactOrganization(d:any,creating:boolean){
  if(!(await organizationRegistryReady())){
    if('partner_organization_id' in d)throw new OrganizationError('יש להפעיל את עדכון מאגר העמותות והמוסדות לפני שמירת שיוך',503)
    return undefined
  }
  if(!creating&&!('partner_organization_id' in d)&&!('org' in d))return undefined
  // No organization chosen is allowed (the registry is curated by hand and
  // may be empty): the contact is simply "ללא שיוך". null = explicitly none.
  const noOrgId=d.partner_organization_id===null||d.partner_organization_id===''||d.partner_organization_id===undefined
  if(noOrgId&&!String(d.org??'').trim()){d.org='';d.partner_organization_id=null;return null}
  let rows:any[]
  if('partner_organization_id' in d&&!noOrgId){
    const id=Number(d.partner_organization_id)
    if(!Number.isSafeInteger(id)||id<=0)throw new OrganizationError('יש לבחור עמותה או מוסד קיימים',400)
    rows=await sql`SELECT id,name FROM partner_organizations WHERE id=${id} LIMIT 1`
  }else{
    const name=normalizeOrganizationName(d.org)
    rows=await sql`SELECT id,name FROM partner_organizations WHERE lower(name)=lower(${name}) LIMIT 1`
  }
  if(!rows[0])throw new OrganizationError('העמותה או המוסד לא נמצאו. יש לבחור רשומה קיימת מהמאגר',400)
  d.org=rows[0].name;d.partner_organization_id=Number(rows[0].id)
  return rows[0]
}
