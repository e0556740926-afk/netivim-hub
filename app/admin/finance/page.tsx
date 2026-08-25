"use client"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import KPICard from "@/components/ui/KPICard"

const CAT_LABEL: Record<string,string> = { equipment:"ציוד", marketing:"פרסום", catering:"כיבוד", venue:"מקום", other:"אחר" }
const STATUS_LABEL: Record<string,string> = { paid:"שולם", pending:"ממתין", cancelled:"בוטל" }
const SRC_CAT: Record<string,string> = { ministry:"משרד ממשלתי", municipality:"עירייה", foundation:"קרן", donation:"תרומה", self:"תקציב עצמי", other:"אחר" }

export default function FinancePage() {
  const [tab, setTab] = useState<"expenses"|"sources">("expenses")
  const [expenses, setExpenses] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [sources, setSources] = useState<any[]>([])
  const [showExpForm, setShowExpForm] = useState(false)
  const [showSrcForm, setShowSrcForm] = useState(false)
  const [editEx, setEditEx] = useState<any>(null)
  const [editSrc, setEditSrc] = useState<any>(null)
  const [filterStatus, setFilterStatus] = useState("")
  const [saving, setSaving] = useState(false)
  const year = new Date().getFullYear()

  const [expForm, setExpForm] = useState({ event_id:"", description:"", vendor:"", amount:0, date:new Date().toISOString().slice(0,10), status:"pending", category:"other" })
  const [srcForm, setSrcForm] = useState({ name:"", description:"", total_amount:0, used_amount:0, category:"ministry", year })

  async function load() {
    const [er, ev, sr] = await Promise.all([
      fetch("/api/expenses"), fetch("/api/events"), fetch(`/api/budget-sources?year=${year}`)
    ])
    const { expenses } = await er.json()
    const { events } = await ev.json()
    const { sources } = await sr.json()
    setExpenses(expenses||[]); setEvents(events||[]); setSources(sources||[])
  }
  useEffect(() => { load() }, [])

  async function saveExp() {
    if (!expForm.description) return
    setSaving(true)
    const body = { ...expForm, event_id: expForm.event_id||null, amount: +expForm.amount }
    if (editEx) await fetch("/api/expenses",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,id:editEx.id})})
    else await fetch("/api/expenses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
    setSaving(false); setShowExpForm(false); setEditEx(null); load()
  }

  async function saveSrc() {
    if (!srcForm.name) return
    setSaving(true)
    if (editSrc) await fetch("/api/budget-sources",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...srcForm,id:editSrc.id})})
    else await fetch("/api/budget-sources",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(srcForm)})
    setSaving(false); setShowSrcForm(false); setEditSrc(null); load()
  }

  async function delExp(id:number) { if(!confirm("למחוק?"))return; await fetch("/api/expenses",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})}); load() }
  async function delSrc(id:number) { if(!confirm("למחוק?"))return; await fetch("/api/budget-sources",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})}); load() }

  const filtered = expenses.filter(e => !filterStatus || e.status===filterStatus)
  const totBudget = sources.reduce((s:number,src:any)=>s+(+src.total_amount||0),0)
  const totSpent = expenses.filter(e=>e.status!=="cancelled").reduce((s:number,e:any)=>s+(+e.amount||0),0)
  const pending = expenses.filter(e=>e.status==="pending").reduce((s:number,e:any)=>s+(+e.amount||0),0)
  const pct = totBudget>0?Math.round(totSpent/totBudget*100):0

  return <div className="p-6 md:p-8 fade-up">
    <h1 className="text-2xl font-extrabold text-[#0D2744] mb-5">מרכז פיננסי</h1>

    {/* KPIs */}
    <div className="grid grid-cols-4 gap-3 mb-5">
      <KPICard label="תקציב מאושר (סעיפים)" value={`₪${totBudget.toLocaleString()}`}/>
      <KPICard label="הוצאות בפועל" value={`₪${totSpent.toLocaleString()}`} color={pct>90?"#960010":pct>75?"#B45309":"#0D2744"}/>
      <KPICard label="יתרה" value={`₪${(totBudget-totSpent).toLocaleString()}`} color={totBudget-totSpent<0?"#960010":"#166534"}/>
      <KPICard label="ממתין לתשלום" value={`₪${pending.toLocaleString()}`} color="#B45309"/>
    </div>

    {/* Tabs */}
    <div className="flex gap-2 mb-5">
      <button onClick={()=>setTab("expenses")} className={`px-5 py-2 rounded-[9px] text-sm font-semibold transition-colors ${tab==="expenses"?"bg-[#0D2744] text-white":"bg-white border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"}`}>הוצאות</button>
      <button onClick={()=>setTab("sources")} className={`px-5 py-2 rounded-[9px] text-sm font-semibold transition-colors ${tab==="sources"?"bg-[#0D2744] text-white":"bg-white border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"}`}>סעיפי תקציב ({sources.length})</button>
    </div>

    {/* ===== EXPENSES TAB ===== */}
    {tab==="expenses" && <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-2">
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
            <option value="">כל הסטטוסים</option>
            {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <span className="text-xs text-[#94A3B8] self-center">{filtered.length} הוצאות</span>
        </div>
        <Button onClick={()=>{setEditEx(null);setExpForm({event_id:"",description:"",vendor:"",amount:0,date:new Date().toISOString().slice(0,10),status:"pending",category:"other"});setShowExpForm(true)}}>+ הוצאה חדשה</Button>
      </div>

      {showExpForm && <Card className="mb-4 border-2 border-[#00488D]"><div className="p-5">
        <div className="text-sm font-bold text-[#00488D] mb-4">{editEx?"עריכת הוצאה":"הוצאה חדשה"}</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="text-xs font-semibold block mb-1">תיאור *</label><input value={expForm.description} onChange={e=>setExpForm(f=>({...f,description:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
          <div><label className="text-xs font-semibold block mb-1">ספק</label><input value={expForm.vendor} onChange={e=>setExpForm(f=>({...f,vendor:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
          <div><label className="text-xs font-semibold block mb-1">אירוע</label>
            <select value={expForm.event_id} onChange={e=>setExpForm(f=>({...f,event_id:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
              <option value="">— ללא —</option>
              {events.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select></div>
          <div><label className="text-xs font-semibold block mb-1">קטגוריה</label>
            <select value={expForm.category} onChange={e=>setExpForm(f=>({...f,category:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
              {Object.entries(CAT_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label className="text-xs font-semibold block mb-1">סכום (₪) *</label><input type="number" value={expForm.amount} onChange={e=>setExpForm(f=>({...f,amount:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
          <div><label className="text-xs font-semibold block mb-1">תאריך</label><input type="date" value={expForm.date} onChange={e=>setExpForm(f=>({...f,date:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
          <div><label className="text-xs font-semibold block mb-1">סטטוס</label>
            <select value={expForm.status} onChange={e=>setExpForm(f=>({...f,status:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
              {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
        </div>
        <div className="flex gap-2"><Button onClick={saveExp} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowExpForm(false)}>ביטול</Button></div>
      </div></Card>}

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
              <td className="px-3 py-2.5 text-xs">{CAT_LABEL[ex.category]||ex.category}</td>
              <td className="px-3 py-2.5 text-xs">{fd(ex.date?.slice(0,10))}</td>
              <td className="px-3 py-2.5 font-bold text-[#0D2744]">₪{(+ex.amount).toLocaleString()}</td>
              <td className="px-3 py-2.5"><Badge text={STATUS_LABEL[ex.status]||ex.status}/></td>
              <td className="px-3 py-2.5"><div className="flex gap-1">
                <button onClick={()=>{setEditEx(ex);setExpForm({event_id:ex.event_id||"",description:ex.description,vendor:ex.vendor||"",amount:ex.amount,date:ex.date?.slice(0,10)||"",status:ex.status,category:ex.category||"other"});setShowExpForm(true)}} className="px-2 py-1 rounded text-xs border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
                <button onClick={()=>delExp(ex.id)} className="px-2 py-1 rounded text-xs border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
              </div></td>
            </tr>)}
            {filtered.length===0&&<tr><td colSpan={8} className="text-center py-8 text-sm text-[#94A3B8]">אין הוצאות</td></tr>}
          </tbody>
        </table>
      </Card>
    </>}

    {/* ===== BUDGET SOURCES TAB ===== */}
    {tab==="sources" && <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-[#64748B]">מקורות מימון ותקציב לשנת {year}</div>
        <Button onClick={()=>{setEditSrc(null);setSrcForm({name:"",description:"",total_amount:0,used_amount:0,category:"ministry",year});setShowSrcForm(true)}}>+ סעיף תקציב חדש</Button>
      </div>

      {showSrcForm && <Card className="mb-4 border-2 border-[#00488D]"><div className="p-5">
        <div className="text-sm font-bold text-[#00488D] mb-4">{editSrc?"עריכת סעיף":"סעיף תקציב חדש"}</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="text-xs font-semibold block mb-1">שם הסעיף *</label><input value={srcForm.name} onChange={e=>setSrcForm(f=>({...f,name:e.target.value}))} placeholder="לדוגמה: משרד החינוך 2026" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
          <div><label className="text-xs font-semibold block mb-1">מקור מימון</label>
            <select value={srcForm.category} onChange={e=>setSrcForm(f=>({...f,category:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
              {Object.entries(SRC_CAT).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label className="text-xs font-semibold block mb-1">סכום מאושר (₪)</label><input type="number" value={srcForm.total_amount} onChange={e=>setSrcForm(f=>({...f,total_amount:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
          <div><label className="text-xs font-semibold block mb-1">סכום שנוצל (₪)</label><input type="number" value={srcForm.used_amount} onChange={e=>setSrcForm(f=>({...f,used_amount:+e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
          <div className="col-span-2"><label className="text-xs font-semibold block mb-1">הערות</label><input value={srcForm.description} onChange={e=>setSrcForm(f=>({...f,description:e.target.value}))} placeholder="תנאים, מועד קבלה, גורם מאשר..." className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        </div>
        <div className="flex gap-2"><Button onClick={saveSrc} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowSrcForm(false)}>ביטול</Button></div>
      </div></Card>}

      <div className="space-y-3">
        {sources.map((src:any) => {
          const pct = src.total_amount>0?Math.round(+src.used_amount/+src.total_amount*100):0
          return <Card key={src.id}><div className="p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-bold">{src.name}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{SRC_CAT[src.category]||src.category}{src.description&&` · ${src.description}`}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={()=>{setEditSrc(src);setSrcForm({name:src.name,description:src.description||"",total_amount:+src.total_amount,used_amount:+src.used_amount,category:src.category,year:src.year});setShowSrcForm(true)}} className="px-2 py-1 rounded text-xs border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
                <button onClick={()=>delSrc(src.id)} className="px-2 py-1 rounded text-xs border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="bg-[#F0F7FF] rounded-[10px] p-3 text-center"><div className="text-xs text-[#64748B]">מאושר</div><div className="text-lg font-extrabold text-[#0D2744] mt-0.5">₪{(+src.total_amount).toLocaleString()}</div></div>
              <div className="bg-[#FFF0F0] rounded-[10px] p-3 text-center"><div className="text-xs text-[#64748B]">נוצל</div><div className="text-lg font-extrabold text-[#960010] mt-0.5">₪{(+src.used_amount).toLocaleString()}</div></div>
              <div className="bg-[#F0FFF4] rounded-[10px] p-3 text-center"><div className="text-xs text-[#64748B]">יתרה</div><div className="text-lg font-extrabold text-[#166534] mt-0.5">₪{(+src.total_amount-+src.used_amount).toLocaleString()}</div></div>
            </div>
            <div><div className="flex justify-between text-xs mb-1"><span className="text-[#64748B]">ניצול תקציב</span><span className={pct>90?"text-[#960010]":pct>70?"text-[#B45309]":"text-[#166534]"}>{pct}%</span></div>
            <div className="h-2 bg-[#F0F4F8] rounded-full overflow-hidden"><div style={{width:`${Math.min(pct,100)}%`,background:pct>90?"#960010":pct>70?"#B45309":"#166534"}} className="h-full rounded-full transition-all"/></div></div>
          </div></Card>
        })}
        {sources.length===0 && <div className="text-center py-12 text-sm text-[#94A3B8]">אין סעיפי תקציב — לחץ "+ סעיף תקציב חדש" להתחלה</div>}
      </div>
    </>}
  </div>
}