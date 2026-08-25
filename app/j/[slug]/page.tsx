"use client"
import {useEffect,useState} from "react"
import {createClient} from "@/lib/supabase/client"

export default function PublicForm({params}:{params:{slug:string}}){
  const [coord,setCoord]=useState<{id:number;name:string}|null>(null)
  const [form,setForm]=useState({name:"",phone:"",age:"",city:"",interest:"training"})
  const [sent,setSent]=useState(false)
  const [err,setErr]=useState("")
  const sb=createClient()

  useEffect(()=>{
    sb.from("coordinators").select("id,name").eq("slug",params.slug).single().then(r=>{
      if(r.data) setCoord(r.data)
    })
  },[params.slug])

  async function submit(){
    if(!form.name||!form.phone){setErr("שם וטלפון חובה");return}
    if(!coord){setErr("קישור לא תקין");return}
    await sb.from("leads").insert({coordinator_id:coord.id,name:form.name,phone:form.phone,age:form.age?+form.age:null,city:form.city,interest:form.interest,source:"link",status:"new"})
    setSent(true)
  }

  if(sent) return <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]">
    <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-lg">
      <div className="text-5xl mb-3">✅</div>
      <div className="text-xl font-extrabold text-[#0D2744] mb-1">תודה!</div>
      <div className="text-sm text-[#64748B]">נציג נתיבים יצור איתך קשר בקרוב</div>
    </div>
  </div>

  return <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
      <div className="bg-[#0D2744] p-5 text-center">
        <div className="text-2xl font-extrabold text-white mb-1">🗺 נתיבים</div>
        <div className="text-sm text-[#60A5FA]">{coord?`הצטרף לתוכנית של ${coord.name}`:"הצטרף לתוכנית נתיבים"}</div>
      </div>
      <div className="p-5 space-y-3">
        <div>
          <label className="block text-xs font-semibold mb-1">שם מלא *</label>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]" placeholder="ישראל ישראלי"/>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">מספר טלפון *</label>
          <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} type="tel" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]" placeholder="050-0000000"/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-xs font-semibold mb-1">גיל</label><input value={form.age} onChange={e=>setForm(f=>({...f,age:e.target.value}))} type="number" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]" placeholder="18"/></div>
          <div><label className="block text-xs font-semibold mb-1">עיר</label><input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]" placeholder="תל אביב"/></div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">מה מעניין אותך?</label>
          <select value={form.interest} onChange={e=>setForm(f=>({...f,interest:e.target.value}))} className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D] bg-white">
            <option value="training">הכשרה מקצועית</option>
            <option value="service">שירות לאומי</option>
            <option value="military">צבאי</option>
            <option value="other">אחר</option>
          </select>
        </div>
        {err&&<div className="text-xs text-[#B45309] text-center">{err}</div>}
        <button onClick={submit} className="w-full py-3 bg-[#0D2744] text-white rounded-[11px] font-bold text-sm hover:bg-[#164e8a] transition-colors">שלח פרטים</button>
        <div className="text-xs text-center text-[#94A3B8]">הפרטים שלך בטוחים ומשמשים לצורך יצירת קשר בלבד</div>
      </div>
    </div>
  </div>
}