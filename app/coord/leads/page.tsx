"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd, pct, leadColor } from "@/lib/utils"
import Speedometer from "@/components/ui/Speedometer"
import { SkeletonCard } from "@/components/ui/Skeleton"

const STATUS_CYCLE: Record<string,string> = { new:"contacted", contacted:"advanced", advanced:"irrelevant", irrelevant:"new" }
const STATUS_LABEL: Record<string,string> = { new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי" }
const STATUS_COLORS: Record<string,{bg:string,fg:string}> = {
  new:{bg:"#DBEAFE",fg:"#1E40AF"}, contacted:{bg:"#DCFCE7",fg:"#166534"},
  advanced:{bg:"#EDE9FE",fg:"#5B21B6"}, irrelevant:{bg:"#FEE2E2",fg:"#991B1B"}
}

export default function CoordLeads() {
  const { user } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [myLeads, setMyLeads] = useState(0)
  const [target, setTarget] = useState(0)
  const [coordId, setCoordId] = useState<number|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:"", phone:"", city:"", note:"" })
  const [err, setErr] = useState("")
  const [dupWarning, setDupWarning] = useState<any>(null)
  const [converting, setConverting] = useState<number|null>(null)
  const [converted, setConverted] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const m = new Date().getMonth()+1
  const y = new Date().getFullYear()

  async function load() {
    if (!user) return
    setLoading(true)
    const cRes = await fetch(`/api/coord?user_id=${user.id}`)
    const { coord } = await cRes.json()
    if (!coord) { setLoading(false); return }
    setCoordId(coord.id)
    const [lRes, tRes] = await Promise.all([
      fetch(`/api/leads?coordinator_id=${coord.id}`),
      fetch("/api/targets")
    ])
    const { leads } = await lRes.json()
    const { targets } = await tRes.json()
    setLeads(leads||[])
    setMyLeads((leads||[]).filter((l:any)=>l.created_at?.slice(5,7)===String(m).padStart(2,"0")).length)
    setTarget(targets?.find((t:any)=>t.coordinator_id===coord.id)?.target_leads||0)
    setLoading(false)
  }

  useEffect(() => { if (user) load() }, [user])

  async function checkPhone(phone: string) {
    if (phone.length < 9) return
    const res = await fetch(`/api/leads?phone=${encodeURIComponent(phone)}`)
    // Will be handled by duplicate check in POST
    setDupWarning(null)
  }

  async function addLead() {
    if (!form.name||!form.phone) { setErr("שם וטלפון חובה"); return }
    setErr(""); setDupWarning(null)
    const res = await fetch("/api/leads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({coordinator_id:coordId,name:form.name,phone:form.phone,city:form.city,source:"manual",notes:form.note})})
    const d = await res.json()
    if (d.error==="כפילות") {
      setDupWarning(d.duplicate)
      return
    }
    if (d.error) { setErr(d.error); return }
    setForm({name:"",phone:"",city:"",note:""}); setShowForm(false); load()
  }

  async function cycleStatus(id:number, cur:string) {
    const next = STATUS_CYCLE[cur]||"new"
    await fetch("/api/leads",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:next})})
    setLeads(l=>l.map(x=>x.id===id?{...x,status:next}:x))
  }

  async function convertToContact(lead:any) {
    setConverting(lead.id)
    const res = await fetch("/api/leads/convert",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lead_id:lead.id,coordinator_name:user?.name})})
    const d = await res.json()
    setConverting(null)
    if (d.error==="כפילות" || d.contact_id) {
      setConverted(s=>new Set([...s,lead.id]))
    } else if (d.contact_id) {
      setConverted(s=>new Set([...s,lead.id]))
    }
    load()
  }

  const p = pct(myLeads,target)
  const monthLeads = leads.filter(l=>l.created_at?.slice(5,7)===String(m).padStart(2,"0"))

  return <div className="p-4 max-w-2xl mx-auto fade-up">
    <div className="text-xl font-extrabold mb-3">הלידים שלי</div>

    {loading ? <SkeletonCard rows={5}/> : <>
      {/* Speedometer */}
      <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 text-center mb-3">
        <div className="flex justify-center mb-3"><Speedometer actual={myLeads} target={target} size={150}/></div>
        <div className="h-2 bg-[#F0F4F8] rounded-full overflow-hidden mb-2"><div style={{width:`${p}%`,background:leadColor(p)}} className="h-full rounded-full transition-all"/></div>
        <div className="text-xs text-[#64748B]">נותרו {new Date(y,m,0).getDate()-new Date().getDate()} ימים בחודש</div>
      </div>

      {/* Add lead button */}
      <button onClick={()=>setShowForm(v=>!v)} className="w-full py-2.5 mb-3 bg-[#166534] text-white rounded-[14px] text-sm font-bold hover:bg-[#15803d] transition-colors">
        {showForm?"סגור":"+ הוסף ליד ידני"}
      </button>

      {/* Form */}
      {showForm && <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-4 mb-3 space-y-2 fade-up">
        <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="שם מלא *" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]"/>
        <input value={form.phone} onChange={e=>{setForm(f=>({...f,phone:e.target.value}));checkPhone(e.target.value)}} placeholder="טלפון *" type="tel" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]"/>
        <input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} placeholder="עיר (אופציונלי)" className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#00488D]"/>

        {dupWarning && <div className="bg-[#FEF3C7] text-[#B45309] rounded-[10px] px-3 py-2.5 text-xs font-semibold">
          ⚠️ מספר זה כבר קיים במערכת — {dupWarning.name}.<br/>
          <span className="font-normal">לא נוצר ליד כפול.</span>
        </div>}

        {err && <div className="text-xs text-[#960010]">{err}</div>}
        <button onClick={addLead} className="w-full py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold">הוסף ליד</button>
      </div>}

      {/* Month leads */}
      <div className="text-sm font-bold mb-2">לידים החודש ({monthLeads.length})</div>
      <div className="space-y-2 mb-4">
        {monthLeads.map(l=>{
          const c=STATUS_COLORS[l.status]||{bg:"#F3F4F6",fg:"#374151"}
          const isConverted=converted.has(l.id)||l.status==="advanced"
          return <div key={l.id} className="bg-white border border-[#E2E8F0] rounded-[12px] p-3 flex items-center gap-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{l.name}</div>
              <div className="text-xs text-[#64748B]">{fd(l.created_at?.slice(0,10))} · {l.phone}</div>
            </div>
            <span onClick={()=>cycleStatus(l.id,l.status)} style={{background:c.bg,color:c.fg}} className="px-2 py-0.5 rounded-full text-xs font-bold cursor-pointer">{STATUS_LABEL[l.status]||l.status}</span>
            <a href={`https://wa.me/972${l.phone?.replace(/^0/,"")}`} target="_blank" className="w-8 h-8 rounded-full bg-[#DCFCE7] text-[#166534] flex items-center justify-center text-sm font-bold flex-shrink-0">↗</a>
            {!isConverted && l.status==="contacted" && <button onClick={()=>convertToContact(l)} disabled={converting===l.id} className="text-xs px-2 py-1 bg-[#DBEAFE] text-[#1E40AF] rounded-[7px] font-semibold whitespace-nowrap">{converting===l.id?"...":"→ קשר"}</button>}
            {isConverted && <span className="text-xs text-[#166534] font-semibold">✓ קשר</span>}
          </div>
        })}
        {monthLeads.length===0&&<div className="text-sm text-[#94A3B8] text-center py-4">אין לידים החודש</div>}
      </div>
    </>}
  </div>
}