export const KNOWLEDGE_TYPES = {script:'תסריט שיחה',video:'סרטון',presentation:'מצגת',document:'מסמך'} as const
export type KnowledgeType = keyof typeof KNOWLEDGE_TYPES
export type KnowledgeSection = {title:string;body:string}
export type KnowledgeItem = {
 id:string;title:string;summary:string;topic:string;kind:KnowledgeType;sections:KnowledgeSection[];
 video_url:string;asset_id:string|null;pdf_asset_id:string|null;status:'draft'|'published'|'archived';
 audience:'all'|'selected';audience_ids:number[];version:number;updated_at:string;published_at:string|null;
 favorite:boolean;asset_name?:string;pdf_name?:string
}
export class KnowledgeError extends Error {constructor(message:string,public status=400){super(message)}}
const text=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):''
export function videoEmbed(value:string):string|null {
 try {
  const u=new URL(value);if(u.protocol!=='https:')return null
  if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname)){
   const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]
   return id&&/^[\w-]{11}$/.test(id)?`https://www.youtube-nocookie.com/embed/${id}`:null
  }
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname)){
   const id=u.pathname.match(/(?:^\/|\/video\/)(\d+)\/?$/)?.[1];return id?`https://player.vimeo.com/video/${id}`:null
  }
 }catch{}return null
}
export function parseKnowledge(value:unknown){
 const b=value as Partial<KnowledgeItem>;if(!b||typeof b!=='object')throw new KnowledgeError('תוכן לא תקין')
 const kind=b.kind;if(!kind||!Object.hasOwn(KNOWLEDGE_TYPES,kind))throw new KnowledgeError('יש לבחור סוג תוכן')
 const title=text(b.title,180);if(!title)throw new KnowledgeError('יש להזין כותרת')
 const status=b.status||'draft';if(!['draft','published','archived'].includes(status))throw new KnowledgeError('סטטוס לא תקין')
 const audience=b.audience||'all';if(!['all','selected'].includes(audience))throw new KnowledgeError('קהל לא תקין')
 const audience_ids=Array.isArray(b.audience_ids)?[...new Set(b.audience_ids.filter(n=>Number.isSafeInteger(n)&&n>0))].slice(0,500):[]
 if(audience==='selected'&&!audience_ids.length)throw new KnowledgeError('יש לבחור לפחות רכז אחד')
 const sections=Array.isArray(b.sections)?b.sections.slice(0,30).map(s=>({title:text(s?.title,120),body:text(s?.body,15000)})):[]
 const video_url=text(b.video_url,1000)
 if(video_url&&!videoEmbed(video_url))throw new KnowledgeError('יש להזין קישור תקין ל־YouTube או Vimeo')
 const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)?v:null
 const asset_id=uuid(b.asset_id),pdf_asset_id=uuid(b.pdf_asset_id)
 if(status==='published'){
  if(kind==='script'&&!sections.some(s=>s.body))throw new KnowledgeError('יש להוסיף תוכן לתסריט')
  if(kind==='video'&&!video_url&&!asset_id)throw new KnowledgeError('יש להוסיף קישור לסרטון או קובץ וידאו')
  if(['presentation','document'].includes(kind)&&!asset_id)throw new KnowledgeError('יש להעלות קובץ לפני הפרסום')
 }
 const version=Number(b.version||0);if(!Number.isSafeInteger(version)||version<0)throw new KnowledgeError('גרסה לא תקינה')
 return {title,summary:text(b.summary,1200),topic:text(b.topic,80),kind,sections:kind==='script'?sections:[],video_url:kind==='video'?video_url:'',asset_id:kind==='script'?null:asset_id,pdf_asset_id:kind==='presentation'?pdf_asset_id:null,status,audience,audience_ids:audience==='selected'?audience_ids:[],version}
}
export const CHUNK_SIZE=2*1024*1024
export const MAX_ASSET_SIZE=100*1024*1024
export const FILE_TYPES:Record<string,string>={pdf:'application/pdf',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',mp4:'video/mp4',webm:'video/webm'}
export function assetSpec(name:string,size:number){
 const ext=name.split('.').pop()?.toLowerCase()||'',mime=FILE_TYPES[ext]
 if(!mime||!Number.isSafeInteger(size)||size<=0||size>MAX_ASSET_SIZE)throw new KnowledgeError('קבצים נתמכים: PDF, PowerPoint, Word, MP4 ו־WebM. עד 100MB לקובץ.')
 return {name:name.replace(/[\r\n/\\]/g,'_').slice(0,180),mime,size,parts:Math.ceil(size/CHUNK_SIZE)}
}
export function byteRange(header:string|null,size:number){
 if(!header)return {start:0,end:size-1,partial:false}
 const m=/^bytes=(\d*)-(\d*)$/.exec(header);if(!m||(!m[1]&&!m[2]))throw new KnowledgeError('טווח לא תקין',416)
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new KnowledgeError('טווח לא תקין',416)
 return {start,end,partial:true}
}

// Light formatting for script sections. Plain text stays plain; these line prefixes add structure:
// "> " line to say, "### " sub-heading, "! " note, "- "/"• " bullets, "1. " numbered, "| a | b |" table, **bold** inline.
export type ScriptBlock =
 | {type:'p'|'quote'|'h'|'note';text:string}
 | {type:'ul'|'ol';items:string[]}
 | {type:'table';head:string[];rows:string[][]}
const cells=(line:string)=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim())
export function scriptBlocks(body:string):ScriptBlock[]{
 const out:ScriptBlock[]=[];let last:ScriptBlock|null=null
 const push=(b:ScriptBlock)=>{out.push(b);last=b}
 for(const raw of (body||'').replace(/\r\n?/g,'\n').split('\n')){
  const line=raw.trim()
  if(!line){last=null;continue}
  let m:RegExpMatchArray|null
  const prev=last as ScriptBlock|null
  if(line.startsWith('|')){
   if(/^\|[\s:|-]+\|?$/.test(line))continue
   if(prev?.type==='table')prev.rows.push(cells(line));else push({type:'table',head:cells(line),rows:[]})
  }else if((m=line.match(/^(?:[-•*])\s+(.*)$/))){
   if(prev?.type==='ul')prev.items.push(m[1]);else push({type:'ul',items:[m[1]]})
  }else if((m=line.match(/^\d+[.)]\s+(.*)$/))){
   if(prev?.type==='ol')prev.items.push(m[1]);else push({type:'ol',items:[m[1]]})
  }else if((m=line.match(/^>\s?(.*)$/))){
   if(prev?.type==='quote')prev.text+='\n'+m[1];else push({type:'quote',text:m[1]})
  }else if((m=line.match(/^#{1,4}\s+(.*)$/)))push({type:'h',text:m[1]})
  else if((m=line.match(/^!\s+(.*)$/))){
   if(prev?.type==='note')prev.text+='\n'+m[1];else push({type:'note',text:m[1]})
  }else if(prev?.type==='p')prev.text+='\n'+line
  else push({type:'p',text:line})
 }
 return out
}
// Clean text for the "copy" button: no formatting markers.
export function scriptPlain(body:string):string{
 const strip=(s:string)=>s.replace(/\*\*(.+?)\*\*/g,'$1')
 return scriptBlocks(body).map(b=>
  b.type==='ul'?b.items.map(i=>`• ${strip(i)}`).join('\n'):
  b.type==='ol'?b.items.map((i,n)=>`${n+1}. ${strip(i)}`).join('\n'):
  b.type==='table'?[b.head,...b.rows].map(r=>r.map(strip).join(' — ')).join('\n'):
  'text' in b?strip(b.text):'').join('\n\n')
}
