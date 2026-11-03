'use client'
import {useState} from 'react'
import {CHUNK_SIZE,KnowledgeMedia} from '@/lib/knowledge'
import {uiMutation,uiRequest} from '@/lib/ui-request'
export const privateAsset=(id:string)=>`/api/knowledge/assets/${id}`
export async function uploadPortalAsset(file:File,progress:(n:number)=>void){
 const init=await uiMutation<{id:string;parts:number}>('/api/knowledge/assets','POST',{name:file.name,size:file.size})
 for(let i=0;i<init.parts;i++){
  let failure:unknown
  for(let attempt=0;attempt<3;attempt++){try{await uiRequest(`${privateAsset(init.id)}/parts/${i}`,{method:'PUT',body:file.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE)});failure=null;break}catch(e){failure=e}}
  if(failure)throw failure;progress(Math.round((i+1)/init.parts*95))
 }
 const done=await uiMutation<{id:string;name:string;mime:string}>(`${privateAsset(init.id)}/complete`,'POST',{});progress(100);return done
}
export async function downloadPortalAsset(id:string,name:string,progress:(n:number)=>void){
 const chunks:ArrayBuffer[]=[];let start=0,total=0,mime='application/octet-stream'
 do{const response=await fetch(privateAsset(id),{headers:{Range:`bytes=${start}-${start+CHUNK_SIZE-1}`}});if(!response.ok)throw new Error('לא ניתן להוריד את הקובץ. בדקו את ההרשאה ונסו שוב.')
  const range=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);if(!range||Number(range[1])!==start)throw new Error('העברת הקובץ נקטעה')
  total=Number(range[3]);if(total>100*1024*1024)throw new Error('הקובץ גדול מדי');const data=await response.arrayBuffer();if(data.byteLength!==Number(range[2])-start+1)throw new Error('הורדה חלקית. נסו שוב.')
  chunks.push(data);start=Number(range[2])+1;mime=response.headers.get('content-type')||mime;progress(Math.round(start/total*100))
 }while(start<total)
 const url=URL.createObjectURL(new Blob(chunks,{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export function PortalGallery({media}:{media:KnowledgeMedia[]}){
 const visual=media.filter(m=>m.kind!=='document'),docs=media.filter(m=>m.kind==='document'),[index,setIndex]=useState(0),[error,setError]=useState(''),[progress,setProgress]=useState<number|null>(null)
 const selected=visual[Math.min(index,Math.max(0,visual.length-1))]
 async function download(m:KnowledgeMedia){if(progress!==null)return;setProgress(0);setError('');try{await downloadPortalAsset(m.asset_id,m.name,setProgress)}catch(e){setError((e as Error).message)}finally{setProgress(null)}}
 return <section className="kp-gallery" aria-label="קבצים וגלריה">
  {!!selected&&<><div className="kp-media-stage" tabIndex={0} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setIndex((index+(e.key==='ArrowLeft'?1:-1)+visual.length)%visual.length)}}}>
   {selected.kind==='image'?<a href={privateAsset(selected.asset_id)} target="_blank" rel="noopener noreferrer" aria-label="פתיחת התמונה בגודל מלא"><img src={privateAsset(selected.asset_id)} alt={selected.caption||selected.name}/></a>:<video key={selected.asset_id} controls playsInline preload="metadata" src={privateAsset(selected.asset_id)}/>}
  </div><div className="kp-gallery-caption"><button type="button" className="kb-button" disabled={visual.length<2} onClick={()=>setIndex((index-1+visual.length)%visual.length)}>הקודם →</button><p aria-live="polite">{Math.min(index+1,visual.length)} / {visual.length}<span>{selected.caption||selected.name}</span></p><button type="button" className="kb-button" disabled={visual.length<2} onClick={()=>setIndex((index+1)%visual.length)}>← הבא</button></div>
  <div className="kp-thumbnails">{visual.map((m,n)=><button type="button" key={m.asset_id} aria-label={`צפייה ב${m.caption||m.name}`} aria-pressed={index===n} onClick={()=>setIndex(n)}>{m.kind==='image'?<img loading="lazy" src={privateAsset(m.asset_id)} alt={m.caption||m.name}/>:<span>▷<small>{m.caption||m.name}</small></span>}</button>)}</div></>}
  {!!docs.length&&<h3>חומרים וקבצים נלווים</h3>}{docs.map(m=><div className="kp-file-row" key={m.asset_id}><span>▤</span><div><b>{m.caption||m.name}</b><small>{m.name}</small></div><button className="kb-button" type="button" disabled={progress!==null} onClick={()=>download(m)}>הורדה ↓</button></div>)}
  {progress!==null&&<p role="status">מוריד את הקובץ · {progress}%</p>}{error&&<div className="kb-error" role="alert">{error}</div>}
 </section>
}
