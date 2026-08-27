"use client"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import ExportButton from "@/components/ui/ExportButton"
import Badge from "@/components/ui/Badge"
import { SkeletonTable } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

const STATUS_LABEL: Record<string,string> = {
  new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי"
}
const STATUS_COLORS: Record<string,{bg:string,color:string}> = {
  new:{bg:"#DBEAFE",color:"#1E40AF"},
  contacted:{bg:"#DCFCE7",color:"#166534"},
  advanced:{bg:"#EDE9FE",color:"#5B21B6"},
  irrelevant:{bg:"#FEE2E2",color:"#991B1B"}
}
const EMPTY_FORM = { firstName:"", lastName:"", phone:"", age:"", idNumber:"", notes:"", coordinator_id:"", owner_name:"" }

export default function AdminLeads() {
  const [leads, setLeads] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [dupWarning, setDupWarning] = useState<any>(null)
  const [filterCoord, setFilterCoord] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [q, setQ] = useState("")

  async function load() {
    setLoading(true); setError(false)
    try {
      const [lr, ua] = await Promise.all([
        fetch("/api/leads"), fetch("/api/users/all")
      ])
      const { leads } = await lr.json()
      const { coordinators, admins } = await ua.json()
      setLeads(leads||[])
      setCoords(coordinators||[])
      setAdminUsers(admins||[])
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  async function addLead() {
    if (!form.firstName||!form.phone) { setErr("שם פרטי וטלפון הם שדות חובה"); return }
    if (!form.coordinator_id && !form.owner_name) { setErr("יש לבחור את מי לשייך את הליד"); return }
    setErr(""); setDupWarning(null); setSaving(true)
    const fullName = `${form.firstName} ${form.lastName}`.trim()
    const res = await fetch("/api/leads",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        coordinator_id: form.coordinator_id ? +form.coordinator_id : null,
        owner_name: form.owner_name||"",
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

  async function convertToContact(lead: any) {
    const coord = coords.find(c=>c.id===lead.coordinator_id)
    const res = await fetch("/api/leads/convert",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({lead_id:lead.id, coordinator_name:coord?.name||""})
    })
    const d = await res.json()
    if (d.contact_id || d.error) load()
  }

  const filtered = leads.filter(l => {
    if (q && !((l.name||"")+(l.phone||"")).includes(q)) return false
    if (filterCoord && String(l.coordinator_id)!==filterCoord) return false
    if (filterStatus && l.status!==filterStatus) return false
    return true
  })

  const InputClass = "w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">ניהול לידים</h1>
          <div className="text-sm text-[#64748B] mt-0.5">{leads.length} לידים סה"כ</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportButton type="leads"/>
          <Button onClick={()=>{setShowForm(v=>!v);setErr("");setDupWarning(null)}}>+ הוסף ליד</Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="mb-5 border-2 border-[#00488D]">
          <div className="p-5">
            <div className="text-sm font-bold text-[#00488D] mb-4">הוספת ליד חדש</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold block mb-1">שם פרטי *</label>
                <input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))}
                  placeholder="שם פרטי" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">שם משפחה</label>
                <input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))}
                  placeholder="שם משפחה" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">טלפון *</label>
                <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                  placeholder="050-0000000" type="tel" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">שיוך ל</label>
                <select
                  value={form.coordinator_id ? "coord_"+form.coordinator_id : form.owner_name ? "admin_"+form.owner_name : ""}
                  onChange={e=>{
                    const v = e.target.value
                    if (v.startsWith("coord_")) {
                      setForm(f=>({...f, coordinator_id: v.replace("coord_",""), owner_name:""}))
                    } else if (v.startsWith("admin_")) {
                      setForm(f=>({...f, coordinator_id:"", owner_name: v.replace("admin_","")}))
                    } else {
                      setForm(f=>({...f, coordinator_id:"", owner_name:""}))
                    }
                  }}
                  className={InputClass+" bg-white"}>
                  <option value="">— בחר משתמש —</option>
                  <optgroup label="רכזים">
                    {coords.map((c:any)=><option key={c.id} value={"coord_"+c.id}>{c.name}</option>)}
                  </optgroup>
                  <optgroup label="מנהלים">
                    {adminUsers.map((a:any)=><option key={a.id} value={"admin_"+a.name}>👑 {a.name}</option>)}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">גיל</label>
                <input value={form.age} onChange={e=>setForm(f=>({...f,age:e.target.value}))}
                  placeholder="18" type="number" className={InputClass}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">ת.ז</label>
                <input value={form.idNumber} onChange={e=>setForm(f=>({...f,idNumber:e.target.value}))}
                  placeholder="000000000" maxLength={9} className={InputClass}/>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold block mb-1">הערות</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                  rows={2} placeholder="מידע נוסף..." className={InputClass+" resize-none"}/>
              </div>
            </div>
            {dupWarning && (
              <div className="bg-[#FEF3C7] text-[#B45309] rounded-[9px] px-3 py-2.5 text-xs font-semibold mb-3">
                ⚠️ מספר זה כבר קיים — {dupWarning.name}. הליד לא נוצר.
              </div>
            )}
            {err && <div className="text-xs text-[#960010] mb-3 font-semibold">{err}</div>}
            <div className="flex gap-2">
              <Button onClick={addLead} disabled={saving}>{saving?"שומר...":"הוסף ליד"}</Button>
              <Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-[9px] px-3 py-1.5">
          <span className="text-[#94A3B8]">🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="שם / טלפון..."
            className="text-sm outline-none bg-transparent w-28"/>
          {q&&<button onClick={()=>setQ("")} className="text-[#94A3B8] text-xs">✕</button>}
        </div>
        <select value={filterCoord} onChange={e=>setFilterCoord(e.target.value)}
          className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הרכזים</option>
          {coords.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-xs text-[#94A3B8]">{filtered.length} רשומות</span>
      </div>

      {/* Table */}
      {loading ? <SkeletonTable rows={6} cols={6}/> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  {["שם","טלפון","ת.ז","גיל","ציון","רכז","סטטוס","תאריך",""].map(h=>(
                    <th key={h} className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-sm text-[#94A3B8]">אין לידים</td></tr>
                )}
                {filtered.map(l => {
                  const coord = coords.find(c=>c.id===l.coordinator_id)
                  const sc = STATUS_COLORS[l.status]||{bg:"#F3F4F6",color:"#374151"}
                  return (
                    <tr key={l.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-[#0D2744]">{l.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[#475569]">
                        <a href={`https://wa.me/972${l.phone?.replace(/^0/,"").replace(/-/g,"")}`} target="_blank"
                          className="hover:text-[#166534] transition-colors">{l.phone}</a>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94A3B8]">{l.id_number||"—"}</td>
                      <td className="px-3 py-2.5 text-[#475569]">{l.age||"—"}</td>
                      <td className="px-3 py-2.5 font-bold" style={{color:l.score>=8?"#166534":l.score>=5?"#B45309":"#94A3B8"}}>{l.score??"—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[#475569]">{l.owner_display||coord?.name||l.owner_name||"—"}</td>
                      <td className="px-3 py-2.5">
                        <span style={sc} className="px-2 py-0.5 rounded-full text-xs font-semibold">
                          {STATUS_LABEL[l.status]||l.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94A3B8] whitespace-nowrap">{fd(l.created_at?.slice(0,10))}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {l.status==="contacted" && (
                            <button onClick={()=>convertToContact(l)}
                              className="px-2 py-1 rounded-[6px] text-xs bg-[#DBEAFE] text-[#1E40AF] font-semibold hover:bg-[#BFDBFE] whitespace-nowrap">
                              → קשר
                            </button>
                          )}
                          <a href={`https://wa.me/972${l.phone?.replace(/^0/,"").replace(/-/g,"")}`} target="_blank"
                            className="px-2 py-1 rounded-[6px] text-xs bg-[#DCFCE7] text-[#166534] font-semibold hover:bg-[#BBF7D0]">
                            ↗
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}