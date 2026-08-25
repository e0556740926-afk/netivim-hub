"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd, ds } from "@/lib/utils"
import Badge from "@/components/ui/Badge"

const STATUS_LABEL: Record<string,string> = { active:"שותף פעיל", initial:"נוצר קשר", meeting:"פגישה", cold:"ליד קר", irrelevant:"לא רלוונטי" }
const INT_ICON: Record<string,string> = { call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝" }

export default function CoordContacts() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<any[]>([])
  const [q, setQ] = useState("")
  const [openId, setOpenId] = useState<number|null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [showIntForm, setShowIntForm] = useState(false)
  const [intForm, setIntForm] = useState({ date:new Date().toISOString().slice(0,10), type:"call", summary:"", next_step:"" })
  const [coordId, setCoordId] = useState<number|null>(null)

  useEffect(() => {
    if (!user) return
    fetch(`/api/coord?user_id=${user.id}`).then(r=>r.json()).then(async ({coord})=>{
      if (!coord) return
      setCoordId(coord.id)
      const res = await fetch(`/api/contacts?coordinator_id=${coord.id}`)
      const { contacts } = await res.json()
      setContacts(contacts||[])
    })
  }, [user])

  async function openDetail(id: number) {
    if (openId===id) { setOpenId(null); setDetail(null); return }
    setOpenId(id); setShowIntForm(false)
    const res = await fetch(`/api/contacts/${id}`)
    setDetail(await res.json())
  }

  async function saveInt() {
    if (!intForm.summary || !openId) return
    await fetch("/api/interactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...intForm,contact_id:openId,coordinator_id:coordId})})
    setShowIntForm(false)
    setIntForm({date:new Date().toISOString().slice(0,10),type:"call",summary:"",next_step:""})
    const res = await fetch(`/api/contacts/${openId}`)
    setDetail(await res.json())
    const cr = await fetch(`/api/contacts?coordinator_id=${coordId}`)
    const { contacts } = await cr.json()
    setContacts(contacts||[])
  }

  const filtered = contacts.filter(c=>!q || `${c.name}${c.org}`.includes(q))

  return <div className="p-4 fade-up">
    <div className="text-xl font-extrabold mb-3">אנשי הקשר שלי</div>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="חיפוש שם או ארגון..." className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[10px] text-sm mb-3 focus:outline-none focus:border-[#00488D] bg-white"/>

    {openId && detail?.contact && <div className="bg-white border-2 border-[#00488D] rounded-[16px] p-4 mb-3 fade-up">
      <div className="flex items-start gap-3 mb-3 pb-3 border-b border-[#E2E8F0]">
        <div className="w-11 h-11 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-sm font-bold flex-shrink-0">{detail.contact.name.split(" ").map((w:string)=>w[0]).join("")}</div>
        <div className="flex-1"><div className="text-sm font-bold">{detail.contact.name}</div><div className="text-xs text-[#64748B]">{detail.contact.role} · {detail.contact.org}</div>
          <div className="flex gap-1.5 mt-1 flex-wrap"><Badge text={STATUS_LABEL[detail.contact.status]||detail.contact.status}/>
            <span className="text-[#f59e0b] text-xs">{"★".repeat(detail.contact.potential||1)}</span>
          </div>
        </div>
        <button onClick={()=>{setOpenId(null);setDetail(null)}} className="text-[#94A3B8] hover:text-[#0D2744] text-xs">✕</button>
      </div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-[#374151]">אינטראקציות ({detail.interactions?.length||0})</div>
        <button onClick={()=>setShowIntForm(v=>!v)} className="text-xs font-bold text-[#00488D]">+ תעד</button>
      </div>
      {showIntForm && <div className="bg-[#F0F7FF] rounded-[10px] p-3 mb-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select value={intForm.type} onChange={e=>setIntForm(f=>({...f,type:e.target.value}))} className="px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs bg-white">
            {[["call","שיחה"],["meeting","פגישה"],["whatsapp","וואטסאפ"],["email","דואל"],["other","אחר"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={intForm.date} onChange={e=>setIntForm(f=>({...f,date:e.target.value}))} className="px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
        </div>
        <textarea value={intForm.summary} onChange={e=>setIntForm(f=>({...f,summary:e.target.value}))} rows={2} placeholder="סיכום *" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs resize-none focus:outline-none focus:border-[#00488D]"/>
        <input value={intForm.next_step} onChange={e=>setIntForm(f=>({...f,next_step:e.target.value}))} placeholder="צעד הבא" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
        <div className="flex gap-2">
          <button onClick={saveInt} className="flex-1 py-1.5 bg-[#0D2744] text-white text-xs font-bold rounded-[8px]">שמור</button>
          <button onClick={()=>setShowIntForm(false)} className="flex-1 py-1.5 border border-[#E2E8F0] text-xs rounded-[8px]">ביטול</button>
        </div>
      </div>}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {(detail.interactions||[]).map((i:any)=><div key={i.id} className="flex gap-2 py-2 border-b border-[#F1F5F9] last:border-0">
          <span className="text-base flex-shrink-0 mt-0.5">{INT_ICON[i.type]||"📝"}</span>
          <div className="flex-1 min-w-0"><div className="text-xs font-semibold">{fd(i.date)}</div>
            <div className="text-xs text-[#475569] mt-0.5">{i.summary}</div>
            {i.next_step&&<div className="text-xs text-[#00488D] mt-0.5">← {i.next_step}</div>}
          </div>
        </div>)}
        {(!detail.interactions||detail.interactions.length===0)&&<div className="text-xs text-[#94A3B8] text-center py-2">אין אינטראקציות</div>}
      </div>
    </div>}

    <div className="space-y-2">
      {filtered.map(c=>{
        const d=ds(c.last_contact); const isOpen=openId===c.id
        return <div key={c.id} onClick={()=>openDetail(c.id)} className={`bg-white border rounded-[12px] p-3 flex items-center gap-3 cursor-pointer transition-colors ${isOpen?"border-[#00488D] bg-[#F0F7FF]":d>=30?"border-[#FECACA] bg-[#FFF8F8]":"border-[#E2E8F0] hover:border-[#BFDBFE]"}`}>
          <div className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">{c.name.split(" ").map((w:string)=>w[0]).join("")}</div>
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{c.name}</div><div className="text-xs text-[#64748B] truncate">{c.org}</div></div>
          <div className="text-right flex-shrink-0">
            <div className="text-[#f59e0b] text-xs">{"★".repeat(c.potential||1)}</div>
            <div className={`text-xs font-semibold mt-0.5 ${d>=30?"text-[#960010]":"text-[#64748B]"}`}>{fd(c.last_contact)}</div>
          </div>
        </div>
      })}
      {filtered.length===0&&<div className="text-sm text-[#94A3B8] text-center py-6">לא נמצאו אנשי קשר</div>}
    </div>
  </div>
}