"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import WorkspaceHeader from "@/components/ui/WorkspaceHeader"
import Button from "@/components/ui/Button"
import Modal from "@/components/ui/Modal"
import ErrorState from "@/components/ui/ErrorState"
import { SkeletonCard } from "@/components/ui/Skeleton"
import { useToast } from "@/components/ui/Toast"
import { uiRequest, uiMutation } from "@/lib/ui-request"

interface Source {id:number;label:string;coordinator_id:number|null;slug:string;target_leads:number;total_this_month:number;via_link_this_month:number;total_all_time:number}
interface Ranking {sources:Source[];org_target:number;total_this_month:number;unattributed_this_month:number}
const percent=(a:number,b:number)=>b>0?Math.round(a/b*100):null
function Progress({value}:{value:number|null}){return <div className="ui-progress" role="progressbar" aria-label="התקדמות ליעד" aria-valuenow={value===null?undefined:Math.min(value,100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={value===null?"טרם הוגדר יעד":`${value}% מהיעד`}><span style={{width:`${Math.min(100,value||0)}%`}}/></div>}
export default function LeaderboardPage(){
 const [data,setData]=useState<Ranking|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false)
 const [target,setTarget]=useState<{id:number|null;label:string}|null>(null),[input,setInput]=useState("")
 const [saving,setSaving]=useState(false),[formError,setFormError]=useState("")
 const [query,setQuery]=useState("")
 const toast=useToast()
 async function load(){setError(false);try{setData(await uiRequest<Ranking>("/api/admin/leaderboard-sources"))}catch{setError(true)}finally{setLoading(false)}}
 useEffect(()=>{load()},[])
 function edit(id:number|null,label:string,value:number){setInput(String(value||0));setFormError("");setTarget({id,label})}
 async function save(){
  if(!target||saving)return
  const value=Number(input)
  if(input.trim()===""||!Number.isInteger(value)||value<0){setFormError("יש להזין יעד שלם שאינו שלילי.");return}
  setSaving(true);setFormError("")
  try{await uiMutation("/api/admin/leaderboard-sources",target.id===null?"PATCH":"POST",target.id===null?{org_target:value}:{lead_source_id:target.id,target_leads:value});setTarget(null);toast.success("היעד עודכן");await load()}
  catch(e){setFormError(e instanceof Error?e.message:"היעד לא נשמר")}
  finally{setSaving(false)}
 }
 async function copy(slug:string){try{await navigator.clipboard.writeText(`${window.location.origin}/s/${slug}`);toast.success("הלינק הועתק")}catch{toast.error("לא ניתן להעתיק כרגע. אפשר להעתיק מתוך ניהול המקורות.")}}
 const sorted=[...(data?.sources||[])].sort((a,b)=>b.total_this_month-a.total_this_month)
 const rows=sorted.filter(s=>s.label.includes(query.trim()))
 const orgPct=data?percent(data.total_this_month,data.org_target):null
 return <div className="ui-page">
  <WorkspaceHeader title="לוח המובילים" description="תמונת ההתקדמות החודשית — מי מביא לידים, מאיזה מקור וכמה נשאר ליעד."
   actions={<><Link className="ui-btn" href="/admin/leaderboard/channels">ערוצי הגעה</Link><Link className="ui-btn ui-btn-primary" href="/admin/leaderboard/sources">ניהול מקורות ולינקים</Link></>}/>
  {error?<ErrorState retry={load}/>:loading?<div className="space-y-4"><SkeletonCard rows={3}/><SkeletonCard rows={6}/></div>:data&&<>
   <section className="ui-hero" aria-label="היעד הארגוני">
    <div><span className="ui-eyebrow">ההתקדמות של כולנו · החודש</span><h2>כל ליד הוא התחלה של דרך</h2><strong>{data.total_this_month.toLocaleString("he-IL")} <span className="text-lg font-normal text-[#63756b]">/ {data.org_target||"טרם הוגדר יעד"}</span></strong>
     <p className="ui-note">{orgPct===null?"הגדרת יעד מאפשרת לעקוב אחרי ההתקדמות החודשית.":orgPct>=100?`הגענו ל־${orgPct}% מהיעד החודשי`:`עוד ${Math.max(0,data.org_target-data.total_this_month)} לידים ליעד החודשי`}</p>
    </div>
    <div className="min-w-[180px] flex-1 max-w-[400px]"><div className="flex justify-between text-xs mb-3"><span>התקדמות ליעד</span><b>{orgPct===null?"—":`${orgPct}%`}</b></div><Progress value={orgPct}/><button className="ui-target mt-3 text-xs" onClick={()=>edit(null,"היעד הארגוני",data.org_target)}>עריכת היעד הארגוני</button></div>
   </section>
   <div className="ui-stat-grid">
    <div className="ui-card ui-stat"><small>לידים החודש</small><strong>{data.total_this_month}</strong></div>
    <div className="ui-card ui-stat"><small>מקורות בדירוג</small><strong>{sorted.length}</strong></div>
    <div className="ui-card ui-stat"><small>ללא מקור משויך</small><strong>{data.unattributed_this_month||0}</strong></div>
   </div>
   <section className="ui-card">
    <div className="ui-toolbar"><div><h2>הדירוג החודשי</h2><p className="ui-note">לפי מספר הלידים שהתקבלו החודש</p></div><input type="search" className="ui-input max-w-[260px]" aria-label="חיפוש מקור בדירוג" placeholder="חיפוש מקור או רכז…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="ui-table-wrap"><table className="ui-table ui-table-mobile"><caption className="sr-only">מקורות ליד, הישגים ויעדים בחודש הנוכחי</caption>
     <thead><tr>{["דירוג","מקור","לידים החודש","דרך הלינק","יעד חודשי","התקדמות","כל הזמנים"].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead>
     <tbody>{rows.map(s=>{const index=sorted.findIndex(x=>x.id===s.id),p=percent(s.total_this_month,s.target_leads);return <tr key={s.id}>
      <td><span className={`ui-rank ${index<3&&s.total_this_month>0?"ui-rank-top":""}`}>{index+1}</span></td>
      <td><div className="ui-name"><span className="ui-avatar">{s.label.slice(0,2)}</span><div>{s.label}<small className="block ui-note">{s.coordinator_id?"רכז שטח":"מקור ליד"}</small></div></div></td>
      <td data-label="לידים החודש"><b>{s.total_this_month}</b></td>
      <td data-label="דרך הלינק"><div className="ui-actions"><span>{s.via_link_this_month}</span>{s.slug&&<button className="ui-btn ui-btn-sm" onClick={()=>copy(s.slug)} aria-label={`העתקת הלינק של ${s.label}`}>העתק לינק</button>}</div></td>
      <td data-label="יעד חודשי"><button className="ui-target" onClick={()=>edit(s.id,s.label,s.target_leads)} aria-label={`עריכת יעד עבור ${s.label}`}>{s.target_leads||"הגדרת יעד"}</button></td>
      <td data-progress><div className="flex justify-between text-[11px] mb-2 gap-3"><span>{p===null?"ללא יעד":`${p}%`}</span>{p!==null&&p>=100&&<span className="text-[#28634e]">היעד הושג</span>}</div><Progress value={p}/></td>
      <td data-label="כל הזמנים">{s.total_all_time}</td>
     </tr>})}</tbody>
    </table></div>
    {!rows.length&&<div className="ui-empty"><h2>{query?"לא נמצאו מקורות בחיפוש":"הדירוג מחכה למקורות הראשונים"}</h2><p>{query?"אפשר לנסות שם אחר או לנקות את החיפוש.":"הוסיפו מקורות ליד ולינקים אישיים כדי להתחיל למדוד."}</p><Link href="/admin/leaderboard/sources" className="ui-btn mt-4">ניהול מקורות</Link></div>}
   </section>
  </>}
  <Modal open={target!==null} onClose={()=>{if(!saving)setTarget(null)}} title={`עדכון יעד · ${target?.label||""}`} subtitle="יעד הלידים לחודש הנוכחי. ערך 0 מסיר את היעד." width="440px"
   footer={<><Button onClick={save} disabled={saving}>{saving?"שומר…":"שמירת יעד"}</Button><Button variant="secondary" disabled={saving} onClick={()=>setTarget(null)}>ביטול</Button></>}>
   <form onSubmit={e=>{e.preventDefault();save()}}><label className="ui-field">מספר לידים<input autoFocus className="ui-input" inputMode="numeric" type="number" min="0" step="1" value={input} onChange={e=>setInput(e.target.value)}/></label>{formError&&<p role="alert" className="ui-error mt-3">{formError}</p>}</form>
  </Modal>
 </div>
}
