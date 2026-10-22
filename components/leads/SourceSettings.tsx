"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import Button from "@/components/ui/Button"
import WorkspaceHeader from "@/components/ui/WorkspaceHeader"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useToast } from "@/components/ui/Toast"
import { uiMutation, uiRequest } from "@/lib/ui-request"

type Source={id:number;label:string;active:boolean;slug?:string;coordinator_id?:number}
export default function SourceSettings({kind}:{kind:"sources"|"channels"}){
 const sources=kind==="sources",title=sources?"מקורות ליד ולינקים":"ערוצי הגעה"
 const api=sources?"/api/admin/lead-sources":"/api/admin/arrival-channels",key=sources?"lead_sources":"arrival_channels"
 const [rows,setRows]=useState<Source[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false)
 const [label,setLabel]=useState(""),[query,setQuery]=useState(""),[busy,setBusy]=useState<number|null>(null),[adding,setAdding]=useState(false)
 const toast=useToast()
 async function load(){setError(false);try{const d=await uiRequest(api);setRows(d[key]||[])}catch{setError(true)}finally{setLoading(false)}}
 useEffect(()=>{load()},[api]) // eslint-disable-line react-hooks/exhaustive-deps
 async function add(){if(!label.trim()||adding)return;setAdding(true);try{await uiMutation(api,"POST",{label:label.trim()});setLabel("");toast.success(sources?"המקור נוסף":"הערוץ נוסף");await load()}catch(e){toast.error(e instanceof Error?e.message:"הוספה נכשלה")}finally{setAdding(false)}}
 async function toggle(row:Source){if(busy!==null)return;setBusy(row.id);try{await uiMutation(api,"PATCH",{id:row.id,active:!row.active});setRows(list=>list.map(r=>r.id===row.id?{...r,active:!row.active}:r));toast.success("הסטטוס עודכן")}catch(e){toast.error(e instanceof Error?e.message:"העדכון נכשל")}finally{setBusy(null)}}
 async function copy(slug:string){try{await navigator.clipboard.writeText(`${location.origin}/s/${slug}`);toast.success("הלינק הועתק")}catch{toast.error("ההעתקה לא הצליחה. אפשר לסמן ולהעתיק את הכתובת.")}}
 const filtered=rows.filter(r=>r.label.includes(query.trim()))
 return <div className="ui-page">
  <WorkspaceHeader title={title} parent={{label:"לוח המובילים",href:"/admin/leaderboard"}}
   description={sources?"מי הביא את הליד? רכזים מתווספים אוטומטית עם יצירת המשתמש. כאן מוסיפים מקורות נוספים ומנהלים את הלינקים שלהם.":"איך הליד הגיע? הגדירו ערוצים כמו אתר, פרסום או הפניה אישית. הערוץ נשמר בנפרד מהמקור שהביא את הליד."}
   actions={<Link className="ui-btn" href={sources?"/admin/leaderboard/channels":"/admin/leaderboard/sources"}>{sources?"ערוצי הגעה":"מקורות ולינקים"}</Link>}/>
  <form className="ui-card ui-card-pad flex gap-3 flex-wrap mb-5" onSubmit={e=>{e.preventDefault();add()}}>
   <label className="ui-field flex-1 min-w-[170px]">{sources?"מקור חדש":"ערוץ חדש"}<input className="ui-input" value={label} onChange={e=>setLabel(e.target.value)} placeholder={sources?"למשל: המלצה אישית":"למשל: וואטסאפ עסקי"} required maxLength={200}/></label>
   <div className="self-end"><Button type="submit" disabled={adding||!label.trim()}>{adding?"מוסיף…":sources?"+ הוספת מקור":"+ הוספת ערוץ"}</Button></div>
  </form>
  {error?<ErrorState retry={load}/>:loading?<SkeletonCard rows={5}/>:<section className="ui-card">
   <div className="ui-toolbar"><h2>{rows.length} {sources?"מקורות":"ערוצים"} · {rows.filter(r=>r.active).length} פעילים</h2><input className="ui-input max-w-[260px]" type="search" aria-label="חיפוש ברשימה" placeholder="חיפוש לפי שם…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <div className="divide-y divide-[#e1e8df]">{filtered.map(r=><article key={r.id} className="p-5">
    <div className="flex justify-between items-center gap-3"><div className="ui-name"><span className="ui-avatar">{r.label.slice(0,2)}</span><div>{r.label}<p className="ui-note">{sources?(r.coordinator_id?"רכז · מקור משויך למשתמש":"מקור חיצוני"):"ערוץ הגעה לליד"}</p></div></div>
     <button type="button" role="switch" aria-checked={r.active} aria-label={`${r.label} — ${r.active?"פעיל":"מושבת"}`} disabled={busy!==null} onClick={()=>toggle(r)} className={`ui-btn ui-btn-sm ${r.active?"ui-btn-success":""}`}>{busy===r.id?"מעדכן…":r.active?"✓ פעיל":"מושבת"}</button>
    </div>
    {sources&&r.slug&&<div className="flex gap-2 mt-4"><input className="ui-input text-xs flex-1" aria-label={`לינק אישי של ${r.label}`} readOnly dir="ltr" value={typeof window==="undefined"?`/s/${r.slug}`:`${location.origin}/s/${r.slug}`}/><Button variant="secondary" onClick={()=>copy(r.slug!)}>העתקה</Button></div>}
   </article>)}</div>
   {!filtered.length&&<div className="ui-empty">{query?"אין תוצאות לחיפוש הזה":"אין עדיין פריטים. אפשר להוסיף את הראשון למעלה."}</div>}
  </section>}
 </div>
}
