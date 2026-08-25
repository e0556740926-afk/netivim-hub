"use client"
import { useEffect, useState, useCallback } from "react"
import { fd, ds } from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"

const TYPE_LABEL: Record<string,string> = {
  partner:"שותף אסטרטגי", authority:"גורם רשות", vendor:"ספק חיצוני", lead:"ליד"
}
const STATUS_LABEL: Record<string,string> = {
  active:"שותף פעיל", initial:"נוצר קשר", meeting:"פגישה", cold:"ליד קר", irrelevant:"לא רלוונטי"
}
const STATUS_COLORS: Record<string,{bg:string,color:string}> = {
  active:{bg:"#DCFCE7",color:"#166534"}, initial:{bg:"#DBEAFE",color:"#1E40AF"},
  meeting:{bg:"#EDE9FE",color:"#5B21B6"}, cold:{bg:"#F3F4F6",color:"#374151"},
  irrelevant:{bg:"#FEE2E2",color:"#991B1B"}
}
const INT_ICON: Record<string,string> = {
  call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝"
}
const INT_LABEL: Record<string,string> = {
  call:"שיחה", meeting:"פגישה", whatsapp:"וואטסאפ", email:"דואל", other:"אחר"
}

const EMPTY_FORM = { name:"", org:"", role:"", phone:"", email:"", type:"partner", status:"cold", potential:1, owner:"", last_contact:"", notes:"" }
const EMPTY_INT = { date:new Date().toISOString().slice(0,10), type:"call", summary:"", next_step:"" }

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [q, setQ] = useState("")
  const [fType, setFType] = useState("")
  const [fStatus, setFStatus] = useState("")
  const [fOwner, setFOwner] = useState("")
  const [openId, setOpenId] = useState<number|null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number|null>(null)
  const [showInt, setShowInt] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [intForm, setIntForm] = useState({...EMPTY_INT})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [cr, tr] = await Promise.all([fetch("/api/contacts"), fetch("/api/targets")])
      const cd = await cr.json()
      const td = await tr.json()
      setContacts(cd.contacts || [])
      setCoords(td.coordinators || [])
    } catch(e) { console.error(e) }
  }, [])

  useEffect(() => { load() }, [load])

  async function openDetail(id: number) {
    if (openId === id) { setOpenId(null); setDetail(null); return }
    setOpenId(id)
    setShowInt(false)
    try {
      const res = await fetch("/api/contacts/" + id)
      const d = await res.json()
      setDetail(d)
    } catch(e) { console.error(e) }
  }

  function startAdd() {
    setEditId(null)
    setForm({...EMPTY_FORM, last_contact: new Date().toISOString().slice(0,10)})
    setShowForm(true)
    setOpenId(null)
    setDetail(null)
  }

  function startEdit(c: any) {
    setEditId(c.id)
    setForm({ name:c.name||"", org:c.org||"", role:c.role||"", phone:c.phone||"", email:c.email||"", type:c.type||"partner", status:c.status||"cold", potential:c.potential||1, owner:c.owner||"", last_contact:c.last_contact||"", notes:c.notes||"" })
    setShowForm(true)
    setOpenId(null)
    setDetail(null)
  }

  async function saveContact() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editId) {
        await fetch("/api/contacts", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...form, id:editId}) })
      } else {
        await fetch("/api/contacts", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) })
      }
      setShowForm(false)
      await load()
    } finally { setSaving(false) }
  }

  async function deleteContact(id: number) {
    if (!confirm("למחוק איש קשר זה?")) return
    await fetch("/api/contacts", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    if (openId === id) { setOpenId(null); setDetail(null) }
    await load()
  }

  async function saveInt() {
    if (!intForm.summary.trim() || !openId) return
    setSaving(true)
    try {
      await fetch("/api/interactions", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...intForm, contact_id:openId}) })
      setShowInt(false)
      setIntForm({...EMPTY_INT})
      const res = await fetch("/api/contacts/" + openId)
      setDetail(await res.json())
      await load()
    } finally { setSaving(false) }
  }

  async function deleteInt(id: number) {
    await fetch("/api/interactions", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    if (openId) {
      const res = await fetch("/api/contacts/" + openId)
      setDetail(await res.json())
    }
  }

  const filtered = contacts.filter(c => {
    if (q && !((c.name||"")+(c.org||"")+(c.role||"")+(c.owner||"")).includes(q)) return false
    if (fType && c.type !== fType) return false
    if (fStatus && c.status !== fStatus) return false
    if (fOwner && c.owner !== fOwner) return false
    return true
  })

  const today = new Date().toISOString().slice(0,10)

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">אנשי קשר ושותפים</h1>
          <div className="text-sm text-[#64748B] mt-0.5">{contacts.length} רשומות</div>
        </div>
        <Button onClick={startAdd}>+ איש קשר חדש</Button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="mb-5 border-2 border-[#00488D]">
          <div className="p-5">
            <div className="text-sm font-bold text-[#00488D] mb-4">{editId ? "עריכת איש קשר" : "איש קשר חדש"}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold block mb-1">שם *</label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">ארגון</label>
                <input value={form.org} onChange={e=>setForm(f=>({...f,org:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">תפקיד</label>
                <input value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">טלפון</label>
                <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">דואל</label>
                <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">רכז אחראי</label>
                <select value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#00488D]">
                  <option value="">— בחר —</option>
                  {coords.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">סוג</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#00488D]">
                  {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">סטטוס</label>
                <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#00488D]">
                  {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">פוטנציאל</label>
                <select value={form.potential} onChange={e=>setForm(f=>({...f,potential:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#00488D]">
                  <option value={1}>★ נמוך</option>
                  <option value={2}>★★ בינוני</option>
                  <option value={3}>★★★ גבוה</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">קשר אחרון</label>
                <input type="date" value={form.last_contact} onChange={e=>setForm(f=>({...f,last_contact:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold block mb-1">הערות</label>
                <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveContact} disabled={saving}>{saving ? "שומר..." : "שמור"}</Button>
              <Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Detail panel */}
      {openId && detail?.contact && (
        <Card className="mb-5 border-2 border-[#00488D]">
          <div className="p-5">
            {/* Contact header */}
            <div className="flex items-start gap-4 pb-4 border-b border-[#E2E8F0] mb-4">
              <div className="w-12 h-12 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-base font-bold flex-shrink-0">
                {(detail.contact.name||"").split(" ").map((w:string)=>w[0]).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold">{detail.contact.name}</div>
                <div className="text-sm text-[#64748B]">{detail.contact.role} · {detail.contact.org}</div>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {STATUS_LABEL[detail.contact.status] && (
                    <span style={STATUS_COLORS[detail.contact.status]} className="px-2.5 py-0.5 rounded-full text-xs font-semibold">
                      {STATUS_LABEL[detail.contact.status]}
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F0F7FF] text-[#00488D]">
                    {TYPE_LABEL[detail.contact.type] || detail.contact.type}
                  </span>
                  <span className="text-[#f59e0b] text-sm">{"★".repeat(detail.contact.potential||1)}{"☆".repeat(3-(detail.contact.potential||1))}</span>
                </div>
              </div>
              <div className="text-right text-xs text-[#64748B] space-y-1 flex-shrink-0">
                {detail.contact.phone && <div>📞 {detail.contact.phone}</div>}
                {detail.contact.email && <div>✉ {detail.contact.email}</div>}
                {detail.contact.owner && <div>👤 {detail.contact.owner}</div>}
                <button onClick={()=>{setOpenId(null);setDetail(null)}} className="text-[#94A3B8] hover:text-[#0D2744] mt-1 block">✕ סגור</button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Interactions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-bold text-[#374151] uppercase tracking-wide">
                    אינטראקציות ({(detail.interactions||[]).length})
                  </div>
                  <Button size="sm" onClick={()=>setShowInt(v=>!v)}>+ תעד</Button>
                </div>

                {showInt && (
                  <div className="bg-[#F0F7FF] rounded-[11px] p-3 mb-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold block mb-1">סוג</label>
                        <select value={intForm.type} onChange={e=>setIntForm(f=>({...f,type:e.target.value}))} className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs bg-white">
                          {Object.entries(INT_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold block mb-1">תאריך</label>
                        <input type="date" value={intForm.date} onChange={e=>setIntForm(f=>({...f,date:e.target.value}))} className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">סיכום *</label>
                      <textarea value={intForm.summary} onChange={e=>setIntForm(f=>({...f,summary:e.target.value}))} rows={2} className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs resize-none focus:outline-none focus:border-[#00488D]"/>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">צעד הבא</label>
                      <input value={intForm.next_step} onChange={e=>setIntForm(f=>({...f,next_step:e.target.value}))} placeholder="מה עושים מכאן?" className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs focus:outline-none focus:border-[#00488D]"/>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveInt} disabled={saving}>שמור</Button>
                      <Button size="sm" variant="secondary" onClick={()=>setShowInt(false)}>ביטול</Button>
                    </div>
                  </div>
                )}

                <div className="space-y-0 max-h-64 overflow-y-auto">
                  {(detail.interactions||[]).length === 0 && (
                    <div className="text-xs text-[#94A3B8] text-center py-4">אין אינטראקציות עדיין</div>
                  )}
                  {(detail.interactions||[]).map((i:any) => (
                    <div key={i.id} className="flex gap-2.5 py-2.5 border-b border-[#F1F5F9] last:border-0">
                      <div className="w-8 h-8 rounded-full bg-[#F0F7FF] flex items-center justify-center text-sm flex-shrink-0">
                        {INT_ICON[i.type]||"📝"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold">{INT_LABEL[i.type]||i.type} · {fd(i.date)}</div>
                        <div className="text-xs text-[#475569] mt-0.5 bg-[#F9FAFB] rounded p-1.5">{i.summary}</div>
                        {i.next_step && <div className="text-xs text-[#00488D] mt-1">← {i.next_step}</div>}
                      </div>
                      <button onClick={()=>deleteInt(i.id)} className="text-[#CBD5E1] hover:text-[#960010] text-xs flex-shrink-0 mt-1">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open tasks */}
              <div>
                <div className="text-xs font-bold text-[#374151] uppercase tracking-wide mb-3">
                  משימות פתוחות ({(detail.tasks||[]).length})
                </div>
                <div className="space-y-0">
                  {(detail.tasks||[]).length === 0 && (
                    <div className="text-xs text-[#94A3B8] text-center py-4">אין משימות פתוחות</div>
                  )}
                  {(detail.tasks||[]).map((t:any) => {
                    const late = t.due_date && t.due_date.slice(0,10) < today
                    return (
                      <div key={t.id} className="flex items-start gap-2 py-2 border-b border-[#F1F5F9] last:border-0">
                        <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{background:late?"#960010":"#00488D"}}/>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold">{t.title}</div>
                          <div className={`text-xs mt-0.5 ${late?"text-[#960010]":"text-[#64748B]"}`}>
                            {late?"⚠ ":""}{fd(t.due_date?.slice(0,10))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-[9px] px-3 py-1.5">
          <span className="text-[#94A3B8] text-sm">🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="חיפוש..." className="border-none outline-none text-sm bg-transparent w-32"/>
          {q && <button onClick={()=>setQ("")} className="text-[#94A3B8] hover:text-[#374151] text-xs">✕</button>}
        </div>
        <select value={fType} onChange={e=>setFType(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הסוגים</option>
          {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <select value={fOwner} onChange={e=>setFOwner(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
          <option value="">כל הרכזים</option>
          {coords.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <span className="text-xs text-[#94A3B8]">{filtered.length} רשומות</span>
      </div>

      {/* Table */}
      <Card><div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <th className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">שם</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">ארגון</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">סוג</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">רכז</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">סטטוס</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">פוטנציאל</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">קשר אחרון</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-sm text-[#94A3B8]">לא נמצאו אנשי קשר</td></tr>
            )}
            {filtered.map(c => {
              const d = ds(c.last_contact)
              const isOpen = openId === c.id
              const sc = STATUS_COLORS[c.status] || {bg:"#F3F4F6",color:"#374151"}
              return (
                <tr key={c.id} className={`border-b border-[#F1F5F9] last:border-0 transition-colors ${d>=30?"bg-[#FFF8F8]":""} ${isOpen?"!bg-[#F0F7FF]":"hover:bg-[#F8FAFC]"}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-[#0D2744]">{c.name}</div>
                    <div className="text-xs text-[#64748B]">{c.role}</div>
                  </td>
                  <td className="px-3 py-2.5 text-[#475569] text-sm">{c.org||"—"}</td>
                  <td className="px-3 py-2.5 text-xs text-[#475569]">{TYPE_LABEL[c.type]||c.type}</td>
                  <td className="px-3 py-2.5 text-xs text-[#475569]">{c.owner||"—"}</td>
                  <td className="px-3 py-2.5">
                    <span style={sc} className="px-2 py-0.5 rounded-full text-xs font-semibold">
                      {STATUS_LABEL[c.status]||c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#f59e0b] text-sm">
                    {"★".repeat(c.potential||1)}{"☆".repeat(3-(c.potential||1))}
                  </td>
                  <td className={`px-3 py-2.5 text-xs font-medium ${d>=30?"text-[#960010]":"text-[#475569]"}`}>
                    {fd(c.last_contact)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={()=>openDetail(c.id)} className={`px-2 py-1 rounded-[6px] text-xs border transition-colors ${isOpen?"bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]":"border-[#E2E8F0] hover:bg-[#F0F7FF]"}`}>👁</button>
                      <button onClick={()=>startEdit(c)} className="px-2 py-1 rounded-[6px] text-xs border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
                      <button onClick={()=>deleteContact(c.id)} className="px-2 py-1 rounded-[6px] text-xs border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div></Card>
    </div>
  )
}