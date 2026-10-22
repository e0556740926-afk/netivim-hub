"use client"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { pct } from "@/lib/utils"
import { useUrlState } from "@/lib/use-url-state"
import { useQuickAction } from "@/lib/quick-action"
import Sheet from "@/components/shell/Sheet"
import { Icon } from "@/components/shell/icons"
import "@/components/shell/screens.css"
import { SkeletonCard } from "@/components/ui/Skeleton"
import SfStatusBadge from "@/components/ui/SfStatusBadge"

const STATUS_CYCLE: Record<string,string> = {
  new:"contacted", contacted:"advanced", advanced:"irrelevant", irrelevant:"new"
}
const STATUS_LABEL: Record<string,string> = {
  new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי"
}
const STATUS_COLORS: Record<string,{bg:string,fg:string}> = {
  new:{bg:"#eaf1e7",fg:"#28634e"},
  contacted:{bg:"#eaf1e7",fg:"#28634e"},
  advanced:{bg:"#EDE9FE",fg:"#5B21B6"},
  irrelevant:{bg:"#faeeed",fg:"#a74450"}
}
const EMPTY_FORM = {
  firstName:"", lastName:"", phone:"", age:"", idNumber:"", notes:"", eventId:"", leadSourceId:"", arrivalChannelId:"", contactId:""
}

export default function CoordLeads() {
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [leadSources, setLeadSources] = useState<any[]>([])
  const [arrivalChannels, setArrivalChannels] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [myLeads, setMyLeads] = useState(0)
  const [target, setTarget] = useState(0)
  const [coordId, setCoordId] = useState<number|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [err, setErr] = useState("")
  const [dupWarning, setDupWarning] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useUrlState("q")
  const [view, setView] = useUrlState("view", "month")
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
      const [lRes, tRes, eRes] = await Promise.all([
        fetch(`/api/leads?coordinator_id=${coord.id}`),
        fetch("/api/targets"),
        fetch("/api/events"),
      ])
      const { leads } = await lRes.json()
      const { targets } = await tRes.json()
      const { events } = await eRes.json()
      setEvents((events||[]).filter((e:any)=>["approved","marketing","done"].includes(e.status)))
      setLeads(leads||[])
      fetch("/api/lead-sources").then(r=>r.json()).then(({lead_sources})=>{
        const active = (lead_sources||[]).filter((s:any)=>s.active)
        setLeadSources(active)
        const mine = active.find((s:any)=>s.coordinator_id===coord.id)
        if (mine) setForm(f=>({...f, leadSourceId: String(mine.id)}))
      })
      fetch("/api/arrival-channels").then(r=>r.json()).then(({arrival_channels})=>setArrivalChannels(arrival_channels||[]))
      // Contacts/partners — optional "referred by" picker on the lead form.
      fetch("/api/contacts").then(r=>r.json()).then(({contacts})=>setContacts(contacts||[])).catch(()=>{})
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
    if (!form.leadSourceId) { setErr("יש לבחור מקור פנייה"); return }
    if (!form.arrivalChannelId) { setErr("יש לבחור ערוץ הגעה"); return }
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
        event_id: form.eventId || null,
        lead_source_id: +form.leadSourceId,
        arrival_channel_id: +form.arrivalChannelId,
        contact_id: form.contactId ? +form.contactId : null,
        source: form.eventId ? "event" : "manual"
      })
    })
    const d = await res.json()
    setSaving(false)
    if (d.error==="כפילות") { setDupWarning(d.duplicate); return }
    if (d.error) { setErr(d.error); return }
    setForm({...EMPTY_FORM}); setShowForm(false); load()
  }

  function openForm() { setErr(""); setDupWarning(null); setShowForm(true) }
  // "+ הוספה" → ליד חדש opens this same form (waits until the coordinator is resolved).
  useQuickAction(["lead"], openForm, !loading && !!coordId)

  async function cycleStatus(id:number, cur:string) {
    const next = STATUS_CYCLE[cur]||"new"
    await fetch("/api/leads",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:next})})
    setLeads(l=>l.map(x=>x.id===id?{...x,status:next}:x))
  }

  const p = pct(myLeads,target)
  const monthKey = String(m).padStart(2,"0")
  const needle = q.trim().toLowerCase()
  const VIEWS: [string,string,(l:any)=>boolean][] = [
    ["month","החודש",l=>l.created_at?.slice(5,7)===monthKey && l.created_at?.slice(0,4)===String(y)],
    ["open","בטיפול",l=>l.status==="new"||l.status==="contacted"],
    ["advanced","הועברו",l=>l.status==="advanced"],
    ["all","הכל",()=>true],
  ]
  const viewFn = (VIEWS.find(v=>v[0]===view)||VIEWS[0])[2]
  const shown = leads.filter(l=>viewFn(l) && (!needle || [l.name,l.phone,l.city,l.id_number].join(" ").toLowerCase().includes(needle)))
  const field = (label:string, node:React.ReactNode, hint?:string) => <label className="ws-field">{label}{node}{hint&&<small>{hint}</small>}</label>

  if (error) return <div className="ws"><ErrorState retry={load}/></div>

  return (
    <div className="ws">
      <div className="ws-head">
        <div>
          <h1>הלידים שלי</h1>
          <div className="ws-sub">כל פנייה מקבלת המשך ברור</div>
        </div>
        <button type="button" className="shell-iconbtn" onClick={openForm} aria-label="ליד חדש" disabled={loading||!coordId}><Icon name="plus"/></button>
      </div>

      {loading ? <SkeletonCard rows={5}/> : !coordId ? <div className="ws-card ws-empty">המשתמש שלך עדיין לא מקושר לרכז. פנו למנהל המערכת.</div> : <>
        {/* Compact monthly goal */}
        <div className="ws-card">
          <div className="ws-goal-top">
            <strong>החודש</strong>
            <span>{myLeads} לידים{target ? ` · יעד ${target}` : ""}</span>
          </div>
          {target ? <div className="ws-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label="התקדמות ליעד החודשי"><i style={{width:`${Math.min(100,p)}%`}}/></div> : null}
          <div className="ws-goal-foot">{target ? `${p}% מהיעד · ` : "טרם הוגדר יעד · "}נותרו {new Date(y,m,0).getDate()-new Date().getDate()} ימים</div>
        </div>

        <label className="ws-search">
          <Icon name="search" size={18}/>
          <input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="חיפוש ליד לפי שם או טלפון" aria-label="חיפוש ליד לפי שם או טלפון"/>
        </label>
        <div className="ws-chips" role="group" aria-label="סינון לידים">
          {VIEWS.map(([k,label])=>(
            <button key={k} type="button" aria-pressed={(view||"month")===k} onClick={()=>setView(k==="month"?"":k)}>{label}</button>
          ))}
        </div>

        <div className="ws-section" style={{marginTop:6}}>
          <h2>{(VIEWS.find(v=>v[0]===view)||VIEWS[0])[1]} <span className="ws-count">{shown.length}</span></h2>
          <span className="ws-sub">הקשה על הסטטוס מעדכנת אותו</span>
        </div>
        <div className="ws-list">
          {shown.map(l=>{
            const c=STATUS_COLORS[l.status]||{bg:"#F3F4F6",fg:"#193d33"}
            const wa=`https://wa.me/972${String(l.phone||"").replace(/^0/,"").replace(/[^0-9]/g,"")}`
            return (
              <div key={l.id} className="ws-item" style={{alignItems:"flex-start"}}>
                <span className="ws-avatar">{(l.name||"").split(" ").map((w:string)=>w[0]).join("").slice(0,2)}</span>
                <div className="ws-main">
                  <strong>{l.name}</strong>
                  <small>
                    {l.phone && <a href={`tel:${l.phone}`} style={{color:"inherit"}}>{l.phone}</a>}
                    {l.age&&<> · גיל {l.age}</>}
                    {l.id_number&&<> · ת.ז {l.id_number}</>}
                    {l.score!=null&&<> · <span style={{color:l.score>=8?"#28634e":l.score>=5?"#946014":"#94A3B8"}}>★ {l.score}</span></>}
                  </small>
                  {l.notes&&<small style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.notes}</small>}
                  <div style={{marginTop:6}}><SfStatusBadge lead={l}/></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                  <button type="button" onClick={()=>cycleStatus(l.id,l.status)} aria-label={`סטטוס: ${STATUS_LABEL[l.status]||l.status}. הקשה לשינוי`}
                    style={{background:c.bg,color:c.fg,border:0,borderRadius:8,padding:"6px 9px",fontSize:12,fontWeight:700,minHeight:32,cursor:"pointer",whiteSpace:"nowrap"}}>
                    {STATUS_LABEL[l.status]||l.status}
                  </button>
                  {l.phone && <a href={wa} target="_blank" rel="noopener noreferrer" className="ws-link" style={{padding:"4px 0"}}>וואטסאפ ↗</a>}
                </div>
              </div>
            )
          })}
          {shown.length===0 && (
            <div className="ws-empty">
              {needle ? "לא נמצאו לידים מתאימים לחיפוש." : view && view!=="month" ? "אין לידים בתצוגה הזו." : "אין לידים החודש עדיין."}
              {!needle && <><br/><button type="button" className="ws-link" onClick={openForm}>+ ליד חדש</button></>}
            </div>
          )}
        </div>
      </>}

      {/* Lead form — same fields, validation and duplicate check as before; input is kept on error */}
      <Sheet open={showForm} onClose={()=>{setShowForm(false);setErr("");setDupWarning(null)}} title="ליד חדש" subtitle="הליד ישויך אליך ויישלח לסנכרון כרגיל" labelledBy="lead-form-title"
        footer={<>
          <button type="button" className="ws-btn ws-btn-primary" onClick={addLead} disabled={saving}>{saving ? "שומר…" : "שמירת ליד"}</button>
          <button type="button" className="ws-btn" onClick={()=>{setShowForm(false);setErr("");setDupWarning(null)}}>ביטול</button>
        </>}>
        <form className="ws-form" onSubmit={e=>{e.preventDefault();addLead()}} noValidate>
          {dupWarning && (
            <div className="ws-warn" role="alert"><b>מספר זה כבר קיים — {dupWarning.name}.</b><br/>הליד לא נוצר כדי למנוע כפילות.</div>
          )}
          {err && <div className="ws-error" role="alert">{err}</div>}
          <fieldset className="ws-fieldset">
            <legend>פרטי זיהוי</legend>
            <div className="ws-grid2">
              {field("שם פרטי *", <input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="ישראל" autoComplete="off" required/>)}
              {field("שם משפחה", <input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="ישראלי" autoComplete="off"/>)}
            </div>
            {field("טלפון *", <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="050-0000000" type="tel" inputMode="tel" required/>)}
          </fieldset>
          <fieldset className="ws-fieldset">
            <legend>מקור והגעה</legend>
            {field("מקור פנייה *", <select value={form.leadSourceId} onChange={e=>setForm(f=>({...f,leadSourceId:e.target.value}))} required>
              <option value="">— בחר מקור —</option>
              {leadSources.map((s:any)=><option key={s.id} value={s.id}>{s.coordinator_id?"רכז: ":""}{s.label}</option>)}
            </select>)}
            {field("ערוץ הגעה *", <select value={form.arrivalChannelId} onChange={e=>setForm(f=>({...f,arrivalChannelId:e.target.value}))} required>
              <option value="">— איך הגיע? —</option>
              {arrivalChannels.map((c:any)=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>)}
            {events.length > 0 && field("נאסף באירוע (לא חובה)", <select value={form.eventId} onChange={e=>setForm(f=>({...f,eventId:e.target.value}))}>
              <option value="">— לא באירוע —</option>
              {events.map((ev:any)=><option key={ev.id} value={ev.id}>{ev.name}{ev.date?` (${ev.date.slice(8,10)}.${ev.date.slice(5,7)})`:""}</option>)}
            </select>)}
            {contacts.length > 0 && field("הופנה על ידי — איש קשר / שותף (לא חובה)", <select value={form.contactId} onChange={e=>setForm(f=>({...f,contactId:e.target.value}))}>
              <option value="">— ללא —</option>
              {contacts.map((c:any)=><option key={c.id} value={c.id}>{c.name}{c.org?` · ${c.org}`:""}</option>)}
            </select>)}
          </fieldset>
          <fieldset className="ws-fieldset">
            <legend>פרטים נוספים</legend>
            <div className="ws-grid2">
              {field("גיל", <input value={form.age} onChange={e=>setForm(f=>({...f,age:e.target.value}))} placeholder="18" type="number" inputMode="numeric"/>)}
              {field("ת.ז", <input value={form.idNumber} onChange={e=>setForm(f=>({...f,idNumber:e.target.value}))} placeholder="000000000" type="text" inputMode="numeric" maxLength={9}/>)}
            </div>
            {field("הערות", <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="מידע נוסף על הבחור..." rows={2}/>)}
          </fieldset>
        </form>
      </Sheet>
    </div>
  )
}
