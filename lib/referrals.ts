import sql from '@/lib/db'
import {hasColumn} from '@/lib/schema'
import {verifyReferral} from '@/lib/referral-token'

/** Public resolution returns attribution labels only, never contact phone/email. */
export async function resolveReferral(token:string){
  const claims=verifyReferral(token);if(!claims)return null
  const [coord]=await sql`SELECT id,name FROM coordinators WHERE id=${claims.coordinatorId} LIMIT 1`
  if(!coord)return null
  let contact:any=null
  if(claims.contactId){
    const soft=await hasColumn('contacts','deleted_at')
    const rows=soft?await sql`SELECT id,name,org FROM contacts WHERE id=${claims.contactId} AND deleted_at IS NULL LIMIT 1`:await sql`SELECT id,name,org FROM contacts WHERE id=${claims.contactId} LIMIT 1`
    contact=rows[0];if(!contact)return null
    if(!(await hasColumn('leads','contact_id')))return null
  }
  return {coordinatorId:Number(coord.id),coordinatorName:String(coord.name),contactId:contact?Number(contact.id):null,partnerName:contact?String(contact.name):null,organization:contact?String(contact.org||''):null,expiresAt:claims.exp}
}
