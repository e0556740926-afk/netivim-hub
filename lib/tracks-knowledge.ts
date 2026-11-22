// Knowledge for the tracks bot: the published "מאגר ידע: מסלולים ומסגרות"
// documents from the knowledge center, as text in bot_knowledge. The text is
// extracted by netlify/functions/bot-knowledge-background.mts (PDFs take
// longer than a normal request allows); the bot answers only from it.
import sql from '@/lib/db'

export async function trackKnowledgeText():Promise<string>{
 try{
  const rows=await sql`SELECT title,body FROM bot_knowledge ORDER BY title`
  return rows.map((r:any)=>`## ${r.title}\n${r.body}`).join('\n\n')
 }catch{return ''}
}

/** Published items vs what the bot already knows — for the settings screen. */
export async function trackKnowledgeStatus(){
 try{
  const rows=await sql`SELECT k.id,k.title,k.version,b.source_version,b.updated_at,length(b.body)::int AS chars
   FROM knowledge_items k LEFT JOIN bot_knowledge b ON b.item_id=k.id
   WHERE k.status='published' AND k.topic LIKE 'מאגר ידע%' ORDER BY k.title`
  return rows.map((r:any)=>({title:r.title,internal:/תיכונ/.test(r.title),current:r.source_version===r.version,updated_at:r.updated_at,chars:r.chars||0}))
 }catch{return []}
}

/** Starts the background extraction; returns at once. */
export async function startKnowledgeRefresh(origin:string){
 const res=await fetch(`${origin}/.netlify/functions/bot-knowledge-background`,{method:'POST',headers:{'x-netivim-secret':process.env.NEXTAUTH_SECRET||''}})
 return res.status===202||res.ok
}
