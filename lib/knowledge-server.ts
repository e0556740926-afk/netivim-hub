import {NextRequest,NextResponse} from 'next/server'
import {randomUUID} from 'node:crypto'
import {getStore} from '@netlify/blobs'
import sql from '@/lib/db'
import {currentUser} from '@/lib/auth-server'
import {assetSpec,byteRange,CHUNK_SIZE,KnowledgeError,parseKnowledge} from '@/lib/knowledge'

const roles=['admin','ceo','rav','recruitment_manager','advisor','field_manager','coordinator','secretary','viewer']
const uuid=(v:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}})
const storeName=()=>`netivim-knowledge-${process.env.CONTEXT==='production'?'production':(process.env.DEPLOY_ID||'local').replace(/[^a-zA-Z0-9-]/g,'').slice(0,70)}`
const store=(name:string)=>getStore({name,consistency:'strong'})
async function body(req:NextRequest){const raw=await req.text();if(raw.length>600000)throw new KnowledgeError('התוכן גדול מדי',413);try{return JSON.parse(raw)}catch{throw new KnowledgeError('תוכן בקשה לא תקין')}}
function manager(role:string){if(role!=='admin')throw new KnowledgeError('ניהול תוכן זמין למנהל בלבד',403)}
async function visible(id:string,user:{id:number;role:string}){
 if(!uuid(id))throw new KnowledgeError('התוכן לא נמצא',404)
 const [item]=await sql`SELECT k.*,a.name asset_name,p.name pdf_name,EXISTS(SELECT 1 FROM knowledge_favorites f WHERE f.item_id=k.id AND f.user_id=${user.id}) favorite
 FROM knowledge_items k LEFT JOIN knowledge_assets a ON a.id=k.asset_id LEFT JOIN knowledge_assets p ON p.id=k.pdf_asset_id
 WHERE k.id=${id}::uuid AND (${user.role==='admin'} OR (k.status='published' AND (k.audience='all' OR ${user.id}=ANY(k.audience_ids))))`
 if(!item)throw new KnowledgeError('התוכן לא נמצא או שאין הרשאה לצפות בו',404)
 return item
}
async function asset(id:string){
 if(!uuid(id))throw new KnowledgeError('הקובץ לא נמצא',404)
 const [a]=await sql`SELECT * FROM knowledge_assets WHERE id=${id}::uuid`
 if(!a)throw new KnowledgeError('הקובץ לא נמצא',404);return a
}
async function assertAsset(id:string|null,role:string,userId:number,kind:string,pdf=false){
 if(!id)return
 const a=await asset(id)
 if(!a.ready||a.creator_id!==userId){
  const [used]=await sql`SELECT id FROM knowledge_items WHERE (asset_id=${id}::uuid OR pdf_asset_id=${id}::uuid) LIMIT 1`
  if(!a.ready||role!=='admin'||!used)throw new KnowledgeError('הקובץ לא הושלם או שאינו שייך לתוכן זמין')
 }
 if(pdf&&a.mime!=='application/pdf')throw new KnowledgeError('תצוגת מצגת מחייבת קובץ PDF')
 if(kind==='video'&&!a.mime.startsWith('video/'))throw new KnowledgeError('יש לבחור קובץ וידאו')
 if(kind!=='video'&&a.mime.startsWith('video/'))throw new KnowledgeError('סוג הקובץ אינו מתאים לתוכן')
}
export async function knowledgeRoute(req:NextRequest,path:string[]=[]):Promise<Response>{
 try{
  const user=await currentUser(req);if(!user)throw new KnowledgeError('יש להתחבר למערכת',401)
  if(!roles.includes(user.role))throw new KnowledgeError('אין הרשאה',403)
  if(req.method!=='GET'){
   const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new KnowledgeError('מקור בקשה לא מורשה',403)
  }
  const [root,id,action,index]=path
  if(root==='options'&&req.method==='GET'){
   manager(user.role)
   const users=await sql`SELECT id,name FROM users WHERE role='coordinator' ORDER BY name`
   return json({users})
  }
  if(root==='items'){
   if(!id&&req.method==='GET'){
    const items=await sql`SELECT k.id,k.title,k.summary,k.topic,k.kind,k.video_url,k.asset_id,k.pdf_asset_id,k.status,k.audience,k.audience_ids,k.version,k.updated_at,k.published_at,'[]'::jsonb sections,a.name asset_name,p.name pdf_name,EXISTS(SELECT 1 FROM knowledge_favorites f WHERE f.item_id=k.id AND f.user_id=${user.id}) favorite
     FROM knowledge_items k LEFT JOIN knowledge_assets a ON a.id=k.asset_id LEFT JOIN knowledge_assets p ON p.id=k.pdf_asset_id
     WHERE ${user.role==='admin'} OR (k.status='published' AND (k.audience='all' OR ${user.id}=ANY(k.audience_ids))) ORDER BY k.updated_at DESC LIMIT 500`
    return json({items,canManage:user.role==='admin'})
   }
   if(id&&action==='favorite'&&['PUT','DELETE'].includes(req.method)){
    await visible(id,user)
    if(req.method==='PUT')await sql`INSERT INTO knowledge_favorites(user_id,item_id) VALUES(${user.id},${id}::uuid) ON CONFLICT DO NOTHING`
    else await sql`DELETE FROM knowledge_favorites WHERE user_id=${user.id} AND item_id=${id}::uuid`
    return json({favorite:req.method==='PUT'})
   }
   if(id&&!action&&req.method==='GET')return json({item:await visible(id,user)})
   if(!action&&['POST','PUT'].includes(req.method)){
    manager(user.role)
    if((req.method==='PUT'&&!id)||(req.method==='POST'&&id))throw new KnowledgeError('פעולה לא תקינה')
    const f=parseKnowledge(await body(req))
    if(id)await visible(id,user)
    await assertAsset(f.asset_id,user.role,user.id,f.kind)
    await assertAsset(f.pdf_asset_id,user.role,user.id,f.kind,true)
    if(f.audience_ids.length){
     const recipients=await sql`SELECT id FROM users WHERE role='coordinator' AND id=ANY(${f.audience_ids}::integer[])`
     if(recipients.length!==f.audience_ids.length)throw new KnowledgeError('אחד מהרכזים שנבחרו אינו זמין. רעננו את הרשימה')
    }
    let saved
    if(id){
     [saved]=await sql`UPDATE knowledge_items SET title=${f.title},summary=${f.summary},topic=${f.topic},kind=${f.kind},sections=${JSON.stringify(f.sections)}::jsonb,
      video_url=${f.video_url},asset_id=${f.asset_id}::uuid,pdf_asset_id=${f.pdf_asset_id}::uuid,status=${f.status},audience=${f.audience},audience_ids=${f.audience_ids}::integer[],version=version+1,updated_at=now(),
      published_at=CASE WHEN ${f.status}='published' THEN COALESCE(published_at,now()) ELSE published_at END WHERE id=${id}::uuid AND version=${f.version} RETURNING id`
     if(!saved)throw new KnowledgeError('התוכן עודכן בחלון אחר. יש לסגור, לרענן ולפתוח מחדש לפני שמירה.',409)
    }else{
     const key=randomUUID()
     ;[saved]=await sql`INSERT INTO knowledge_items(id,title,summary,topic,kind,sections,video_url,asset_id,pdf_asset_id,status,audience,audience_ids,creator_id,published_at)
      VALUES(${key}::uuid,${f.title},${f.summary},${f.topic},${f.kind},${JSON.stringify(f.sections)}::jsonb,${f.video_url},${f.asset_id}::uuid,${f.pdf_asset_id}::uuid,${f.status},${f.audience},${f.audience_ids}::integer[],${user.id},CASE WHEN ${f.status}='published' THEN now() ELSE NULL END) RETURNING id`
    }
    return json({item:await visible(saved.id,user)})
   }
  }
  if(root==='assets'){
   if(!id&&req.method==='POST'){
    manager(user.role);const b=await body(req),f=assetSpec(String(b.name||''),Number(b.size)),key=randomUUID(),name=storeName()
    // Fail before creating metadata when storage is not configured locally.
    store(name)
    await sql`INSERT INTO knowledge_assets(id,creator_id,name,mime,size,parts,store_name) VALUES(${key}::uuid,${user.id},${f.name},${f.mime},${f.size},${f.parts},${name})`
    return json({id:key,chunkSize:CHUNK_SIZE,parts:f.parts})
   }
   if(id){
    const a=await asset(id)
    if(action==='parts'&&req.method==='PUT'){
     manager(user.role)
     if(a.creator_id!==user.id||a.ready)throw new KnowledgeError('ההעלאה אינה זמינה',403)
     const part=Number(index);if(!/^\d+$/.test(index||'')||part<0||part>=a.parts)throw new KnowledgeError('מקטע לא תקין')
     if(Number(req.headers.get('content-length')||0)>CHUNK_SIZE)throw new KnowledgeError('מקטע גדול מדי',413)
     const data=await req.arrayBuffer(),expected=part===a.parts-1?a.size-part*CHUNK_SIZE:CHUNK_SIZE
     if(data.byteLength!==expected)throw new KnowledgeError('גודל המקטע אינו תואם לקובץ')
     await store(a.store_name).set(`${id}/${part}`,data)
     await sql`INSERT INTO knowledge_asset_parts(asset_id,part,size) VALUES(${id}::uuid,${part},${data.byteLength}) ON CONFLICT(asset_id,part) DO NOTHING`
     return json({ok:true})
    }
    if(action==='complete'&&req.method==='POST'){
     manager(user.role);if(a.creator_id!==user.id)throw new KnowledgeError('אין הרשאה',403)
     const [count]=await sql`SELECT COUNT(*)::int count,COALESCE(SUM(size),0)::int size FROM knowledge_asset_parts WHERE asset_id=${id}::uuid`
     if(count.count!==a.parts||count.size!==a.size)throw new KnowledgeError('ההעלאה עדיין לא הושלמה')
     await sql`UPDATE knowledge_assets SET ready=true WHERE id=${id}::uuid`
     return json({id,name:a.name,mime:a.mime})
    }
    if(!action&&req.method==='GET'){
     if(!a.ready)throw new KnowledgeError('הקובץ עדיין אינו זמין',404)
     const [allowed]=await sql`SELECT id FROM knowledge_items WHERE (asset_id=${id}::uuid OR pdf_asset_id=${id}::uuid)
      AND (${user.role==='admin'} OR (status='published' AND (audience='all' OR ${user.id}=ANY(audience_ids)))) LIMIT 1`
     if(!allowed&&!(user.role==='admin'&&a.creator_id===user.id))throw new KnowledgeError('הקובץ לא נמצא',404)
     let range
     try{range=byteRange(req.headers.get('range'),a.size)}catch{return new Response(null,{status:416,headers:{'Content-Range':`bytes */${a.size}`,'Cache-Control':'no-store'}})}
     // Keep each protected response below the platform's payload limit.
     // Video clients follow byte ranges; documents are assembled by the authenticated reader.
     const start=range.start,end=Math.min(range.end,start+CHUNK_SIZE-1),partial=range.partial||end<a.size-1,s=store(a.store_name);let part=Math.floor(start/CHUNK_SIZE)
     const stream=new ReadableStream({async pull(controller){
      try{
       if(part>Math.floor(end/CHUNK_SIZE)){controller.close();return}
       const bytes=await s.get(`${id}/${part}`,{type:'arrayBuffer'})
       if(!bytes)throw new Error('Missing file chunk')
       const offset=part*CHUNK_SIZE,from=Math.max(0,start-offset),to=Math.min(bytes.byteLength,end-offset+1)
       controller.enqueue(new Uint8Array(bytes.slice(from,to)));part++
      }catch(e){controller.error(e)}
     }})
     const disposition=req.nextUrl.searchParams.has('download')?'attachment':a.mime==='application/pdf'||a.mime.startsWith('video/')?'inline':'attachment'
     return new Response(stream,{status:partial?206:200,headers:{'Content-Type':a.mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes',...(partial?{'Content-Range':`bytes ${start}-${end}/${a.size}`} : {}),'Content-Disposition':`${disposition}; filename="download.${a.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'')||'bin'}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}})
    }
   }
  }
  return json({error:'הפעולה לא נמצאה'},404)
 }catch(e){
  if(e instanceof KnowledgeError)return json({error:e.message},e.status)
  console.error('Knowledge center request failed',e instanceof Error?e.message:'unknown')
  const message=e instanceof Error?e.message:''
  if(/relation .*knowledge_.*does not exist/i.test(message))return json({error:'מרכז הידע ממתין להתקנת בסיס הנתונים. יש להחיל את מיגרציית מרכז הידע.'},503)
  if(/Blobs|store.*config|credentials|siteID|token/i.test(message))return json({error:'אחסון הקבצים אינו מוגדר בסביבה זו. ההעלאה זמינה בפריסה המחוברת ל־Netlify.'},503)
  return json({error:'לא ניתן להשלים את הפעולה. נסו שוב.'},500)
 }
}
