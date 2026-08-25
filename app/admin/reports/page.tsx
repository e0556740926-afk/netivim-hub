"use client"
import { useEffect, useState } from "react"
import { fd } from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"

const INT_ICON: Record<string,string> = { call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝" }
const INT_LABEL: Record<string,string> = { call:"שיחה", meeting:"פגישה", whatsapp:"וואטסאפ", email:"דואל", other:"אחר" }
const TASK_STATUS: Record<string,string> = { todo:"לביצוע", inprogress:"בתהליך", waiting:"ממתין לתשובה", done:"בוצע" }
const LEAD_STATUS: Record<string,string> = { new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי" }
const MTG_TYPE: Record<string,string> = { regular:"שגרתית", urgent:"חירום", goal:"מטרה מוגדרת" }

export default function CoordManagementPage() {
  const [tab, setTab] = useState<"meetings"|"reports"|"tracking">("meetings")
  const [meetings, setMeetings] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [activeCoord, setActiveCoord] = useState<any>(null)
  const [activity, setActivity] = useState<any>(null)
  const [actTab, setActTab] = useState<"tasks"|"leads"|"interactions"|"reports">("tasks")

  // Meeting form
  const [showMtgForm, setShowMtgForm] = useState(false)
  const [mtgForm, setMtgForm] = useState({ coordinator_id:"", date:new Date().toISOString().slice(0,10), type:"regular", agenda:"", summary:"", next_meeting_date:"" })
  const [extracting, setExtracting] = useState(false)
  const [extractedTasks, setExtractedTasks] = useState<any[]>([])
  const [savingMtg, setSavingMtg] = useState(false)

  // Reports filter
  const [rFilter, setRFilter] = useState("")
  const [openReport, setOpenReport] = useState<number|null>(null)

  async function load() {
    const [mr, rr, cr] = await Promise.all([
      fetch("/api/meetings"), fetch("/api/reports"), fetch("/api/targets")
    ])
    const { meetings } = await mr.json()
    const { reports } = await rr.json()
    const { coordinators } = await cr.json()
    setMeetings(meetings||[])
    setReports(reports||[])
    setCoords(coordinators||[])
  }
  useEffect(() => { load() }, [])

  async function extractTasks() {
    if (!mtgForm.summary.trim() || !mtgForm.coordinator_id) return
    setExtracting(true)
    setExtractedTasks([])
    try {
      const coord = coords.find((c:any) => String(c.id) === mtgForm.coordinator_id)
      const res = await fetch("/api/extract-tasks", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ summary: mtgForm.summary, coordinator_name: coord?.name||"", date: mtgForm.date })
      })
      const d = await res.json()
      setExtractedTasks(d.tasks || [])
    } finally { setExtracting(false) }
  }

  async function saveMeeting() {
    if (!mtgForm.coordinator_id || !mtgForm.summary.trim()) return
    setSavingMtg(true)
    try {
      // Save meeting
      await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ ...mtgForm, coordinator_id: parseInt(mtgForm.coordinator_id) })
      })
      // Save extracted tasks
      for (const t of extractedTasks) {
        if (!t._skip) {
          await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ ...t, coordinator_id: parseInt(mtgForm.coordinator_id), status: "todo" })
          })
        }
      }
      setShowMtgForm(false)
      setMtgForm({ coordinator_id:"", date:new Date().toISOString().slice(0,10), type:"regular", agenda:"", summary:"", next_meeting_date:"" })
      setExtractedTasks([])
      load()
    } finally { setSavingMtg(false) }
  }

  async function openTracking(coord: any) {
    if (activeCoord?.id === coord.id) { setActiveCoord(null); setActivity(null); return }
    setActiveCoord(coord)
    const res = await fetch("/api/coord/activity?coordinator_id=" + coord.id)
    setActivity(await res.json())
    setActTab("tasks")
  }

  const filteredReports = rFilter ? reports.filter((r:any)=>r.coordinator_name===rFilter) : reports
  const coordNames = [...new Set(reports.map((r:any)=>r.coordinator_name))]

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      <h1 className="text-2xl font-extrabold text-[#0D2744] mb-5">ניהול רכזים</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#E2E8F0] pb-0">
        {([
          ["meetings","סיכומי פגישות","🤝"],
          ["reports","דיווחים שבועיים","📋"],
          ["tracking","מעקב פעילות","📊"],
        ] as const).map(([key,label,icon])=>(
          <button key={key} onClick={()=>setTab(key)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab===key?"border-[#00488D] text-[#00488D]":"border-transparent text-[#475569] hover:text-[#0D2744]"}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ===== MEETINGS TAB ===== */}
      {tab==="meetings" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-[#64748B]">{meetings.length} פגישות מתועדות</div>
            <Button onClick={()=>{setShowMtgForm(true);setExtractedTasks([])}}>+ סיכום פגישה חדש</Button>
          </div>

          {showMtgForm && (
            <Card className="mb-5 border-2 border-[#00488D]">
              <div className="p-5">
                <div className="text-sm font-bold text-[#00488D] mb-4">סיכום פגישה חדש</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">רכז *</label>
                    <select value={mtgForm.coordinator_id} onChange={e=>setMtgForm(f=>({...f,coordinator_id:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#00488D]">
                      <option value="">— בחר רכז —</option>
                      {coords.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">תאריך</label>
                    <input type="date" value={mtgForm.date} onChange={e=>setMtgForm(f=>({...f,date:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">סוג פגישה</label>
                    <select value={mtgForm.type} onChange={e=>setMtgForm(f=>({...f,type:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#00488D]">
                      {Object.entries(MTG_TYPE).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-xs font-semibold block mb-1">אג&apos;נדה / נושאים שדוברו</label>
                  <input value={mtgForm.agenda} onChange={e=>setMtgForm(f=>({...f,agenda:e.target.value}))} placeholder="נושאי הפגישה בקצרה..." className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
                </div>
                <div className="mb-3">
                  <label className="text-xs font-semibold block mb-1">סיכום הפגישה * <span className="text-[#00488D] font-normal">(ה-AI יגזור מכאן משימות)</span></label>
                  <textarea value={mtgForm.summary} onChange={e=>setMtgForm(f=>({...f,summary:e.target.value}))} rows={5}
                    placeholder="כתוב כאן את סיכום הפגישה בחופשיות — מה סוכם, מה צריך לעשות, מה האתגרים..."
                    className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/>
                </div>
                <div className="mb-4">
                  <label className="text-xs font-semibold block mb-1">תאריך פגישה הבאה</label>
                  <input type="date" value={mtgForm.next_meeting_date} onChange={e=>setMtgForm(f=>({...f,next_meeting_date:e.target.value}))} className="w-48 px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
                </div>

                {/* AI Extract Button */}
                <div className="flex gap-2 mb-4">
                  <button onClick={extractTasks} disabled={extracting || !mtgForm.summary.trim() || !mtgForm.coordinator_id}
                    className="flex items-center gap-2 px-4 py-2 bg-[#5B21B6] text-white rounded-[9px] text-sm font-semibold disabled:opacity-50 hover:bg-[#4C1D95] transition-colors">
                    {extracting ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block"/><span>מחלץ משימות...</span></>
                    ) : (
                      <><span>✨</span><span>חלץ משימות עם AI</span></>
                    )}
                  </button>
                  {extractedTasks.length > 0 && <span className="text-xs text-[#166534] self-center font-semibold">✓ נמצאו {extractedTasks.length} משימות</span>}
                </div>

                {/* Extracted Tasks */}
                {extractedTasks.length > 0 && (
                  <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[11px] p-4 mb-4">
                    <div className="text-xs font-bold text-[#5B21B6] mb-3">✨ משימות שחולצו — בדוק וערוך לפני השמירה</div>
                    <div className="space-y-2">
                      {extractedTasks.map((t:any, i:number) => (
                        <div key={i} className={`flex items-start gap-2.5 p-3 rounded-[9px] border transition-colors ${t._skip?"border-[#E5E7EB] bg-[#F9FAFB] opacity-50":"border-[#C4B5FD] bg-white"}`}>
                          <input type="checkbox" checked={!t._skip} onChange={e=>setExtractedTasks(ts=>ts.map((x,j)=>j===i?{...x,_skip:!e.target.checked}:x))} className="mt-0.5 accent-[#5B21B6] flex-shrink-0"/>
                          <div className="flex-1 min-w-0">
                            <input value={t.title} onChange={e=>setExtractedTasks(ts=>ts.map((x,j)=>j===i?{...x,title:e.target.value}:x))}
                              className="w-full text-sm font-semibold bg-transparent border-none outline-none focus:bg-white focus:border focus:border-[#C4B5FD] rounded px-1"/>
                            {t.details && <div className="text-xs text-[#6B7280] mt-0.5 px-1">{t.details}</div>}
                          </div>
                          <div className="text-xs text-[#5B21B6] bg-[#EDE9FE] px-2 py-0.5 rounded-full flex-shrink-0">
                            {({call:"שיחה",meeting:"פגישה",materials:"חומרים",backoffice:"בק-אופיס"} as Record<string,string>)[t.type]||t.type}
                          </div>
                          <div className="text-xs text-[#94A3B8] flex-shrink-0">{fd(t.due_date)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-[#6B7280] mt-2">תאריך יעד ברירת מחדל: שבוע מהיום · ניתן לשנות מאוחר יותר</div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={saveMeeting} disabled={savingMtg}>{savingMtg ? "שומר..." : `שמור פגישה${extractedTasks.filter((t:any)=>!t._skip).length>0?" ו-"+extractedTasks.filter((t:any)=>!t._skip).length+" משימות":""}`}</Button>
                  <Button variant="secondary" onClick={()=>{setShowMtgForm(false);setExtractedTasks([])}}>ביטול</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Meetings list */}
          <div className="space-y-3">
            {meetings.length === 0 && <div className="text-center py-12 text-sm text-[#94A3B8]">אין פגישות מתועדות עדיין</div>}
            {meetings.map((m:any) => (
              <Card key={m.id}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {(m.coordinator_name||"").split(" ").map((w:string)=>w[0]).join("")}
                      </div>
                      <div>
                        <div className="text-sm font-bold">{m.coordinator_name}</div>
                        <div className="text-xs text-[#64748B]">{MTG_TYPE[m.type]||m.type} · {fd(m.date)} {m.area&&`· ${m.area}`}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.next_meeting_date && <div className="text-xs text-[#00488D] bg-[#F0F7FF] px-2 py-1 rounded-lg">פגישה הבאה: {fd(m.next_meeting_date)}</div>}
                      <button onClick={async()=>{if(confirm("למחוק?"))await fetch("/api/meetings",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:m.id})}).then(()=>load())}}
                        className="text-[#CBD5E1] hover:text-[#960010] text-xs">✕</button>
                    </div>
                  </div>
                  {m.agenda && <div className="text-xs font-semibold text-[#374151] mb-1">נושאים: <span className="font-normal text-[#475569]">{m.agenda}</span></div>}
                  <div className="text-sm text-[#475569] bg-[#F9FAFB] rounded-[9px] p-3">{m.summary}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ===== REPORTS TAB ===== */}
      {tab==="reports" && (
        <div>
          <div className="flex gap-2 mb-4 items-center">
            <select value={rFilter} onChange={e=>setRFilter(e.target.value)} className="px-3 py-1.5 border border-[#E2E8F0] rounded-[9px] text-sm bg-white">
              <option value="">כל הרכזים</option>
              {(coordNames as string[]).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-xs text-[#94A3B8]">{filteredReports.length} דיווחים</span>
          </div>
          <div className="space-y-3">
            {filteredReports.map((r:any) => (
              <Card key={r.id}>
                <div onClick={()=>setOpenReport(openReport===r.id?null:r.id)} className="p-4 flex items-center gap-4 cursor-pointer hover:bg-[#F8FAFC] transition-colors">
                  <div className="w-9 h-9 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(r.coordinator_name||"").split(" ").map((w:string)=>w[0]).join("")}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{r.coordinator_name}</div>
                    <div className="text-xs text-[#64748B]">שבוע {fd(r.week_start)} · {r.area}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#00488D]">{r.leads_count} לידים</div>
                    <div className="text-xs text-[#64748B]">{new Date(r.submitted_at).toLocaleDateString("he-IL")}</div>
                  </div>
                  <span className="text-[#94A3B8] text-sm">{openReport===r.id?"▲":"▼"}</span>
                </div>
                {openReport===r.id && (
                  <div className="border-t border-[#E2E8F0] p-4 bg-[#F8FAFC] grid grid-cols-2 gap-4">
                    <div><div className="text-xs font-bold text-[#374151] mb-1">הישגים מרכזיים</div><div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.achievements||"—"}</div></div>
                    <div><div className="text-xs font-bold text-[#374151] mb-1">אתגרים</div><div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.challenges||"—"}</div></div>
                    <div className="col-span-2"><div className="text-xs font-bold text-[#374151] mb-1">תכנון שבוע הבא</div><div className="text-sm text-[#475569] bg-white rounded-[9px] p-3 border border-[#E2E8F0]">{r.next_week_plan||"—"}</div></div>
                  </div>
                )}
              </Card>
            ))}
            {filteredReports.length===0 && <div className="text-center py-12 text-sm text-[#94A3B8]">אין דיווחים</div>}
          </div>
        </div>
      )}

      {/* ===== TRACKING TAB ===== */}
      {tab==="tracking" && (
        <div>
          <div className="text-sm text-[#64748B] mb-4">לחץ על רכז לצפייה בכל הפעילות שלו</div>
          <div className="space-y-2">
            {coords.map((coord:any) => (
              <div key={coord.id}>
                <div onClick={()=>openTracking(coord)}
                  className={`flex items-center gap-3 p-4 bg-white border rounded-[12px] cursor-pointer transition-colors ${activeCoord?.id===coord.id?"border-[#00488D] bg-[#F0F7FF]":"border-[#E2E8F0] hover:border-[#BFDBFE]"}`}>
                  <div className="w-10 h-10 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {coord.name.split(" ").map((w:string)=>w[0]).join("")}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{coord.name}</div>
                    <div className="text-xs text-[#64748B]">{coord.area||""}</div>
                  </div>
                  <span className={`text-lg transition-transform ${activeCoord?.id===coord.id?"rotate-90":""}`}>›</span>
                </div>

                {activeCoord?.id===coord.id && activity && (
                  <div className="border border-t-0 border-[#00488D] rounded-b-[12px] bg-white overflow-hidden">
                    {/* Stats */}
                    <div className="grid grid-cols-4 border-b border-[#E2E8F0]" style={{direction:"ltr"}}>
                      {([
                        {label:"משימות",count:activity.tasks?.length||0,key:"tasks"},
                        {label:"לידים",count:activity.leads?.length||0,key:"leads"},
                        {label:"אינטראקציות",count:activity.interactions?.length||0,key:"interactions"},
                        {label:"דיווחים",count:activity.reports?.length||0,key:"reports"},
                      ]).map(x=>(
                        <button key={x.key} onClick={()=>setActTab(x.key as any)}
                          className={`py-3 text-center transition-colors ${actTab===x.key?"bg-[#F0F7FF]":""}`} style={{direction:"rtl"}}>
                          <div className={`text-xl font-extrabold ${actTab===x.key?"text-[#00488D]":"text-[#0D2744]"}`}>{x.count}</div>
                          <div className="text-xs text-[#64748B]">{x.label}</div>
                        </button>
                      ))}
                    </div>
                    <div className="p-4 max-h-72 overflow-y-auto">
                      {actTab==="tasks" && <div className="space-y-2">
                        {(activity.tasks||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין משימות</div>}
                        {(activity.tasks||[]).map((t:any)=>(
                          <div key={t.id} className="flex items-start gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0">
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${t.status==="done"?"bg-[#166534]":t.status==="waiting"?"bg-[#B45309]":"bg-[#00488D]"}`}/>
                            <div className="flex-1"><div className="text-sm font-semibold">{t.title}</div>
                              <div className="text-xs text-[#64748B]">{TASK_STATUS[t.status]||t.status}{t.due_date&&` · ${fd(t.due_date.slice(0,10))}`}{t.event_name&&` · ${t.event_name}`}</div></div>
                            <div className="text-xs text-[#94A3B8]">{fd(t.created_at?.slice(0,10))}</div>
                          </div>
                        ))}
                      </div>}
                      {actTab==="leads" && <div className="space-y-2">
                        {(activity.leads||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין לידים</div>}
                        {(activity.leads||[]).map((l:any)=>(
                          <div key={l.id} className="flex items-center gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0">
                            <div className="w-7 h-7 rounded-full bg-[#F0F7FF] text-[#00488D] flex items-center justify-center text-xs font-bold">{l.name?.[0]}</div>
                            <div className="flex-1"><div className="text-sm font-semibold">{l.name}</div><div className="text-xs text-[#64748B]">{l.phone} · {l.source==="link"?"לינק":l.source==="event"?"אירוע":"ידני"}</div></div>
                            <div className="text-xs text-[#00488D] bg-[#F0F7FF] px-2 py-0.5 rounded-full">{LEAD_STATUS[l.status]||l.status}</div>
                            <div className="text-xs text-[#94A3B8]">{fd(l.created_at?.slice(0,10))}</div>
                          </div>
                        ))}
                      </div>}
                      {actTab==="interactions" && <div className="space-y-2">
                        {(activity.interactions||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין אינטראקציות</div>}
                        {(activity.interactions||[]).map((i:any)=>(
                          <div key={i.id} className="flex gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0">
                            <div className="w-7 h-7 rounded-full bg-[#F0F7FF] flex items-center justify-center text-sm">{INT_ICON[i.type]||"📝"}</div>
                            <div className="flex-1"><div className="text-xs font-semibold">{i.contact_name||"—"} · {INT_LABEL[i.type]||i.type}</div>
                              <div className="text-xs text-[#475569] bg-[#F9FAFB] rounded p-1.5 mt-0.5">{i.summary}</div></div>
                            <div className="text-xs text-[#94A3B8]">{fd(i.date)}</div>
                          </div>
                        ))}
                      </div>}
                      {actTab==="reports" && <div className="space-y-2">
                        {(activity.reports||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין דיווחים</div>}
                        {(activity.reports||[]).map((r:any)=>(
                          <div key={r.id} className="py-3 border-b border-[#F1F5F9] last:border-0">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-semibold">שבוע {fd(r.week_start)}</div>
                              <div className="text-xs text-[#00488D] font-bold">{r.leads_count} לידים</div>
                            </div>
                            {r.achievements && <div className="text-xs bg-[#F9FAFB] rounded p-2 mb-1"><span className="font-semibold">הישגים: </span>{r.achievements}</div>}
                            {r.challenges && <div className="text-xs bg-[#FFF9F0] rounded p-2"><span className="font-semibold">אתגרים: </span>{r.challenges}</div>}
                          </div>
                        ))}
                      </div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}