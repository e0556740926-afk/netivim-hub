"use client"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
const MEDAL = ["🥇","🥈","🥉"]

function fd(d: string | null) {
  if (!d) return "—"
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`
}

function MonthlyReportContent() {
  const params = useSearchParams()
  const month = params.get("month") // YYYY-MM
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = `/api/reports/monthly-summary${month ? `?month=${month}` : ""}`
    fetch(url).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [month])

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", fontFamily:"sans-serif" }}>
      <div>טוען דו"ח...</div>
    </div>
  )
  if (!data || data.error) return <div style={{ padding:40, fontFamily:"sans-serif" }}>שגיאה בטעינת הדו"ח</div>

  const { month: m, coordinators, events, totalExpenses, totals } = data
  const maxScore = Math.max(...coordinators.map((c: any) => c.score), 1)

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm 15mm; }
        @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        * { box-sizing: border-box; }
        body { margin:0; padding:0; background:#fff; font-family:"Segoe UI",Arial,sans-serif; direction:rtl; color:#1E293B; }
        table { border-collapse: collapse; width:100%; }
        th { background:#0D2744; color:#fff; padding:8px 10px; font-size:11px; text-align:right; }
        td { padding:7px 10px; font-size:11px; border-bottom:1px solid #F1F5F9; }
        tr:nth-child(even) td { background:#F8FAFC; }
        .section { margin-bottom:20px; border:1px solid #E2E8F0; border-radius:10px; overflow:hidden; }
        .section-title { background:#F0F4F8; padding:10px 14px; font-size:13px; font-weight:700; color:#0D2744; border-bottom:1px solid #E2E8F0; }
        .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
        .kpi { background:#F0F7FF; border:1px solid #BFDBFE; border-radius:10px; padding:12px; text-align:center; }
        .kpi-num { font-size:26px; font-weight:900; color:#0D2744; line-height:1; }
        .kpi-label { font-size:10px; color:#64748B; margin-top:3px; }
      `}</style>

      <div className="no-print" style={{ position:"fixed", top:16, left:16, zIndex:99, display:"flex", gap:8 }}>
        <button onClick={() => window.print()}
          style={{ padding:"10px 20px", background:"#0D2744", color:"#fff", border:"none", borderRadius:9, fontWeight:700, cursor:"pointer", fontSize:13 }}>
          🖨 הדפס / שמור PDF
        </button>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"28px 24px" }}>

        <div style={{ marginBottom:24, paddingBottom:18, borderBottom:"3px solid #0D2744" }}>
          <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>ארגון נתיבים</div>
          <div style={{ fontSize:24, fontWeight:900, color:"#0D2744" }}>דו"ח חודשי ארגוני</div>
          <div style={{ fontSize:14, color:"#64748B", marginTop:4 }}>{MONTHS[m.month-1]} {m.year}</div>
        </div>

        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-num" style={{color:"#00488D"}}>{totals.leads}</div><div className="kpi-label">לידים החודש</div></div>
          <div className="kpi"><div className="kpi-num" style={{color:"#166534"}}>{totals.tasksDone}</div><div className="kpi-label">משימות שבוצעו</div></div>
          <div className="kpi"><div className="kpi-num" style={{color:"#5B21B6"}}>{totals.interactions}</div><div className="kpi-label">אינטראקציות</div></div>
          <div className="kpi"><div className="kpi-num" style={{color:"#B45309"}}>₪{Math.round(totalExpenses).toLocaleString()}</div><div className="kpi-label">הוצאות</div></div>
        </div>

        {/* Coordinator comparison */}
        <div className="section">
          <div className="section-title">🏆 השוואת רכזים</div>
          <div style={{ overflowX: "auto" }}><table>
            <thead><tr><th></th><th>רכז</th><th>אזור</th><th>לידים</th><th>יעד</th><th>משימות</th><th>אינטראקציות</th><th>דיווחים</th><th>ציון</th></tr></thead>
            <tbody>
              {coordinators.map((c: any, i: number) => (
                <tr key={c.id}>
                  <td style={{textAlign:"center",fontWeight:700}}>{MEDAL[i] || i+1}</td>
                  <td style={{fontWeight:600}}>{c.name}</td>
                  <td>{c.area || "—"}</td>
                  <td>{c.leads}</td>
                  <td>{c.target || "—"}</td>
                  <td>{c.tasksDone}{c.tasksLate > 0 && <span style={{color:"#960010"}}> ({c.tasksLate} באיחור)</span>}</td>
                  <td>{c.interactions}</td>
                  <td>{c.reportsSubmitted}/4</td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:50,height:6,background:"#F0F4F8",borderRadius:3,overflow:"hidden"}}>
                        <div style={{width:`${Math.round(c.score/maxScore*100)}%`,height:"100%",background:"#00488D"}}/>
                      </div>
                      <span style={{fontWeight:700}}>{c.score}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        {/* Events */}
        {events.length > 0 && <div className="section">
          <div className="section-title">📅 אירועים החודש ({events.length})</div>
          <div style={{ overflowX: "auto" }}><table>
            <thead><tr><th>שם</th><th>תאריך</th><th>סטטוס</th><th>תקציב</th><th>משתתפים</th><th>לידים</th></tr></thead>
            <tbody>
              {events.map((e: any) => (
                <tr key={e.id}>
                  <td style={{fontWeight:600}}>{e.name}</td>
                  <td>{fd(e.date)}</td>
                  <td>{e.status}</td>
                  <td>₪{(+e.budget_planned||0).toLocaleString()}</td>
                  <td>{e.actual_attendees || "—"}</td>
                  <td style={{color:"#00488D",fontWeight:700}}>{e.leads_collected || 0}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>}

        <div style={{marginTop:20,textAlign:"center",fontSize:10,color:"#94A3B8",borderTop:"1px solid #E2E8F0",paddingTop:12}}>
          נתיבים — מערכת ניהול שטח · דו"ח חודשי · {MONTHS[m.month-1]} {m.year}
        </div>
      </div>
    </>
  )
}

export default function MonthlyReportPage() {
  return (
    <Suspense fallback={<div style={{padding:40,fontFamily:"sans-serif",direction:"rtl"}}>טוען...</div>}>
      <MonthlyReportContent/>
    </Suspense>
  )
}
