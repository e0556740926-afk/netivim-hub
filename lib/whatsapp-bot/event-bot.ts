// Event mode of the WhatsApp bot: people registered (or personally invited)
// to an upcoming event can ask about the event and about Netivim's tracks.
// Track answers come from Claude, grounded only in the knowledge center's
// "מאגר ידע" documents; what the material doesn't cover goes to the
// coordinator who invited them. Staff keep the regular bot; unknown numbers
// stay silent.
import sql from '@/lib/db'
import {sendWhatsApp} from '@/lib/whatsapp'
import {callClaude,claudeConfigured} from '@/lib/anthropic'
import {trackKnowledgeText} from '@/lib/tracks-knowledge'
import {regNo,whenLine} from '@/lib/veida'
import type {BotReply} from './types'
export type EventReply=BotReply&{ai?:boolean}

export type EventGuest={kind:'registrant'|'invitee';eventId:number;eventName:string;event:any;attendeeId:number|null;name:string;inviterId:number|null;inviteToken:string|null;slug:string|null}
const DAILY_QUESTIONS=20
export const EVENT_BOT_SENDER='בוט אירוע'

/** The phone's registration (or personal invitation) to an upcoming event, if any. */
export async function findEventGuest(phoneKey:string):Promise<EventGuest|null>{
 try{
  const [col]=await sql`SELECT 1 AS ok FROM information_schema.columns WHERE table_name='event_attendees' AND column_name='companion_of' LIMIT 1`
  if(!col)return null
  const tail=phoneKey.slice(-9)
  const [a]=await sql`SELECT a.id,a.name,a.inviter_id,a.declined_at,e.id AS event_id,e.name AS event_name,e.date,e.time,e.location,e.slug,e.bot_info
   FROM event_attendees a JOIN events e ON e.id=a.event_id
   WHERE right(regexp_replace(COALESCE(a.phone,''),'\\D','','g'),9)=${tail} AND a.companion_of IS NULL AND a.declined_at IS NULL
    AND e.status NOT IN ('done','cancelled') AND (e.date IS NULL OR e.date>=CURRENT_DATE-1)
   ORDER BY e.date NULLS LAST,a.id DESC LIMIT 1`
  if(a)return {kind:'registrant',eventId:a.event_id,eventName:a.event_name,event:a,attendeeId:Number(a.id),name:a.name||'',inviterId:a.inviter_id??null,inviteToken:null,slug:a.slug}
  const [i]=await sql`SELECT i.token,i.inviter_id,c.name,e.id AS event_id,e.name AS event_name,e.date,e.time,e.location,e.slug,e.bot_info
   FROM event_invites i JOIN contacts c ON c.id=i.contact_id JOIN events e ON e.id=i.event_id
   WHERE right(regexp_replace(COALESCE(c.phone,''),'\\D','','g'),9)=${tail} AND i.sent_at IS NOT NULL
    AND e.status NOT IN ('done','cancelled') AND (e.date IS NULL OR e.date>=CURRENT_DATE-1)
   ORDER BY e.date NULLS LAST LIMIT 1`
  if(i)return {kind:'invitee',eventId:i.event_id,eventName:i.event_name,event:i,attendeeId:null,name:i.name||'',inviterId:i.inviter_id??null,inviteToken:i.token,slug:i.slug}
  return null
 }catch(e){console.error('[event-bot] lookup',e instanceof Error?e.name:'error');return null}
}

const first=(n:string)=>n.trim().split(/\s+/)[0]||''
function info(g:EventGuest){const b=g.event.bot_info||{};return {venue:b.venue||g.event.location||'',address:b.address||'',nav:b.nav||'',parking:b.parking||'',transport:b.transport||'',program:b.program||'',access:b.access||'',contact:b.contact||'',extra:b.extra||''}}
function eventDetails(g:EventGuest){
 const i=info(g)
 return [`*${g.eventName}*`,whenLine({date:g.event.date,time:g.event.time,location:i.venue})||'המועד יפורסם בקרוב',
  i.address&&`כתובת: ${i.address}`,i.nav&&`ניווט: ${i.nav}`,i.parking&&`חניה: ${i.parking}`,i.transport&&`תחבורה ציבורית: ${i.transport}`,
  i.program&&`בתוכנית: ${i.program}`,i.access&&`נגישות: ${i.access}`,!i.venue&&'המקום המדויק יישלח לנרשמים בקרוב.'].filter(Boolean).join('\n')
}
function menu(g:EventGuest):BotReply{
 const lines=g.kind==='registrant'
  ?[`שלום ${first(g.name)} 🙂 כאן הבוט של ${g.eventName}.`,'','1️⃣ פרטי האירוע – מתי, איפה, חניה','2️⃣ ההרשמה שלי','3️⃣ ביטול הגעה','4️⃣ שאלה על המסלולים (הסדר, מכינות, קרבי, תומכי לחימה, טכנולוגי)','','אפשר גם פשוט לכתוב שאלה.']
  :[`שלום ${first(g.name)} 🙂 כאן הבוט של ${g.eventName}.`,'','1️⃣ פרטי האירוע','2️⃣ קישור לאישור הגעה','4️⃣ שאלה על המסלולים','','אפשר גם פשוט לכתוב שאלה.']
 return {text:lines.join('\n'),numbered:true}
}
async function lastBotText(phoneKey:string){
 const [r]=await sql`SELECT body FROM whatsapp_messages WHERE phone=${phoneKey} AND direction='out' AND created_at>now()-interval '15 minutes' ORDER BY id DESC LIMIT 1`
 return String(r?.body||'')
}
/** Recent turns for context, as alternating user/assistant messages ending with the current question. */
async function conversation(phoneKey:string,current:string){
 const rows=await sql`SELECT direction,body FROM whatsapp_messages WHERE phone=${phoneKey} AND created_at>now()-interval '2 hours' ORDER BY id DESC LIMIT 7`
 const turns=rows.reverse().map((r:any)=>({role:r.direction==='in'?'user' as const:'assistant' as const,content:String(r.body||'').slice(0,1500)}))
 if(!turns.length||turns[turns.length-1].role!=='user'||turns[turns.length-1].content!==current.slice(0,1500))turns.push({role:'user',content:current.slice(0,1500)})
 const merged:{role:'user'|'assistant';content:string}[]=[]
 for(const m of turns){const last=merged[merged.length-1];if(last&&last.role===m.role)last.content+='\n'+m.content;else merged.push({...m})}
 while(merged.length&&merged[0].role!=='user')merged.shift()
 return merged.slice(-5).length%2===0?merged.slice(-4):merged.slice(-5)
}
async function forward(g:EventGuest,phoneKey:string,question:string,support:()=>Promise<string>){
 let to=''
 if(g.inviterId){const [u]=await sql`SELECT phone FROM users WHERE id=${g.inviterId} LIMIT 1`;to=u?.phone||''}
 if(!to)to=await support()
 if(!to)return false
 const r=await sendWhatsApp(to,`❓ שאלה מ${g.name||'משתתף'} (${phoneKey.replace(/^972/,'0')}) על ${g.eventName}:\n"${question.slice(0,600)}"\nהבוט לא מצא תשובה בחומר. אפשר לענות לו ישירות.`)
 return !!r.ok
}

const SYSTEM=(g:EventGuest,knowledge:string)=>`אתה הבוט של מרכז נתיבים בוואטסאפ. נתיבים הוא מרכז ייעוץ והכוון לצעירים חרדים, ללא עלות לבחור ולמשפחה. אתה מדבר עם ${g.name||'משתתף'}, ${g.kind==='registrant'?'שנרשם':'שהוזמן'} ל${g.eventName}.
כללים:
- ענה בעברית, קצר (עד 6 שורות), מכבד, בגוף שני. בלי כותרות ובלי טבלאות. אפשר הדגשה עם *כוכביות* כמו בוואטסאפ.
- ענה רק מתוך החומר שלמטה. אם התשובה לא מופיעה בו, כתוב בדיוק: "לא מצאתי על זה מידע מדויק – העברתי את השאלה לרכז, והוא יחזור אליך." ואל תנחש.
- נתיבים לא מכוון למסלול מסוים. אל תמליץ על מסלול ואל תקבע מה מתאים לאדם; אם שואלים "מה מתאים לי", הסבר בקצרה את האפשרויות הרלוונטיות והצע שיחה עם יועץ של נתיבים.
- המונחים: מסלול (לא טראק), יועץ (לא מנטור), מסגרת.
- אל תבקש מספר תעודת זהות או מידע רגיש.
- שאלות על הוועידה עצמה: השתמש בפרטי האירוע.

# פרטי האירוע
${eventDetails(g)}

# חומר מקצועי – מאגר הידע של נתיבים
${knowledge||'(אין כרגע חומר זמין)'}`
const NO_ANSWER='לא מצאתי על זה מידע מדויק'

/** Replies for one incoming text. Returns null when the message should be ignored. */
export async function handleEventMessage(g:EventGuest,phoneKey:string,text:string,support:()=>Promise<string>):Promise<EventReply[]>{
 const t=text.trim(),low=t.replace(/[.!?״"']/g,'').trim()
 if(!t)return []
 if(/^(תודה|תודה רבה|🙏|👍|ok|אוקי|סבבה)$/i.test(low))return []
 // Opt-out from campaign messages (the bot still answers if they write later).
 if(/^(הסר|הסירו|הסרה|stop)$/i.test(low)){
  try{await sql`INSERT INTO msg_suppressions(channel,value_norm,reason,source) VALUES('whatsapp',${'+'+phoneKey},'unsubscribe','בוט אירוע') ON CONFLICT DO NOTHING`}catch{}
  return [{text:'הוסרת מהודעות התפוצה בוואטסאפ ✓\nאם תרצו לשאול משהו – אפשר תמיד לכתוב כאן.'}]
 }
 if(/^(תפריט|היי|הי|שלום|start|בוקר טוב|ערב טוב|0)$/i.test(low))return [menu(g)]
 if(low==='1'||/^(פרטים|פרטי האירוע|איפה|מתי|כתובת|חניה)$/.test(low))return [{text:eventDetails(g)}]
 if(low==='2'){
  if(g.kind==='registrant'){
   const [c]=await sql`SELECT name,waitlisted,declined_at FROM event_attendees WHERE companion_of=${g.attendeeId} ORDER BY id LIMIT 1`
   const guest=c?`\nמלווה: ${c.name} – ${c.declined_at?'לא אושר':c.waitlisted?'ממתין לאישור':'אושר ✓'}`:''
   return [{text:`ההרשמה שלך ל${g.eventName} בתוקף ✓\nמספר הרשמה: ${regNo(g.attendeeId!)}${guest}\n${whenLine({date:g.event.date,time:g.event.time,location:info(g).venue})}`}]
  }
  const origin=(process.env.NEXTAUTH_URL||'').replace(/\/$/,'')
  return [{text:g.slug?`לאישור הגעה (פחות מדקה):\n${origin}/register/${g.slug}${g.inviteToken?`?i=${g.inviteToken}`:''}`:'קישור ההרשמה עוד לא פורסם. הרכז יעדכן אותך.'}]
 }
 if(g.kind==='registrant'&&(low==='3'||/^(ביטול|ביטול הגעה|לבטל)$/.test(low)))return [{text:'לביטול ההגעה השיבו: *כן לבטל*\nאם התכוונתם למשהו אחר – כתבו *תפריט*.'}]
 if(g.kind==='registrant'&&/^כן,? ?לבטל$/.test(low)){
  if(!(await lastBotText(phoneKey)).startsWith('לביטול ההגעה'))return [{text:'כדי לבטל, כתבו קודם *ביטול* ואז אשרו.'}]
  await sql`UPDATE event_attendees SET declined_at=now(),waitlisted=true WHERE event_id=${g.eventId} AND (id=${g.attendeeId} OR companion_of=${g.attendeeId}) AND declined_at IS NULL`
  return [{text:`ההגעה בוטלה. חבל שלא נתראה, ותודה שעדכנת 🙏\nאם תתחרט – אפשר להירשם שוב מהקישור.`}]
 }
 if(low==='4')return [{text:'בשמחה. כתבו את השאלה – למשל: "מה ההבדל בין ישיבת הסדר למכינה?" או "אילו מסלולים טכנולוגיים יש?"'}]

 // Free text → Claude, grounded in the knowledge center. Rate-limited per number.
 const [{n}]=await sql`SELECT count(*)::int AS n FROM whatsapp_messages WHERE phone=${phoneKey} AND direction='out' AND sender_name=${EVENT_BOT_SENDER} AND kind='ai' AND created_at>now()-interval '24 hours'`
 if(!claudeConfigured()||Number(n)>=DAILY_QUESTIONS){
  const sent=await forward(g,phoneKey,t,support)
  return [{text:sent?'קיבלתי 🙏 העברתי את השאלה לרכז, והוא יחזור אליך בהקדם.':'קיבלתי 🙏 נחזור אליך בהקדם.'}]
 }
 const knowledge=await trackKnowledgeText()
 const answer=await callClaude({system:[{type:'text',text:SYSTEM(g,knowledge),cache_control:{type:'ephemeral'}}],messages:await conversation(phoneKey,t),maxTokens:600})
 if(!answer){const sent=await forward(g,phoneKey,t,support);return [{text:sent?'רגע של תקלה אצלי 😕 העברתי את השאלה לרכז, והוא יחזור אליך.':'רגע של תקלה אצלי 😕 נחזור אליך בהקדם.'}]}
 if(answer.includes(NO_ANSWER))await forward(g,phoneKey,t,support)
 return [{text:answer.slice(0,3500),ai:true}]
}
