"use client"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd, pct, leadColor } from "@/lib/utils"
import Speedometer from "@/components/ui/Speedometer"
import { SkeletonCard } from "@/components/ui/Skeleton"

const STATUS_CYCLE: Record<string,string> = {
  new:"contacted", contacted:"advanced", advanced:"irrelevant", irrelevant:"new"
}
const STATUS_LABEL: Record<string,string> = {
  new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי"
}
const STATUS_COLORS: Record<string,{bg:string,fg:string}> = {
  new:{bg:"#DBEAFE",fg:"#1E40AF"},
  contacted:{bg:"#DCFCE7",fg:"#166534"},
  advanced:{bg:"#EDE9FE",fg:"#5B21B6"},
  irrelevant:{bg:"#FEE2E2",fg:"#991B1B"}
}
const EMPTY_FORM = {
  firstName:"", lastName:"", phone:"", age:"", idNumber:"", notes:""
}

export default function CoordLeads() {
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [myLeads, setMyLeads] = useState(0)
  const [target, setTarget] = useState(0)
  const [coordId, setCoordId] = useState<number|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [err, setErr] = useState("")
  const [dupWarning, setDupWarning] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const m = new Date().getMonth()+1
  const y = new Date().getFullYear()

  async function load() {
    setLoading(true); setError(false)
    try {
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
      const monthStr = String(m).padStart(2,"0")
      setMyLeads((leads||[]).filter((l:any)=>l.created_at?.slice(5,7)===monthStr).length)
      setTarget(targets?.find((t:any)=>t.coordinator_id===coord.id)?.target_leads||0)
      setLoading(false)
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ if(user) load() },[user])

  async function addLead() {
    if (!form.firstName||!form.phone) { setErr("שם פרטי וטלפון הם שדות חובה"); return }
    setErr(""); setDupWarning(null); setSaving(true)
    const fullName = `${form.firstName} ${form.lastName}`.trim()
    const res = await fetch("/api/leads",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        coordinator_id: coordId,
        name: fullName,
        phone: form.phone,
        age: form.age ? +form.age : null,
        id_number: form.idNumber,
        notes: form.notes,
        source: "manual"
      })
    })
    const d = await res.json()
    setSaving(false)
    if (d.error==="כפילות") { setDupWarning(d.duplicate); return }
    if (d.error) { setErr(d.error); return }
    setForm({...EMPTY_FORM}); setShowForm(false); load()
  }

  async function cycleStatus(id:number, cur:string) {
    const next = STATUS_CYCLE[cur]||"new"
    await fetch("/api/leads",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:next})})
    setLeads(l=>l.map(x=>x.id===id?{...x,status:next}:x))
  }

  const p = pct(myLeads,target)
  const monthLeads = leads.filter(l=>l.created_at?.slice(5,7)===String(m).padStart(2,"0"))

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>

  return (
    <div className="p-4 max-w-2xl mx-auto fade-up">
      <div className="text-xl font-extrabold mb-3">הלידים שלי</div>

      {loading ? <SkeletonCard rows={5}/> : <>
        {/* Speedometer */}
        <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 text-center mb-3">
          <div className="flex justify-center mb-3"><Speedometer actual={myLeads} target={target} size={150}/></div>
          <div className="h-2 bg-[#F0F4F8] rounded-full overflow-hidden mb-2">
            <div style={{width:`${p}%`,background:leadColor(p)}} className="h-full rounded-full transition-all"/>
          </div>
          <div className="text-xs text-[#64748B]">
            {myLeads} לידים החודש · נותרו {new Date(y,m,0).getDate()-new Date().getDate()} ימים
          </div>
        </div>

        {/* Add button */}
        <button onClick={()=>{setShowForm(v=>!v);setErr("");setDupWarning(null)}}
          className={`w-full py-2.5 mb-3 rounded-[14px] text-sm font-bold transition-colors ${showForm?"bg-[#E2E8F0] text-[#374151]":"bg-[#166634] text-white"}`}>
          {showForm ? "✕ סגור" : "+ הוסף ליד"}
        </button>

        {/* Add form */}
        {showForm && (
          <div className="bg-white border-2 border-[#166534] rounded-[16px] p-4 mb-4 fade-up space-y-3">
            <div className="text-sm font-bold text-[#166534] mb-1">ליד חדש</div>

            {/* Name row */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold block mb-1 text-[#374151]">שם פרטי *</label>
                <input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))}
                  placeholder="ישראל"
                  className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#166534]"
                  style={{fontSize:"16px"}}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1 text-[#374151]">שם משפחה</label>
                <input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))}
                  placeholder="ישראלי"
                  className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#166534]"
                  style={{fontSize:"16px"}}/>
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-semibold block mb-1 text-[#374151]">טלפון *</label>
              <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                placeholder="050-0000000" type="tel"
                className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#166534]"
                style={{fontSize:"16px"}}/>
            </div>

            {/* Age + ID */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold block mb-1 text-[#374151]">גיל</label>
                <input value={form.age} onChange={e=>setForm(f=>({...f,age:e.target.value}))}
                  placeholder="18" type="number"
                  className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#166534]"
                  style={{fontSize:"16px"}}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1 text-[#374151]">ת.ז</label>
                <input value={form.idNumber} onChange={e=>setForm(f=>({...f,idNumber:e.target.value}))}
                  placeholder="000000000" type="text" inputMode="numeric" maxLength={9}
                  className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm focus:outline-none focus:border-[#166534]"
                  style={{fontSize:"16px"}}/>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold block mb-1 text-[#374151]">הערות</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                placeholder="מידע נוסף על הבחור..." rows={2}
                className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm resize-none focus:outline-none focus:border-[#166534]"
                style={{fontSize:"16px"}}/>
            </div>

            {/* Duplicate warning */}
            {dupWarning && (
              <div className="bg-[#FEF3C7] text-[#B45309] rounded-[10px] px-3 py-2.5 text-xs font-semibold">
                ⚠️ מספר זה כבר קיים — {dupWarning.name}
                <div className="font-normal mt-0.5">הליד לא נוצר כדי למנוע כפילות.</div>
              </div>
            )}

            {err && <div className="text-xs text-[#960010] font-semibold">{err}</div>}

            <div className="flex gap-2 pt-1">
              <button onClick={addLead} disabled={saving}
                className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50 hover:bg-[#00488D] transition-colors">
                {saving ? "שומר..." : "הוסף ליד"}
              </button>
              <button onClick={()=>{setShowForm(false);setErr("");setDupWarning(null)}}
                className="px-4 py-2.5 border border-[#E2E8F0] rounded-[10px] text-sm text-[#64748B] hover:bg-[#F8FAFC]">
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Leads list */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold">החודש ({monthLeads.length})</div>
          <div className="text-xs text-[#94A3B8]">לחץ על סטטוס לשינוי</div>
        </div>

        <div className="space-y-2">
          {monthLeads.map(l=>{
            const c=STATUS_COLORS[l.status]||{bg:"#F3F4F6",fg:"#374151"}
            return (
              <div key={l.id} className="bg-white border border-[#E2E8F0] rounded-[12px] p-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(l.name||"").split(" ").map((w:string)=>w[0]).join("").slice(0,2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{l.name}</div>
                    <div className="text-xs text-[#64748B] flex gap-2 flex-wrap">
                      <span>{l.phone}</span>
                      {l.age&&<span>גיל {l.age}</span>}
                      {l.id_number&&<span>ת.ז {l.id_number}</span>}
                      {l.score!=null&&<span style={{color:l.score>=8?"#166534":l.score>=5?"#B45309":"#94A3B8"}}>★ {l.score}</span>}
                    </div>
                    {l.notes&&<div className="text-xs text-[#94A3B8] mt-0.5 truncate">{l.notes}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span onClick={()=>cycleStatus(l.id,l.status)}
                      style={{background:c.bg,color:c.fg}}
                      className="px-2 py-0.5 rounded-full text-xs font-bold cursor-pointer whitespace-nowrap">
                      {STATUS_LABEL[l.status]||l.status}
                    </span>
                    <a href={`https://wa.me/972${l.phone?.replace(/^0/,"").replace(/-/g,"")}`} target="_blank"
                      className="text-[10px] text-[#166534] font-semibold">↗ וואטסאפ</a>
                  </div>
                </div>
              </div>
            )
          })}
          {monthLeads.length===0 && (
            <div className="text-sm text-[#94A3B8] text-center py-6 bg-white border border-[#E2E8F0] rounded-[12px]">
              אין לידים החודש עדיין
            </div>
          )}
        </div>
      </>}
    </div>
  )
}