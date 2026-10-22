"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import CalendarPopup from "./CalendarPopup"
import WorkspaceHeader from "./WorkspaceHeader"
import ErrorState from "./ErrorState"
import { SkeletonCard } from "./Skeleton"
import { uiRequest } from "@/lib/ui-request"
import { ST } from "@/components/events/shared"

const ymd=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
const dateLabel=(value:string)=>new Date(value+"T12:00:00").toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"})
const color:Record<string,string>={planning:"#7c8c7c",pending_approval:"#b18a45",approved:"#28634e",marketing:"#356990",done:"#74688c",cancelled:"#a74450"}
export default function ActivityCalendar({kind}:{kind:"admin"|"coord"}){
 const {user}=useAuth(),isCoord=kind==="coord"
 const [month,setMonth]=useState(()=>new Date()),[selected,setSelected]=useState(()=>ymd(new Date()))
 const [events,setEvents]=useState<any[]>([]),[tasks,setTasks]=useState<any[]>([]),[token,setToken]=useState("")
 const [loading,setLoading]=useState(true),[error,setError]=useState(false),[showEvents,setShowEvents]=useState(true),[showTasks,setShowTasks]=useState(true)
 const load=useCallback(async()=>{
  if(!user)return;setError(false);setLoading(true)
  try{
   const [ed,td,cd]=await Promise.all([uiRequest("/api/events"),uiRequest(isCoord?`/api/tasks?name=${encodeURIComponent(user.name)}`:"/api/tasks"),isCoord?uiRequest(`/api/coord?user_id=${user.id}`):Promise.resolve(null)])
   setEvents((ed.events||[]).filter((e:any)=>!isCoord||(cd?.coord&&e.coordinator_id===cd.coord.id&&e.status!=="cancelled")))
   setTasks(td.tasks||[])
   const params=new URLSearchParams({user_id:String(user.id),...(user.email?{email:user.email}:{})})
   uiRequest(`/api/calendar-token?${params}`).then(d=>setToken(d.token||"")).catch(()=>setToken(""))
  }catch{setError(true)}finally{setLoading(false)}
 },[user,isCoord])
 useEffect(()=>{load()},[load])
 const year=month.getFullYear(),monthIndex=month.getMonth(),first=new Date(year,monthIndex,1).getDay(),count=new Date(year,monthIndex+1,0).getDate()
 const today=ymd(new Date()),cells=Array.from({length:Math.ceil((first+count)/7)*7},(_,i)=>i>=first&&i<first+count?i-first+1:null)
 function items(date:string){return {events:showEvents?events.filter(e=>String(e.date||"").slice(0,10)===date):[],tasks:showTasks?tasks.filter(t=>t.status!=="done"&&String(t.due_date||"").slice(0,10)===date):[]}}
 const agenda=items(selected)
 function changeMonth(delta:number){setMonth(new Date(year,monthIndex+delta,1))}
 return <div className={`ui-page ${isCoord?"ui-calendar-coord":""}`}>
  <WorkspaceHeader title={isCoord?"היומן שלי":"לוח שנה"} description="אירועים ומשימות בתמונה אחת. בחרו יום כדי לראות את סדר היום המלא." actions={<CalendarPopup token={token} label="חיבור ליומן"/>}/>
  {error?<ErrorState retry={load}/>:loading?<SkeletonCard rows={7}/>:<>
   <div className="ui-calendar-tools"><div className="ui-actions"><button className="ui-btn" onClick={()=>changeMonth(-1)} aria-label="החודש הקודם">›</button><h2>{month.toLocaleDateString("he-IL",{month:"long",year:"numeric"})}</h2><button className="ui-btn" onClick={()=>changeMonth(1)} aria-label="החודש הבא">‹</button><button className="ui-btn" onClick={()=>{setMonth(new Date());setSelected(today)}}>היום</button></div>
    <div className="ui-actions"><button className="ui-btn" aria-pressed={showEvents} onClick={()=>setShowEvents(v=>!v)}>אירועים {showEvents?"✓":""}</button><button className="ui-btn" aria-pressed={showTasks} onClick={()=>setShowTasks(v=>!v)}>משימות {showTasks?"✓":""}</button></div>
   </div>
   <div className="ui-calendar-layout">
    <section className="ui-card overflow-hidden" aria-label="תצוגת חודש">
     <div className="ui-calendar-week">{["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"].map((d,i)=><div key={d}><span className="hidden sm:inline">{d}</span><span className="sm:hidden">{["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"][i]}</span></div>)}</div>
     <div className="ui-calendar-grid">{cells.map((day,i)=>{
      if(!day)return <div key={i} className="ui-calendar-blank" aria-hidden="true"/>
      const date=ymd(new Date(year,monthIndex,day)),data=items(date),total=data.events.length+data.tasks.length
      const display=[...data.events.map(e=>({name:e.name,color:color[e.status]||color.planning})),...data.tasks.map(t=>({name:t.title,color:"#946014"}))]
      return <button key={i} className="ui-calendar-day" onClick={()=>setSelected(date)} aria-pressed={selected===date} aria-current={date===today?"date":undefined} aria-label={`${dateLabel(date)}, ${data.events.length} אירועים, ${data.tasks.length} משימות`}>
       <time dateTime={date}>{day}</time><div className="ui-calendar-entries">{display.slice(0,2).map((entry,j)=><span key={j} style={{borderInlineStartColor:entry.color}}>{entry.name}</span>)}{total>2&&<small>+{total-2} נוספים</small>}</div>
       <div className="ui-calendar-dots" aria-hidden="true">{display.slice(0,3).map((entry,j)=><i key={j} style={{background:entry.color}}/>)}{total>3&&<small>+{total-3}</small>}</div>
      </button>
     })}</div>
    </section>
    <aside className="ui-card ui-calendar-agenda" aria-label="סדר היום הנבחר"><div className="p-5 border-b border-[#e1e8df]"><span className="ui-eyebrow">סדר היום {selected===today?"· היום":""}</span><h2>{dateLabel(selected)}</h2><p className="ui-note">{agenda.events.length} אירועים · {agenda.tasks.length} משימות פתוחות</p></div>
     <div className="ui-calendar-agenda-body">{agenda.events.map(e=><Link href={`/${kind}/events`} key={`e${e.id}`} className="ui-calendar-item"><span className="ui-badge">אירוע · {ST[e.status]||e.status}</span><h3>{e.name}</h3><p>{e.time||"ללא שעה"}{e.location?` · ${e.location}`:""}</p>{!isCoord&&e.coordinator_name&&<p>{e.coordinator_name}</p>}</Link>)}
      {agenda.tasks.map(t=><Link href={`/${kind}/tasks?open=${t.id}`} key={`t${t.id}`} className="ui-calendar-item"><span className="ui-badge ui-badge-muted">משימה</span><h3>{t.title}</h3><p>{t.assignees?.join(" · ")||"ללא שיוך"}</p></Link>)}
      {!agenda.events.length&&!agenda.tasks.length&&<div className="ui-empty"><h2>היום הזה פנוי</h2><p>אין אירועים או משימות פתוחות במסננים שנבחרו.</p></div>}
     </div>
     <div className="p-5 border-t border-[#e1e8df] ui-note">משימה שכבר בוצעה אינה מופיעה ביומן. כל הפרטים והפעולות זמינים במסך המשימות או האירועים.</div>
    </aside>
   </div>
  </>}
 </div>
}
