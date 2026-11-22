import {NextRequest,NextResponse} from 'next/server'
import {randomBytes} from 'crypto'
import sql from '@/lib/db'
import {currentUser} from '@/lib/auth-server'
import {accessLevel} from '@/lib/permission-matrix'
import {hasColumn} from '@/lib/schema'
import {DEFAULT_INVITE_TEMPLATE,fillInvite,whenLine} from '@/lib/veida'

/**
 * Personal invitations: each coordinator sends the registration link from
 * their own WhatsApp to the contacts and partners they own. The server only
 * mints the personal link and records who was invited; the message itself
 * leaves the coordinator's phone (wa.me), never the bot number.
 */
async function ctx(req:NextRequest,id:number){
 const me=await currentUser(req)
 if(!me)return {error:NextResponse.json({error:'יש להתחבר למערכת'},{status:401})}
 const level=accessLevel(me as any,'events')
 if(level==='NONE')return {error:NextResponse.json({error:'אין הרשאה'},{status:403})}
 if(!await hasColumn('event_attendees','invite_id'))return {error:NextResponse.json({error:'יש להחיל את מיגרציית ההזמנות'},{status:503})}
 const [event]=await sql`SELECT id,name,date,time,location,slug,status,invite_template FROM events WHERE id=${id} LIMIT 1`
 if(!event)return {error:NextResponse.json({error:'האירוע לא נמצא'},{status:404})}
 const [coord]=await sql`SELECT id FROM coordinators WHERE user_id=${me.id} LIMIT 1`
 return {me,event,manager:level==='M',coordId:coord?.id??null}
}
const origin=(req:NextRequest)=>(process.env.NEXTAUTH_URL||req.nextUrl.origin).replace(/\/$/,'')
const token=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';return [...randomBytes(12)].map(b=>a[b%a.length]).join('')}

export async function GET(req:NextRequest,c:{params:Promise<{id:string}>}){
 const id=Number((await c.params).id),x=await ctx(req,id)
 if('error' in x)return x.error
 const {me,event,manager,coordId}=x
 // "Mine" = contacts owned by this coordinator, by coordinator id or (older rows) by owner name.
 const contacts=await sql`
  SELECT ct.id,ct.name,ct.phone,ct.org,ct.role,ct.type,ct.city,i.id AS invite_id,i.sent_at,i.reminded_at,i.opened_at,
   (SELECT a.id FROM event_attendees a WHERE a.event_id=${id} AND a.companion_of IS NULL AND (a.invite_id=i.id OR
     (length(regexp_replace(COALESCE(ct.phone,''),'\\D','','g'))>=9 AND right(regexp_replace(COALESCE(a.phone,''),'\\D','','g'),9)=right(regexp_replace(COALESCE(ct.phone,''),'\\D','','g'),9)))
    ORDER BY a.id LIMIT 1) AS attendee_id
  FROM contacts ct LEFT JOIN event_invites i ON i.event_id=${id} AND i.contact_id=ct.id
  WHERE ct.deleted_at IS NULL AND (ct.coordinator_id=${coordId} OR (ct.coordinator_id IS NULL AND btrim(COALESCE(ct.owner,''))=btrim(${me.name})))
  ORDER BY ct.name LIMIT 1000`
 let summary:any[]=[]
 if(manager){
  summary=await sql`SELECT u.id,u.name,count(DISTINCT i.id)::int AS invited,
    count(DISTINCT a.id) FILTER (WHERE a.companion_of IS NULL)::int AS registered
   FROM users u LEFT JOIN event_invites i ON i.inviter_id=u.id AND i.event_id=${id}
   LEFT JOIN event_attendees a ON a.event_id=${id} AND a.inviter_id=u.id
   WHERE u.deleted_at IS NULL AND (i.id IS NOT NULL OR a.id IS NOT NULL) GROUP BY u.id,u.name ORDER BY registered DESC,invited DESC`
 }
 return NextResponse.json({event:{id:event.id,name:event.name,slug:event.slug,when:whenLine(event)},template:event.invite_template||DEFAULT_INVITE_TEMPLATE,
  canEditTemplate:manager,contacts,summary,coordinatorLink:event.slug?`${origin(req)}/register/${event.slug}`:''},{headers:{'Cache-Control':'no-store'}})
}

/** { contact_id } → personal link + ready WhatsApp text; marks the invite as sent (or reminded). */
export async function POST(req:NextRequest,c:{params:Promise<{id:string}>}){
 const id=Number((await c.params).id),x=await ctx(req,id)
 if('error' in x)return x.error
 const {me,event,manager,coordId}=x
 if(!event.slug)return NextResponse.json({error:'לאירוע עדיין אין קישור הרשמה'},{status:409})
 const d=await req.json().catch(()=>({}))
 const contactId=Number(d.contact_id)
 const [ct]=await sql`SELECT id,name,phone FROM contacts WHERE id=${contactId} AND deleted_at IS NULL
  AND (${manager} OR coordinator_id=${coordId} OR (coordinator_id IS NULL AND btrim(COALESCE(owner,''))=btrim(${me.name}))) LIMIT 1`
 if(!ct)return NextResponse.json({error:'איש הקשר לא נמצא ברשימה שלך'},{status:404})
 const [inv]=await sql`INSERT INTO event_invites(event_id,contact_id,inviter_id,token,sent_at) VALUES(${id},${contactId},${me.id},${token()},now())
  ON CONFLICT(event_id,contact_id) DO UPDATE SET reminded_at=CASE WHEN event_invites.sent_at IS NULL THEN NULL ELSE now() END,
   sent_at=COALESCE(event_invites.sent_at,now()),inviter_id=COALESCE(event_invites.inviter_id,EXCLUDED.inviter_id)
  RETURNING id,token,sent_at,reminded_at`
 const link=`${origin(req)}/register/${event.slug}?i=${inv.token}`
 const text=fillInvite(event.invite_template||'',{name:ct.name||'',link,when:whenLine(event),inviter:me.name||''})
 return NextResponse.json({link,text,phone:ct.phone||'',invite:inv})
}

/** { template } — the invitation wording, shared by all coordinators (managers only). */
export async function PUT(req:NextRequest,c:{params:Promise<{id:string}>}){
 const id=Number((await c.params).id),x=await ctx(req,id)
 if('error' in x)return x.error
 if(!x.manager)return NextResponse.json({error:'רק מנהל יכול לשנות את נוסח ההזמנה'},{status:403})
 const d=await req.json().catch(()=>({}))
 const t=String(d.template||'').slice(0,1500)
 if(t&&!t.includes('{קישור}'))return NextResponse.json({error:'הנוסח חייב לכלול את {קישור}'},{status:400})
 await sql`UPDATE events SET invite_template=${t} WHERE id=${id}`
 return NextResponse.json({ok:true,template:t||DEFAULT_INVITE_TEMPLATE})
}
