"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

const STATUS_LABEL: Record<string,string> = {
  new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי"
}
const INT_ICON: Record<string,string> = { call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝" }
const INT_LABEL: Record<string,string> = { call:"שיחה", meeting:"פגישה", whatsapp:"וואטסאפ", email:"דואל", other:"אחר" }
const TASK_TYPE: Record<string,string> = { call:"שיחה", meeting:"פגישה", materials:"חומרים", backoffice:"בק-אופיס" }
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]

function fd(d: string|null) {
  if (!d) return "—"
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
}

function ScoreMeter({ score }: { score: number }) {
  const color = score >= 80 ? "#166534" : score >= 50 ? "#B45309" : "#960010"
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
      <div style={{ width:80, height:80, borderRadius:"50%", border:`6px solid ${color}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:22, fontWeight:900, color }}>
        {score}
      </div>
      <div style={{ fontSize:11, color:"#64748B" }}>
        <div>מתוך 100</div>
        <div style={{ color, fontWeight:700 }}>
          {score >= 80 ? "מצוין 🌟" : score >= 60 ? "טוב 👍" : score >= 40 ? "בסיסי" : "טעון שיפור"}
        </div>
      </div>
    </div>
  )
}

function WeeklyReportContent() {
  const params = useSearchParams()
  const coordId = params.get("coordinator_id")
  const week = params.get("week")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!coordId) return
    const url = `/api/reports/weekly-summary?coordinator_id=${coordId}${week ? `&week=${week}` : ""}`
    fetch(url).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [coordId, week])

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", fontFamily:"sans-serif" }}>
      <div>טוען דו"ח...</div>
    </div>
  )
  if (!data?.coordinator) return (
    <div style={{ padding:40, fontFamily:"sans-serif" }}>שגיאה — לא נמצא רכז</div>
  )

  const { coordinator: c, week: w, leads, interactions, tasks, report, events, contacts, score } = data

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm 15mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page-break { page-break-before: always; }
        }
        * { box-sizing: border-box; }
        body { margin:0; padding:0; background:#fff; font-family: "Segoe UI", Arial, sans-serif; direction:rtl; color:#1E293B; }
        table { border-collapse: collapse; width:100%; }
        th { background:#0D2744; color:#fff; padding:7px 10px; font-size:11px; text-align:right; }
        td { padding:6px 10px; font-size:11px; border-bottom:1px solid #F1F5F9; }
        tr:last-child td { border-bottom:none; }
        tr:nth-child(even) td { background:#F8FAFC; }
        .section { margin-bottom:20px; border:1px solid #E2E8F0; border-radius:10px; overflow:hidden; }
        .section-title { background:#F0F4F8; padding:10px 14px; font-size:13px; font-weight:700; color:#0D2744; border-bottom:1px solid #E2E8F0; }
        .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:700; }
        .kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:20px; }
        .kpi { background:#F0F7FF; border:1px solid #BFDBFE; border-radius:10px; padding:12px; text-align:center; }
        .kpi-num { font-size:28px; font-weight:900; color:#0D2744; line-height:1; }
        .kpi-label { font-size:10px; color:#64748B; margin-top:3px; }
        .empty { padding:16px; text-align:center; color:#94A3B8; font-size:12px; }
      `}</style>

      {/* Print button */}
      <div className="no-print" style={{ position:"fixed", top:16, left:16, zIndex:99, display:"flex", gap:8 }}>
        <button onClick={() => window.print()}
          style={{ padding:"10px 20px", background:"#0D2744", color:"#fff", border:"none", borderRadius:9, fontWeight:700, cursor:"pointer", fontSize:13 }}>
          🖨 הדפס / שמור PDF
        </button>
        <button onClick={() => window.close()}
          style={{ padding:"10px 14px", background:"#F0F4F8", border:"1px solid #E2E8F0", borderRadius:9, cursor:"pointer", fontSize:13 }}>
          סגור
        </button>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"28px 24px" }}>

        {/* HEADER */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, paddingBottom:18, borderBottom:"3px solid #0D2744" }}>
          <div>
            <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>ארגון נתיבים</div>
            <div style={{ fontSize:24, fontWeight:900, color:"#0D2744" }}>דו"ח שבועי — {c.name}</div>
            <div style={{ fontSize:13, color:"#64748B", marginTop:4 }}>
              {fd(w.start)} – {fd(w.end)}
              {c.area && <span> &nbsp;·&nbsp; אזור: {c.area}</span>}
            </div>
            <div style={{ fontSize:11, color:"#94A3B8", marginTop:2 }}>הופק: {fd(new Date().toISOString().slice(0,10))}</div>
          </div>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontSize:11, color:"#64748B", marginBottom:8 }}>ציון שבועי</div>
            <ScoreMeter score={score.total}/>
          </div>
        </div>

        {/* KPIs */}
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-num" style={{color:"#00488D"}}>{leads.length}</div><div className="kpi-label">לידים חדשים</div></div>
          <div className="kpi"><div className="kpi-num" style={{color:"#5B21B6"}}>{interactions.length}</div><div className="kpi-label">אינטראקציות</div></div>
          <div className="kpi"><div className="kpi-num" style={{color:"#166534"}}>{tasks.done.length}</div><div className="kpi-label">משימות שבוצעו</div></div>
          <div className="kpi"><div className="kpi-num" style={{color:tasks.late.length>0?"#960010":"#166534"}}>{tasks.late.length}</div><div className="kpi-label">משימות באיחור</div></div>
          <div className="kpi"><div className="kpi-num" style={{color:"#B45309"}}>{events.length}</div><div className="kpi-label">אירועים</div></div>
        </div>

        {/* SCORE BREAKDOWN */}
        <div className="section" style={{marginBottom:20}}>
          <div className="section-title">📊 פירוט ציון שבועי</div>
          <div style={{padding:"12px 14px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[["לידים",score.leads,30],["אינטראקציות",score.interactions,30],["משימות",score.tasks,20],["דיווח",score.report,20]].map(([l,v,m])=>(
              <div key={l as string} style={{textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0D2744"}}>{v}/{m}</div>
                <div style={{fontSize:10,color:"#64748B"}}>{l}</div>
                <div style={{height:4,background:"#E2E8F0",borderRadius:2,marginTop:4,overflow:"hidden"}}>
                  <div style={{width:`${Math.round(+v/+m*100)}%`,height:"100%",background:"#00488D",borderRadius:2}}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* LEADS */}
        <div className="section">
          <div className="section-title">⭐ לידים חדשים השבוע ({leads.length})</div>
          {leads.length === 0
            ? <div className="empty">אין לידים חדשים השבוע</div>
            : <table>
                <thead><tr><th>שם</th><th>טלפון</th><th>גיל</th><th>ציון</th><th>מקור</th><th>סטטוס</th><th>הערות</th></tr></thead>
                <tbody>
                  {leads.map((l:any) => (
                    <tr key={l.id}>
                      <td style={{fontWeight:600}}>{l.name}</td>
                      <td>{l.phone}</td>
                      <td>{l.age||"—"}</td>
                      <td style={{fontWeight:700,color:l.score>=8?"#166534":l.score>=5?"#B45309":"#94A3B8"}}>{l.score??"—"}</td>
                      <td>{l.source==="link"?"לינק אישי":l.source==="event"?"אירוע":"ידני"}</td>
                      <td><span className="badge" style={{background:l.status==="contacted"?"#DCFCE7":l.status==="advanced"?"#EDE9FE":"#DBEAFE",color:l.status==="contacted"?"#166534":l.status==="advanced"?"#5B21B6":"#1E40AF"}}>{STATUS_LABEL[l.status]||l.status}</span></td>
                      <td style={{color:"#64748B",maxWidth:180}}>{l.notes||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>

        {/* INTERACTIONS */}
        <div className="section">
          <div className="section-title">🤝 אינטראקציות עם שותפים ({interactions.length})</div>
          {interactions.length === 0
            ? <div className="empty">אין אינטראקציות השבוע</div>
            : <table>
                <thead><tr><th>תאריך</th><th>איש קשר</th><th>ארגון</th><th>סוג</th><th>סיכום</th><th>צעד הבא</th></tr></thead>
                <tbody>
                  {interactions.map((i:any) => (
                    <tr key={i.id}>
                      <td style={{whiteSpace:"nowrap"}}>{fd(i.date)}</td>
                      <td style={{fontWeight:600}}>{i.contact_name||"—"}</td>
                      <td>{i.contact_org||"—"}</td>
                      <td>{INT_ICON[i.type]} {INT_LABEL[i.type]||i.type}</td>
                      <td style={{color:"#374151",maxWidth:200}}>{i.summary}</td>
                      <td style={{color:"#00488D",maxWidth:150}}>{i.next_step||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>

        {/* TASKS */}
        <div className="section">
          <div className="section-title">✅ משימות</div>
          <div style={{padding:"8px 14px 4px",display:"flex",gap:16}}>
            <span style={{fontSize:11}}><span style={{fontWeight:700,color:"#166534"}}>✓ בוצעו: {tasks.done.length}</span></span>
            <span style={{fontSize:11}}><span style={{fontWeight:700,color:"#1E40AF"}}>⏳ בתהליך: {tasks.inProgress.length}</span></span>
            <span style={{fontSize:11}}><span style={{fontWeight:700,color:"#960010"}}>🔴 באיחור: {tasks.late.length}</span></span>
            <span style={{fontSize:11}}><span style={{fontWeight:700,color:"#64748B"}}>📋 לביצוע: {tasks.todo.length}</span></span>
          </div>
          {tasks.all.length === 0
            ? <div className="empty">אין משימות</div>
            : <table>
                <thead><tr><th>כותרת</th><th>סוג</th><th>תאריך יעד</th><th>סטטוס</th><th>פרטים</th></tr></thead>
                <tbody>
                  {[...tasks.late, ...tasks.inProgress, ...tasks.done, ...tasks.todo].map((t:any) => {
                    const isLate = tasks.late.find((x:any)=>x.id===t.id)
                    const statusColor = t.status==="done"?"#166534":isLate?"#960010":t.status==="inprogress"?"#1E40AF":"#64748B"
                    const statusBg = t.status==="done"?"#DCFCE7":isLate?"#FEE2E2":t.status==="inprogress"?"#DBEAFE":"#F3F4F6"
                    const statusLabel = t.status==="done"?"בוצע":isLate?"באיחור":t.status==="inprogress"?"בתהליך":t.status==="waiting"?"ממתין":"לביצוע"
                    return (
                      <tr key={t.id}>
                        <td style={{fontWeight:600}}>{t.title}</td>
                        <td>{TASK_TYPE[t.type]||t.type}</td>
                        <td style={{whiteSpace:"nowrap"}}>{t.due_date?fd(t.due_date.toISOString?.()?.slice(0,10)||t.due_date):"—"}</td>
                        <td><span className="badge" style={{background:statusBg,color:statusColor}}>{statusLabel}</span></td>
                        <td style={{color:"#64748B",maxWidth:180}}>{t.details||"—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
          }
        </div>

        {/* EVENTS */}
        {events.length > 0 && <div className="section">
          <div className="section-title">📅 אירועים השבוע ({events.length})</div>
          <table>
            <thead><tr><th>שם</th><th>תאריך</th><th>מיקום</th><th>סטטוס</th><th>משתתפים</th><th>לידים</th></tr></thead>
            <tbody>
              {events.map((e:any) => (
                <tr key={e.id}>
                  <td style={{fontWeight:600}}>{e.name}</td>
                  <td>{fd(e.date)}</td>
                  <td>{e.location||"—"}</td>
                  <td>{e.status}</td>
                  <td>{e.actual_attendees||e.target_attendees||"—"}</td>
                  <td style={{color:"#00488D",fontWeight:700}}>{e.leads_collected||0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}

        {/* CONTACTS TOUCHED */}
        {contacts.length > 0 && <div className="section">
          <div className="section-title">👥 אנשי קשר שטופלו ({contacts.length})</div>
          <table>
            <thead><tr><th>שם</th><th>ארגון</th><th>תפקיד</th><th>סטטוס</th><th>קשר אחרון</th></tr></thead>
            <tbody>
              {contacts.map((c:any) => (
                <tr key={c.id}>
                  <td style={{fontWeight:600}}>{c.name}</td>
                  <td>{c.org||"—"}</td>
                  <td>{c.role||"—"}</td>
                  <td>{c.status}</td>
                  <td>{fd(c.last_interaction_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}

        {/* WEEKLY REPORT */}
        <div className="section">
          <div className="section-title">📝 דיווח שבועי {report ? "✓" : "— לא הוגש"}</div>
          {!report
            ? <div className="empty" style={{color:"#960010"}}>הרכז לא הגיש דיווח שבועי לתקופה זו</div>
            : <div style={{padding:"14px"}}>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#0D2744",marginBottom:4}}>הישגים:</div>
                  <div style={{fontSize:12,color:"#374151",background:"#F8FAFC",padding:"8px 12px",borderRadius:8,border:"1px solid #E2E8F0"}}>{report.achievements||"—"}</div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#0D2744",marginBottom:4}}>אתגרים:</div>
                  <div style={{fontSize:12,color:"#374151",background:"#F8FAFC",padding:"8px 12px",borderRadius:8,border:"1px solid #E2E8F0"}}>{report.challenges||"—"}</div>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#0D2744",marginBottom:4}}>תכנון שבוע הבא:</div>
                  <div style={{fontSize:12,color:"#374151",background:"#F8FAFC",padding:"8px 12px",borderRadius:8,border:"1px solid #E2E8F0"}}>{report.next_week_plan||"—"}</div>
                </div>
              </div>
          }
        </div>

        {/* MANAGER NOTES */}
        <div className="section" style={{marginBottom:0}}>
          <div className="section-title">✍️ הערות מנהל (למילוי ידני)</div>
          <div style={{padding:"14px"}}>
            {[1,2,3].map(i => (
              <div key={i} style={{borderBottom:"1px solid #CBD5E1",marginBottom:20,paddingBottom:4}}/>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{marginTop:20,textAlign:"center",fontSize:10,color:"#94A3B8",borderTop:"1px solid #E2E8F0",paddingTop:12}}>
          נתיבים — מערכת ניהול שטח &nbsp;·&nbsp; דו"ח שבועי של {c.name} &nbsp;·&nbsp; {fd(w.start)} – {fd(w.end)}
        </div>

      </div>
    </>
  )
}

export default function WeeklyReportPage() {
  return (
    <Suspense fallback={<div style={{padding:40,fontFamily:"sans-serif",direction:"rtl"}}>טוען...</div>}>
      <WeeklyReportContent/>
    </Suspense>
  )
}
