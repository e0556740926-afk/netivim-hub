"use client"
import {useEffect,useState} from "react"
import {createClient} from "@/lib/supabase/client"
import {useAuth} from "@/lib/auth-context"
import {fd,pct,leadColor,currentMonth,currentYear} from "@/lib/utils"
import Speedometer from "@/components/ui/Speedometer"

interface Lead{id:number;name:string;phone:string;status:string;source:string;created_at:string}

const STATUS_CYCLE:{[k:string]:string}={new:"contacted",contacted:"advanced",advanced:"irrelevant",irrelevant:"new"}
const STATUS_LABEL:{[k:string]:string}={new:"חדש",contacted:"יצרתי קשר",advanced:"עבר לשלב הבא",irrelevant:"לא רלוונטי"}
const STATUS_COLORS:{[k:string]:{bg:string;fg:string}}={
  new:{bg:"#DBEAFE",fg:"#1E40AF"},contacted:{bg:"#DCFCE7",fg:"#166534"},
  advanced:{bg:"#EDE9FE",fg:"#5B21B6"},irrelevant:{bg:"#FEE2E2",fg:"#991B1B"}
}

export default function CoordLeads(){
  const {user}=useAuth()
  const [leads,setLeads]=useState<Lead[]>([])
  const [myLeads,setMyLeads]=useState(0)
  const [target,setTarget]=useState(0)
  const [showForm,setShowForm]=useState(false)
  const [form,setForm]=useState({name:"",phone:"",note:""})
  const [err,setErr]=useState("")
  const [coordId,setCoordId]=useState<number|null>(null)
  const sb=createClient()
  const m=currentMonth(),y=currentYear()

  useEffect(()=>{if(user)load()},[user])

  async function load(){
    const c=await sb.from("coordinators").select("id").eq("user_id",user!.id).single()
    if(!c.data) return
    const cid=c.data.id;setCoordId(cid)
    const[l,t]=await Promise.all([
      sb.from("leads").select("*").eq("coordinator_id",cid).order("created_at",{ascending:false}),
      sb.from("monthly_targets").select("target_leads").eq("coordinator_id",cid).eq("month",m).eq("year",y).single()
    ])
    setLeads(l.data||[])
    setMyLeads((l.data||[]).filter((x:any)=>x.created_at>=`${y}-${String(m).padStart(2,"0")}-01`).length)
    setTarget(t.data?.target_leads||0)
  }

  async function addLead(){
    if(!form.name||!form.phone){setErr("שם וטלפון חובה");return}
    await sb.from("leads").insert({coordinator_id:coordId,name:form.name,phone:form.phone,source:"manual",status:"new"})
    setForm({name:"",phone:"",note:""});setShowForm(false);setErr("");load()
  }

  async function cycleStatus(id:number,cur:string){
    const next=STATUS_CYCLE[cur]||"new"
    await sb.from("leads").update({status:next}).eq("id",id)
    setLeads(l=>l.map(x=>x.id===id?{...x,status:next}:x))
  }

  const p=pct(myLeads,target)

  return <div className="p-4 fade-up">
    <div className="text-xl font-extrabold mb-3">הלידים שלי</div>
    <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 text-center mb-3">
      <div className="flex justify-center mb-3"><Speedometer actual={myLeads} target={target} size={150}/></div>
      <div className="h-2 bg-[#F0F4F8] rounded-full overflow-hidden mb-2"><div style={{width:`${p}%`,background:leadColor(p)}} className="h-full rounded-full transition-all"/></div>
      <div className="text-xs text-[#64748B]">נותרו {new Date(y,m,0).getDate()-new Date().getDate()} ימים בחודש</div>
    </div>

    <div onClick={()=>setShowForm(f=>!f)} className="bg-[#166534] rounded-[14px] p-3 text-center text-white text-sm font-bold cursor-pointer mb-3">
      {showForm?"סגור":"+ הוסף ליד ידני"}
    </div>

    {showForm&&<div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4 mb-3 fade-up space-y-2">
      <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="שם מלא" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]"/>
      <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="טלפון" type="tel" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]"/>
      <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="הערה (אופציונלי)" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]"/>
      <div onClick={addLead} className="text-center py-2.5 rounded-[10px] bg-[#0D2744] text-white text-sm font-bold cursor-pointer">הוסף ליד</div>
      {err&&<div className="text-xs text-[#B45309] text-center">{err}</div>}
    </div>}

    <div className="space-y-2">
      {leads.map(l=>{
        const c=STATUS_COLORS[l.status]||{bg:"#F3F4F6",fg:"#374151"}
        return <div key={l.id} className="bg-white border border-[#E2E8F0] rounded-[12px] p-3 flex items-center gap-2.5">
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{l.name}</div><div className="text-xs text-[#64748B]">{fd(l.created_at?.slice(0,10))} · {l.source==="link"?"לינק":l.source==="event"?"אירוע":"ידני"}</div></div>
          <span onClick={()=>cycleStatus(l.id,l.status)} style={{background:c.bg,color:c.fg}} className="px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer">{STATUS_LABEL[l.status]||l.status}</span>
          <a href={`https://wa.me/972${l.phone.replace(/^0/,"")}`} target="_blank" className="w-8 h-8 rounded-full bg-[#DCFCE7] text-[#166534] flex items-center justify-center text-sm font-bold">↗</a>
        </div>
      })}
    </div>
  </div>
}