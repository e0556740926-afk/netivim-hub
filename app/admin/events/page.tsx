"use client"
import {useEffect,useState} from "react"
import {fd} from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"

const ST:Record<string,string>={planning:"תכנון",pending_approval:"ממתין לאישור",approved:"מאושר",marketing:"בפרסום",done:"בוצע",cancelled:"בוטל"}

export default function EventsPage(){
  const [events,setEvents]=useState<any[]>([])
  const [expenses,setExpenses]=useState<Record<number,number>>({})
  const [filter,setFilter]=useState("")
  const [showForm,setShowForm]=useState(false)
  const [form,setForm]=useState({name:"",date:"",time:"",location:"",budget_planned:0,target_attendees:0})

  useEffect(()=>{load()},[])

  async function load(){
    const res=await fetch("/api/events")
    const{events,expenses}=await res.json()
    setEvents(events||[])
    const m:Record<number,number>={}
    ;(expenses||[]).forEach((x:any)=>{if(x.event_id)m[x.event_id]=(m[x.event_id]||0)+ +x.amount})
    setExpenses(m)
  }

  async function approve(id:number){
    await fetch(`/api/events/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({approve:true})})
    setEvents(e=>e.map(x=>x.id===id?{...x,approved:true,status:"marketing"}:x))
  }

  async function createEvent(){
    await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)})
    setShowForm(false);setForm({name:"",date:"",time:"",location:"",budget_planned:0,target_attendees:0});load()
  }

  const filtered=events.filter(e=>!filter||e.status===filter)

  return <div className="p-6 md:p-8 fade-up">
    <div className="flex items-center justify-between mb-5">
      <h1 className="text-2xl font-extrabold text-[#0D2744]">ניהול אירועים</h1>
      <Button onClick={()=>setShowForm(true)}>+ אירוע חדש</Button>
    </div>
    {showForm&&<Card className="mb-4 border-2 border-[#00488D]"><div className="p-4">
      <div className="text-sm font-bold text-[#00488D] mb-3">אירוע חדש</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="text-xs font-semibold block mb-1">שם *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">מיקום</label><input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">תאריך</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">תקציב (₪)</label><input type="number" value={form.budget_planned} onChange={e=>setForm(f=>({...f,budget_planned:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
      </div>
      <div className="flex gap-2"><Button onClick={createEvent}>צור</Button><Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button></div>
    </div></Card>}
    <div className="flex gap-2 mb-4 flex-wrap">
      {["","planning","pending_approval","approved","marketing","done"].map(s=><button key={s} onClick={()=>setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter===s?"bg-[#00488D] text-white":"bg-white border border-[#E2E8F0] text-[#64748B]"}`}>{s===""?"הכל":ST[s]}</button>)}
    </div>
    <div className="space-y-3">
      {filtered.map(e=>{
        const spent=expenses[e.id]||0;const bp=e.budget_planned>0?Math.round(spent/e.budget_planned*100):0
        return <div key={e.id} className="bg-white border border-[#E2E8F0] rounded-[14px] p-4">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div><div className="text-base font-bold">{e.name}{!e.approved&&<span className="text-xs ml-2 px-2 py-0.5 bg-[#FEF3C7] text-[#B45309] rounded-full">ממתין לאישור</span>}</div>
            <div className="text-xs text-[#64748B] mt-1">📅 {fd(e.date)} {e.time} &nbsp;📍 {e.location}</div></div>
            <div className="flex items-center gap-2"><Badge text={ST[e.status]||e.status}/>
              {!e.approved&&<button onClick={()=>approve(e.id)} className="px-3 py-1 bg-[#DCFCE7] text-[#166534] text-xs font-bold rounded-lg hover:bg-[#BBF7D0]">✓ אשר</button>}
            </div>
          </div>
          <div className="flex items-center gap-3"><div className="flex-1 h-2 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${Math.min(bp,100)}%`,background:bp>90?"#960010":"#00488D"}} className="h-full rounded-full"/></div>
          <div className="text-xs text-[#64748B]">₪{spent.toLocaleString()} / ₪{e.budget_planned?.toLocaleString()} ({bp}%)</div></div>
        </div>
      })}
    </div>
  </div>
}