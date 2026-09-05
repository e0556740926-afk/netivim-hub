"use client"
import { useEffect, useState } from "react"
import { Drawer, useDrawer } from "@/components/dashboards/Drawer"
import { exportToCsv } from "@/lib/csv-export"

const T = { navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const DIM_LABEL: Record<string, string> = { age_bucket: "גיל", city: "עיר", sector: "מגזר", source: "מקור", advisor_status: "סטטוס", category: "קטגוריית שיבוץ" }
const NL_TO_PIVOT_DIM: Record<string, string> = { age: "age_bucket", city: "city", sector: "sector", source: "source", case_status: "advisor_status", placement_category: "category" }
const EXAMPLE_QUESTIONS = [
  "כמה מגיל 17 עד 18 מבני ברק הלכו למכינה השנה?",
  "עלות לליד לפי רכז ברבעון הנוכחי",
  "כמה תיקים בסטטוס בתהליך ייעוץ מירושלים?",
  "כמה מהמגזר החסידי הופנו למסלול הסדר?",
]

function ExportButtons({ onCsv }: { onCsv: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: "relative" }}>
      <span onClick={() => setOpen(o => !o)} style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.blue }}>ייצוא ⭳</span>
      {open && (
        <div style={{ position: "absolute", left: 0, top: 22, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 4px 12px rgba(20,33,61,.12)", zIndex: 5, minWidth: 150 }}>
          <div onClick={() => { onCsv(); setOpen(false) }} style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>ייצוא ל-CSV</div>
          <div onClick={() => { window.print(); setOpen(false) }} style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer", borderTop: `1px solid ${T.bg}` }}>ייצוא ל-PDF (הדפסת מסך)</div>
        </div>
      )}
    </div>
  )
}

export default function StatisticsPage() {
  const [dims, setDims] = useState<string[]>(["age_bucket", "city"])
  const [filters, setFilters] = useState<Record<string, any> | null>(null)
  const [pivot, setPivot] = useState<any>(null)
  const [cost, setCost] = useState<any>(null)
  const [propensity, setPropensity] = useState<any>(null)
  const [anomalies, setAnomalies] = useState<any>(null)
  const [savedViews, setSavedViews] = useState<any[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [loading, setLoading] = useState(true)
  const drawer = useDrawer()

  // Natural-language query flow (spec §4)
  const [nlQuestion, setNlQuestion] = useState("")
  const [nlPlaceholder, setNlPlaceholder] = useState(0)
  const [nlState, setNlState] = useState<"idle" | "loading" | "confirm" | "clarify" | "result">("idle")
  const [nlQuery, setNlQuery] = useState<any>(null)
  const [nlLogId, setNlLogId] = useState<number | null>(null)
  const [nlError, setNlError] = useState("")
  const [nlEditing, setNlEditing] = useState<string | null>(null)
  const [nlRecent, setNlRecent] = useState<string[]>([])

  useEffect(() => {
    const i = setInterval(() => setNlPlaceholder(p => (p + 1) % EXAMPLE_QUESTIONS.length), 3500)
    return () => clearInterval(i)
  }, [])

  async function loadPivot() {
    try {
      const params = new URLSearchParams({ dims: dims.join(",") })
      if (filters) params.set("filters", JSON.stringify(filters))
      const r = await fetch(`/api/statistics/pivot?${params}`)
      if (r.status === 403) { setForbidden(true); return }
      if (!r.ok) { setPivot({ error: `שגיאת שרת (${r.status})` }); return }
      setPivot(await r.json())
    } catch {
      setPivot({ error: "שגיאת רשת" })
    }
  }
  useEffect(() => { loadPivot() }, [dims, filters])

  async function askNl() {
    if (!nlQuestion.trim()) return
    setNlState("loading"); setNlError("")
    try {
      const r = await fetch("/api/statistics/nl-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: nlQuestion }) })
      const d = await r.json()
      if (!r.ok) { setNlError(d.error || "שגיאה"); setNlState("idle"); return }
      setNlQuery(d.query); setNlLogId(d.log_id)
      setNlState(d.query.clarification_needed ? "clarify" : "confirm")
    } catch {
      setNlError("שגיאת רשת"); setNlState("idle")
    }
  }
  async function logNlAction(action: string, finalQuery?: any) {
    if (nlLogId) await fetch("/api/statistics/nl-query", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ log_id: nlLogId, action, final_query: finalQuery }) })
  }
  function runNlQuery() {
    const mappedDims = (nlQuery.dimensions || []).map((d: string) => NL_TO_PIVOT_DIM[d]).filter(Boolean)
    setDims(mappedDims.length ? mappedDims : ["age_bucket"])
    setFilters(Object.keys(nlQuery.filters || {}).length ? nlQuery.filters : null)
    logNlAction("approved", nlQuery)
    setNlRecent(r => [nlQuestion, ...r].slice(0, 3))
    setNlState("result")
  }
  function cancelNl() {
    logNlAction("rejected")
    setNlState("idle"); setNlQuery(null); setNlQuestion("")
  }
  function rewordNl() {
    logNlAction("rejected")
    setNlState("idle")
  }
  function continueWithPartial() {
    runNlQuery()
  }

  async function loadSavedViews() {
    const r = await fetch("/api/statistics/saved-views")
    if (r.ok) setSavedViews((await r.json()).saved || [])
  }
  useEffect(() => { loadSavedViews() }, [])

  useEffect(() => {
    (async () => {
      try {
        const [c, p, a] = await Promise.all([fetch("/api/statistics/cost"), fetch("/api/statistics/propensity"), fetch("/api/statistics/anomalies")])
        if (c.status === 403) { setForbidden(true); setLoading(false); return }
        if (!c.ok || !p.ok || !a.ok) { setLoadError(`שגיאת שרת (${c.status}/${p.status}/${a.status}) — נסה לרענן`); setLoading(false); return }
        setCost(await c.json()); setPropensity(await p.json()); setAnomalies(await a.json())
      } catch (e) {
        setLoadError("שגיאת רשת או תשובה לא תקינה מהשרת")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function toggleDim(d: string) {
    setDims(cur => cur.includes(d) ? cur.filter(x => x !== d) : cur.length < 4 ? [...cur, d] : cur)
  }
  function openPivotDrawer(row: any) {
    const values = dims.map((_, i) => row[`dim${i}`])
    const label = dims.map((d, i) => `${DIM_LABEL[d]}: ${row[`dim${i}`]}`).join(" · ")
    drawer.openDrawerRaw(`/api/statistics/pivot?dims=${dims.join(",")}&detail=${values.join("|||")}`, `${row.n} תיקים — ${label}`)
  }
  async function saveCurrentView() {
    const name = prompt("שם לתצוגה השמורה:")
    if (!name) return
    await fetch("/api/statistics/saved-views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, query: { dims, filters } }) })
    await loadSavedViews()
  }
  async function deleteSavedView(id: number) {
    await fetch("/api/statistics/saved-views", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    await loadSavedViews()
  }

  if (forbidden) return <div style={{ padding: 32, textAlign: "center", color: T.breach }}>אזור זה זמין למנכ&quot;ל ולמנהל ראשי בלבד.</div>
  if (loadError) return <div style={{ padding: 32, textAlign: "center", color: T.breach }}>{loadError}</div>
  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  const trend = cost?.monthly_trend || []
  const maxTrendLeads = Math.max(1, ...trend.map((m: any) => m.leads))
  const maxTrendSpend = Math.max(1, ...trend.map((m: any) => Number(m.spend)))

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › הנהלה › <span style={{ color: T.navy, fontWeight: 600 }}>סטטיסטיקות</span></div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>אזור סטטיסטיקות</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>מנכ&quot;ל ומנהל ראשי בלבד. אזור נפרד מהדשבורדים — לא שדרוג שלהם.</div>

      {/* NL QUERY BAR — spec §4 */}
      <div style={{ background: "#fff", border: `1px solid ${nlState === "idle" ? T.border : T.blue}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>🔍</span>
          <input
            value={nlQuestion} onChange={e => setNlQuestion(e.target.value)} onKeyDown={e => e.key === "Enter" && askNl()}
            placeholder={`שאל שאלה בשפה חופשית, למשל: "${EXAMPLE_QUESTIONS[nlPlaceholder]}"`}
            disabled={nlState === "loading" || nlState === "confirm" || nlState === "clarify"}
            style={{ flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", background: "transparent" }} />
          <button onClick={askNl} disabled={nlState !== "idle"} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, cursor: "pointer" }}>שאל</button>
        </div>
        {nlState === "loading" && <div style={{ fontSize: 12, color: T.blue, marginTop: 10 }}>מתרגם לנתונים...</div>}
        {nlError && <div style={{ fontSize: 12, color: T.breach, marginTop: 10 }}>{nlError}</div>}
        {nlState === "idle" && nlRecent.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: T.slate }}>לאחרונה שאלת:</span>
            {nlRecent.map((q, i) => <span key={i} onClick={() => { setNlQuestion(q); }} style={{ fontSize: 11, background: T.bg, color: T.slate, borderRadius: 12, padding: "4px 10px", cursor: "pointer" }}>{q}</span>)}
          </div>
        )}
      </div>

      {nlState === "confirm" && nlQuery && (
        <div style={{ background: T.blueBg, borderRight: `4px solid ${T.blue}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>הבנתי שאתה שואל</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.slate }}>ממדים:</span>
              <span>{(nlQuery.dimensions || []).map((d: string) => DIM_LABEL[NL_TO_PIVOT_DIM[d]] || d).join(", ") || "—"}</span>
            </div>
            {Object.entries(nlQuery.filters || {}).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                <span style={{ color: T.slate }}>{k}:</span>
                {nlEditing === k ? (
                  <input autoFocus defaultValue={JSON.stringify(v)} onBlur={e => { try { setNlQuery((q: any) => ({ ...q, filters: { ...q.filters, [k]: JSON.parse(e.target.value) } })) } catch {} setNlEditing(null) }}
                    style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: 4, fontSize: 12, width: 160 }} />
                ) : (
                  <span onClick={() => setNlEditing(k)} style={{ cursor: "pointer" }}>{JSON.stringify(v)} <span style={{ color: T.blue, fontSize: 11 }}>✏️ ערוך</span></span>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={runNlQuery} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, cursor: "pointer" }}>✓ הפעל</button>
            <button onClick={rewordNl} style={{ background: "transparent", color: T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>נסח מחדש</button>
            <button onClick={cancelNl} style={{ background: "transparent", color: T.slate, border: "none", cursor: "pointer" }}>✕ ביטול</button>
          </div>
        </div>
      )}

      {nlState === "clarify" && nlQuery && (
        <div style={{ background: "#FDF6E7", borderRight: `4px solid ${T.warn}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>לא הצלחתי להבין הכל</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>הבנתי: {(nlQuery.dimensions || []).map((d: string) => DIM_LABEL[NL_TO_PIVOT_DIM[d]] || d).join(", ") || Object.keys(nlQuery.filters || {}).join(", ") || "חלק מהשאלה"}</div>
          <div style={{ fontSize: 13, color: T.warn, marginBottom: 14 }}>לא ברור לי: {nlQuery.clarification_needed}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={continueWithPartial} style={{ background: T.warn, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, cursor: "pointer" }}>המשך עם מה שהובן</button>
            <button onClick={rewordNl} style={{ background: "transparent", color: T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>נסח מחדש</button>
          </div>
        </div>
      )}

      {nlState === "result" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.blueBg, borderRadius: 12, padding: "10px 16px", marginBottom: 12, fontSize: 13 }}>
          <span>שאלת: {nlQuestion} <span onClick={() => setNlState("confirm")} style={{ color: T.blue, cursor: "pointer" }}>[ערוך]</span></span>
          <span onClick={() => { setNlState("idle"); setNlQuestion(""); setFilters(null) }} style={{ cursor: "pointer", color: T.slate }}>✕ נקה</span>
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>חיתוך רב-ממדי (Pivot)</div>
          <div style={{ display: "flex", gap: 14 }}>
            <span onClick={saveCurrentView} style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.blue }}>⭐ שמור תצוגה</span>
            <ExportButtons onCsv={() => exportToCsv("pivot", (pivot?.rows || []).map((r: any) => {
              const o: Record<string, any> = {}; dims.forEach((d, i) => o[DIM_LABEL[d]] = r[`dim${i}`]); o["כמות"] = r.n; return o
            }))} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 14 }}>בחר עד 4 ממדים לחיתוך חופשי — לא גרף קבוע.</div>

        {savedViews.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: T.slate, alignSelf: "center" }}>תצוגות שמורות:</span>
            {savedViews.map(v => (
              <span key={v.id} style={{ fontSize: 11, background: T.blueBg, color: T.blue, borderRadius: 12, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <span onClick={() => { setDims(v.query.dims); setFilters(v.query.filters || null) }}>{v.name}</span>
                <span onClick={() => deleteSavedView(v.id)} style={{ color: T.breach }}>✕</span>
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {Object.keys(DIM_LABEL).map(d => (
            <span key={d} onClick={() => toggleDim(d)} style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 14, background: dims.includes(d) ? "#EDF2F8" : T.bg, color: dims.includes(d) ? T.blue : T.slate }}>
              {DIM_LABEL[d]}{dims.includes(d) ? " ✓" : ""}
            </span>
          ))}
        </div>
        {pivot?.error ? <div style={{ color: T.breach, fontSize: 13 }}>{pivot.error}</div> : (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#EDF2F8" }}>
              {dims.map(d => <th key={d} style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: T.slate }}>{DIM_LABEL[d]}</th>)}
              <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: T.slate }}>כמות</th>
            </tr></thead>
            <tbody>
              {(pivot?.rows || []).map((r: any, i: number) => (
                <tr key={i} onClick={() => openPivotDrawer(r)} style={{ borderTop: `1px solid ${T.bg}`, cursor: "pointer" }}>
                  {dims.map((_, di) => <td key={di} style={{ padding: "8px 12px" }}>{r[`dim${di}`]}</td>)}
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: T.blue, textDecoration: "underline" }}>{r.n}</td>
                </tr>
              ))}
              {!pivot?.rows?.length && <tr><td colSpan={dims.length + 1} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין נתונים</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>עלות לתוצאה — לפי מקור (קמפיין)</div>
            <ExportButtons onCsv={() => exportToCsv("cost-by-campaign", cost?.by_campaign || [])} />
          </div>
          <div style={{ fontSize: 11, color: T.slate, marginBottom: 12 }}>{cost?.campaign_note}</div>
          {cost?.by_campaign.map((c: any) => (
            <div key={c.campaign} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${T.bg}` }}>
              <span>{c.campaign}</span>
              <span>לליד: {c.cost_per_lead_approx ?? "—"} · לשיבוץ: {c.cost_per_placement_approx ?? "—"}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>עלות לתוצאה — לפי רכז</div>
            <ExportButtons onCsv={() => exportToCsv("cost-by-coordinator", cost?.by_coordinator || [])} />
          </div>
          {cost?.by_coordinator.map((c: any) => (
            <div key={c.coordinator_name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${T.bg}` }}>
              <span>{c.coordinator_name}</span>
              <span>לליד: {c.cost_per_lead ?? "—"} · לשיבוץ: {c.cost_per_placement ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>מגמת לידים והוצאה — 12 חודשים אחרונים</div>
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.slate, marginBottom: 12 }}>
          <span><span style={{ display: "inline-block", width: 10, height: 2, background: T.blue, marginLeft: 4 }} />לידים</span>
          <span><span style={{ display: "inline-block", width: 10, height: 2, background: T.warn, marginLeft: 4 }} />הוצאה (₪)</span>
        </div>
        {trend.length ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {trend.map((m: any) => (
              <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 2 }} title={`${m.month}: ${m.leads} לידים, ₪${Math.round(Number(m.spend))}`}>
                <div style={{ height: `${(m.leads / maxTrendLeads) * 60}%`, background: T.blue, borderRadius: "2px 2px 0 0" }} />
                <div style={{ height: `${(Number(m.spend) / maxTrendSpend) * 30}%`, background: T.warn, borderRadius: "2px 2px 0 0" }} />
                <div style={{ fontSize: 9, color: T.slate, textAlign: "center" }}>{m.month.slice(5)}</div>
              </div>
            ))}
          </div>
        ) : <div style={{ color: T.slate, fontSize: 13 }}>אין עדיין נתוני מגמה</div>}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>דירוג נטייה — שילובים עם שיעור המרה גבוה</div>
          <ExportButtons onCsv={() => exportToCsv("propensity", propensity?.combinations || [])} />
        </div>
        <div style={{ fontSize: 11, color: T.slate, marginBottom: 14 }}>{propensity?.methodology}</div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#EDF2F8" }}>
            {["גיל", "עיר", "מגזר", "מקור", "סה\"כ", "שובצו", "שיעור המרה"].map(h => <th key={h} style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: T.slate }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {propensity?.combinations.slice(0, 15).map((c: any, i: number) => (
              <tr key={i} style={{ borderTop: `1px solid ${T.bg}`, opacity: c.reliable ? 1 : 0.5 }}>
                <td style={{ padding: "8px 12px" }}>{c.age_bucket}</td>
                <td style={{ padding: "8px 12px" }}>{c.city}</td>
                <td style={{ padding: "8px 12px" }}>{c.sector}</td>
                <td style={{ padding: "8px 12px" }}>{c.source}</td>
                <td style={{ padding: "8px 12px" }}>{c.total}</td>
                <td style={{ padding: "8px 12px" }}>{c.placed}</td>
                <td style={{ padding: "8px 12px", fontWeight: 700, color: T.ok }}>{c.placement_rate}%{!c.reliable && " (מדגם קטן)"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>זיהוי חריגות אוטומטי</div>
          <ExportButtons onCsv={() => exportToCsv("anomalies", anomalies?.anomalies || [])} />
        </div>
        <div style={{ fontSize: 11, color: T.slate, marginBottom: 14 }}>{anomalies?.methodology}</div>
        {anomalies?.anomalies.length ? anomalies.anomalies.map((a: any, i: number) => (
          <div key={i} style={{ background: "#FDF6E7", border: "1px solid #B7791F33", borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 13 }}>
            <strong>{a.coordinator_name}</strong> — {a.month}: שיעור המרה {a.current_rate}% מול ממוצע היסטורי {a.historical_avg}% ({a.deviation_pct > 0 ? "+" : ""}{a.deviation_pct}%)
          </div>
        )) : <div style={{ color: T.slate, fontSize: 13 }}>אין חריגות משמעותיות כרגע (או שאין מספיק היסטוריה עדיין — {anomalies?.insufficient_data_for?.join(", ") || "אין"})</div>}
      </div>

      <Drawer open={drawer.open} title={drawer.title} rows={drawer.rows} loading={drawer.loading} onClose={drawer.close} />
    </div>
  )
}
