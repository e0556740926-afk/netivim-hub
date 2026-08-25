"use client"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import KPICard from "@/components/ui/KPICard"

const CAT_LABEL: Record<string,string> = { equipment:"ציוד", marketing:"פרסום", catering:"כיבוד", venue:"מקום", other:"אחר" }
const STATUS_LABEL: Record<string,string> = { paid:"שולם", pending:"ממתין", cancelled:"בוטל" }

export default function FinancePage() {
  const [expenses, setExpenses] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editEx, setEditEx] = useState<any>(null)
  const [filterStatus, setFilterStatus] = useState("")
  const [filterEvent, setFilterEvent] = useState("")
  const [form, setForm] = useState({ event_id:"", description:"", vendor:"", amount:0, date:new Date().toISOString().slice(0,10), status:"pending", category:"other" })
  const [saving, setSaving] = useState(false)

  async function load() {
    const [er, ev] = await Promise.all([fetch("/api/expenses"), fetch("/api/events")])
    const { expenses } = await er.json()
    const { events } = await ev.json()
    setExpenses(expenses||[]); setEvents(events||[])
  }

  useEffect(()=>{ load() },[])

  function startEdit(ex: any) {
    setEditEx(ex)
    setForm({ event_id:ex.event_id||"", description:ex.description, vendor:ex.vendor||"", amount:ex.amount, date:ex.date?.slice(0,10)||"", status:ex.status, category:ex.category||"other" })
    setShowForm(true)
  }

  async function save() {
    if (!form.description) return
    setSaving(true)
    const body = { ...form, event_id:form.event_id||null, amount:+form.amount }
    if (editEx) await fetch("/api/expenses",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,id:editEx.id})})
    else await fetch("/api/expenses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
    setSaving(false); setShowForm(false); setEditEx(null); load()
  }

  async function del(id: number) {
    if (!confirm("למחוק?")) return
    await fetch("/api/expenses",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})})
    load()
  }

  const filtered = expenses.filter(e=>{
    if (filterStatus && e.status!==filterStatus) return false
    if (filterEvent && String(e.event_id)!==filterEvent) return false
    return true
  })

  const totBudget = events.reduce((s:number,e:any)=>s+(+e.budget_planned||0),0)
  const totSpent = expenses.filter(e=>e.status!=="cancelled").reduce((s:number,e:any)=>s+(+e.amount||0),0)
  const pending = expenses.filter(e=>e.status==="pending").reduce((s:number,e:any)=>s+(+e.amount||0),0)
  const pct = totBudget>0?Math.round(totSpent/totBudget*100):0

  return <div className="p-6 md:p-8 fade-up">
    <div className="flex items-center justify-between mb-5">
      <h1 className="text-2xl font-extrabold text-[#0D2744]">מרכז פיננסי</h1>
      <Button onClick={()=>{setEditEx(null);setForm({event_id:"",description:"",vendor:"",amount:0,date:new Date().toISOString().slice(0,10),status:"pending",category:"other"});setShowForm(true)}}>+ הוצאה חדשה</Button>
    </div>

    <div className="grid grid-cols-4 gap-3 mb-5">
      <KPICard label="תקציב כולל" value={`₪${totBudget.toLocaleString()}`}/>
      <KPICard label="הוצאות בפועל" value={`₪${totSpent.toLocaleString()}`} color={pct>90?"#960010":pct>75?"#B45309":"#0D2744"}/>
      <KPICard label="יתרה" value={`₪${(totBudget-totSpent).toLocaleString()}`} color={totBudget-totSpent<0?"#960010":"#166534"}/>
      <KPICard label="ממתין לתשלום" value={`₪${pending.toLocaleString()}`} color="#B45309"/>
    </div>

    {showForm && <Card className="mb-5 border-2 border-[#00488D]"><div className="p-5">
      <div className="text-sm font-bold text-[#00488D] mb-4">{editEx?"עריכת הוצאה":"הוצאה חדשה"}</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="text-xs font-semibold block mb-1">תיאור *</label>
          <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">ספק</label>
          <input value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">אירוע</label>
          <select value={form.event_id} onChange={e=>setForm(f=>({...f,event_id:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            <option value="">— ללא —</option>
            {events.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">קטגוריה</label>
          <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(CAT_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">סכום (₪) *</label>
          <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">תאריך</label>
          <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">סטטוס</label>
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select></div>
      </div>
      <div className="flex gap-2"><Button onClick={save} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button></div>
    </div></Card>}

    <div className="flex gap-2 mb-4">
      <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
        <option value="">כל הסטטוסים</option>
        {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <select value={filterEvent} onChange={e=>setFilterEvent(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
        <option value="">כל האירועים</option>
        {events.map((e:any)=><option key={e.id} value={String(e.id)}>{e.name}</option>)}
      </select>
      <span className="text-xs text-[#94A3B8] self-center">{filtered.length} הוצאות</span>
    </div>

    <Card>
      <table className="w-full text-sm border-collapse">
        <thead><tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
          {["תיאור","אירוע","ספק","קטגוריה","תאריך","סכום","סטטוס",""].map(h=><th key={h} className="px-3 py-2.5 text-right text-xs font-bold text-[#64748B]">{h}</th>)}
        </tr></thead>
        <tbody>
          {filtered.map(ex=><tr key={ex.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
            <td className="px-3 py-2.5 font-semibold">{ex.description}</td>
            <td className="px-3 py-2.5 text-xs text-[#64748B]">{ex.event_name||"—"}</td>
            <td className="px-3 py-2.5 text-[#475569]">{ex.vendor||"—"}</td>
            <td className="px-3 py-2.5 text-xs text-[#475569]">{CAT_LABEL[ex.category]||ex.category}</td>
            <td className="px-3 py-2.5 text-xs">{fd(ex.date?.slice(0,10))}</td>
            <td className="px-3 py-2.5 font-bold">₪{(+ex.amount).toLocaleString()}</td>
            <td className="px-3 py-2.5"><Badge text={STATUS_LABEL[ex.status]||ex.status}/></td>
            <td className="px-3 py-2.5"><div className="flex gap-1">
              <button onClick={()=>startEdit(ex)} className="px-2 py-1 rounded text-xs border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
              <button onClick={()=>del(ex.id)} className="px-2 py-1 rounded text-xs border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
            </div></td>
          </tr>)}
          {filtered.length===0&&<tr><td colSpan={8} className="text-center py-8 text-sm text-[#94A3B8]">אין הוצאות</td></tr>}
        </tbody>
      </table>
    </Card>
  </div>
}