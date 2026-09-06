"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const CAT_LABEL: Record<string, string> = { equipment: "רכש ציוד", marketing: "פרסום", catering: "כיבוד", venue: "מקום/שכ\"ד", other: "אחר" }
function money(n: number) { return `₪${Math.round(n).toLocaleString()}` }

const EMPTY_EXPENSE = { event_id: "", description: "", vendor: "", amount: 0, date: new Date().toISOString().slice(0, 10), status: "pending", category: "other" }

export default function BudgetDashboard() {
  const [sources, setSources] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [fieldCategories, setFieldCategories] = useState<string[]>([])
  const [categoryTargets, setCategoryTargets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showExpForm, setShowExpForm] = useState(false)
  const [editExp, setEditExp] = useState<any>(null)
  const [expForm, setExpForm] = useState(EMPTY_EXPENSE)
  const [editingTarget, setEditingTarget] = useState<string | null>(null)
  const [targetInput, setTargetInput] = useState("")

  async function load() {
    setLoading(true); setError(false)
    try {
      const [sr, er, fr, ev, ct] = await Promise.all([
        fetch("/api/budget/funding-sources"), fetch("/api/expenses"), fetch("/api/admin/field-budget-categories"),
        fetch("/api/events"), fetch("/api/admin/budget-category-targets"),
      ])
      setSources((await sr.json()).funding_sources || [])
      setExpenses((await er.json()).expenses || [])
      setFieldCategories((await fr.json()).categories || [])
      setEvents((await ev.json()).events || [])
      setCategoryTargets((await ct.json()).targets || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function toggleFieldCategory(cat: string) {
    const method = fieldCategories.includes(cat) ? "DELETE" : "POST"
    await fetch("/api/admin/field-budget-categories", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: cat }) })
    await load()
  }
  async function saveTarget(cat: string) {
    await fetch("/api/admin/budget-category-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: cat, target_amount: Number(targetInput) || 0 }) })
    setEditingTarget(null)
    await load()
  }
  async function saveExpense() {
    const body = { ...expForm, amount: Number(expForm.amount) }
    if (editExp) await fetch("/api/expenses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id: editExp.id }) })
    else await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setShowExpForm(false); setEditExp(null); setExpForm(EMPTY_EXPENSE)
    await load()
  }
  async function deleteExpense(id: number) {
    if (!confirm("למחוק הוצאה זו?")) return
    await fetch("/api/expenses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    await load()
  }

  const metrics = useMemo(() => {
    const totalBudget = sources.reduce((s, f) => s + Number(f.amount || 0), 0)
    const paid = expenses.filter(e => e.status === "paid")
    const totalUsed = paid.reduce((s, e) => s + Number(e.amount || 0), 0)

    const starts = sources.map(f => f.period_start).filter(Boolean).map(d => new Date(d).getTime())
    const ends = sources.map(f => f.period_end).filter(Boolean).map(d => new Date(d).getTime())
    const periodStart = starts.length ? Math.min(...starts) : null
    const periodEnd = ends.length ? Math.max(...ends) : null
    const now = Date.now()
    const periodPct = periodStart && periodEnd && periodEnd > periodStart
      ? Math.min(100, Math.max(0, Math.round(((now - periodStart) / (periodEnd - periodStart)) * 100)))
      : null
    const usedPct = totalBudget > 0 ? Math.round((totalUsed / totalBudget) * 100) : null

    const byMonth = new Map<string, number>()
    for (const e of paid) {
      if (!e.date) continue
      const k = String(e.date).slice(0, 7)
      byMonth.set(k, (byMonth.get(k) || 0) + Number(e.amount))
    }
    const months = Array.from(byMonth.keys()).sort()
    const recentMonths = months.slice(-3)
    const burnRate = recentMonths.length ? recentMonths.reduce((s, k) => s + byMonth.get(k)!, 0) / recentMonths.length : 0

    const monthsRemaining = periodEnd ? Math.max(0, (periodEnd - now) / (1000 * 60 * 60 * 24 * 30)) : 0
    const forecast = totalUsed + burnRate * monthsRemaining
    const forecastPct = totalBudget > 0 ? Math.round((forecast / totalBudget) * 100) : null

    const byCategory = new Map<string, number>()
    for (const e of paid) byCategory.set(e.category, (byCategory.get(e.category) || 0) + Number(e.amount))
    const targetMap = new Map(categoryTargets.map((t: any) => [t.category, Number(t.target_amount)]))
    const categoryBreakdown = Object.keys(CAT_LABEL).map(cat => {
      const amt = byCategory.get(cat) || 0
      const target = targetMap.get(cat) || 0
      return { cat, amt, target, pct: target > 0 ? Math.round((amt / target) * 100) : null }
    }).filter(c => c.amt > 0 || c.target > 0).sort((a, b) => b.amt - a.amt)

    return { totalBudget, totalUsed, periodPct, usedPct, burnRate, forecast, forecastPct, months, byMonth, categoryBreakdown }
  }, [sources, expenses, categoryTargets])

  if (error) return <ErrorState retry={load} />
  if (loading) return <div className="p-6"><SkeletonCard /></div>

  const chartMonths = metrics.months.slice(-6)
  const maxMonthAmt = Math.max(1, ...chartMonths.map(m => metrics.byMonth.get(m) || 0))

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › <span style={{ color: T.navy, fontWeight: 600 }}>תקציב ורכש</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>תקציב ורכש <span style={{ fontSize: 14, color: T.slate, fontWeight: 400 }}>· תקציב מוגדר {money(metrics.totalBudget)}</span></div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/admin/budget/funding" style={{ fontSize: 13, fontWeight: 600, color: T.blue }}>מקורות מימון ←</Link>
          <Link href="/admin/budget/procurement" style={{ fontSize: 13, fontWeight: 600, color: T.blue }}>רכש וספקים ←</Link>
        </div>
      </div>

      {!metrics.totalBudget ? (
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 40, textAlign: "center", color: T.slate, marginBottom: 16 }}>
          עדיין אין מקורות מימון מוגדרים — <Link href="/admin/budget/funding" style={{ color: T.blue, fontWeight: 600 }}>הוסף מקור מימון</Link> כדי לראות את הדשבורד מתמלא בנתונים אמיתיים.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 8 }}>אחוז התקופה שחלפה</div>
              <div style={{ fontSize: 34, fontWeight: 700 }}>{metrics.periodPct !== null ? `${metrics.periodPct}%` : "—"}</div>
              <div style={{ height: 8, background: T.bg, borderRadius: 4, marginTop: 10 }}><div style={{ height: "100%", width: `${metrics.periodPct || 0}%`, background: T.navy, borderRadius: 4 }} /></div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 8 }}>אחוז שנוצל</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: T.ok }}>{metrics.usedPct !== null ? `${metrics.usedPct}%` : "—"}</div>
              <div style={{ height: 8, background: T.bg, borderRadius: 4, marginTop: 10 }}><div style={{ height: "100%", width: `${metrics.usedPct || 0}%`, background: T.ok, borderRadius: 4 }} /></div>
              {metrics.periodPct !== null && metrics.usedPct !== null && (
                <div style={{ fontSize: 12, color: metrics.usedPct <= metrics.periodPct ? T.ok : T.breach, marginTop: 6 }}>
                  {metrics.usedPct <= metrics.periodPct ? "מתחת לקצב התקופה — תקין" : "מעל קצב התקופה — לבדוק"}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 6 }}>קצב שריפה חודשי (ממוצע 3 חודשים אחרונים)</div>
              <div style={{ fontSize: 28, fontWeight: 700 }} className="ltr-numeric">{money(metrics.burnRate)}</div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 6 }}>תחזית סיום תקופה</div>
              <div style={{ fontSize: 28, fontWeight: 700 }} className="ltr-numeric">{money(metrics.forecast)}</div>
              {metrics.forecastPct !== null && (
                <div style={{ fontSize: 12, color: metrics.forecastPct <= 100 ? T.ok : T.breach, marginTop: 4 }}>
                  {metrics.forecastPct}% מהתקציב — {metrics.forecastPct <= 100 ? "צפי לעמידה בתקציב" : "צפי לחריגה"}
                </div>
              )}
            </div>
          </div>

          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>הוצאות בפועל — לפי חודש</div>
            {chartMonths.length ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140 }}>
                  {chartMonths.map(m => (
                    <div key={m} style={{ flex: 1, position: "relative", height: "100%" }}>
                      <div style={{ position: "absolute", bottom: 0, width: "60%", right: "20%", height: `${((metrics.byMonth.get(m) || 0) / maxMonthAmt) * 100}%`, background: T.blue, borderRadius: "2px 2px 0 0" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  {chartMonths.map(m => <div key={m} style={{ flex: 1, textAlign: "center", fontSize: 11, color: T.slate }}>{m.slice(5)}/{m.slice(2, 4)}</div>)}
                </div>
              </>
            ) : <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>אין עדיין הוצאות עם תאריך ששולמו</div>}
          </div>

          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>הוצאות לפי סעיף — מול יעד</div>
            <div style={{ fontSize: 12, color: T.slate, marginBottom: 14 }}>לחיצה על &quot;קבע יעד&quot; מגדירה תקציב לסעיף, ומאפשרת חריגה אמיתית — לא רק פילוח.</div>
            {Object.keys(CAT_LABEL).map(cat => {
              const row = metrics.categoryBreakdown.find(c => c.cat === cat)
              const amt = row?.amt || 0, target = row?.target || 0, pct = row?.pct
              return (
                <div key={cat} style={{ padding: "10px 0", borderTop: `1px solid ${T.bg}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{CAT_LABEL[cat]}</span>
                    <span className="ltr-numeric" style={{ fontWeight: 700, color: (pct ?? 0) > 100 ? T.breach : T.navy }}>
                      {money(amt)}{target > 0 && ` / ${money(target)}`}
                    </span>
                  </div>
                  {target > 0 && <div style={{ height: 6, background: T.bg, borderRadius: 3 }}><div style={{ height: "100%", width: `${Math.min(100, pct || 0)}%`, background: (pct || 0) > 100 ? T.breach : (pct || 0) > 80 ? T.warn : T.blue, borderRadius: 3 }} /></div>}
                  {editingTarget === cat ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input type="number" value={targetInput} onChange={e => setTargetInput(e.target.value)} placeholder="יעד ₪" style={{ width: 100, border: `1px solid ${T.border}`, borderRadius: 6, padding: 4 }} />
                      <button onClick={() => saveTarget(cat)} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>שמור</button>
                    </div>
                  ) : (
                    <span onClick={() => { setEditingTarget(cat); setTargetInput(String(target || "")) }} style={{ fontSize: 11, color: T.blue, cursor: "pointer" }}>{target > 0 ? "עריכת יעד" : "קבע יעד"}</span>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>הקצאת סעיפים לתקציב שטח</div>
            <div style={{ fontSize: 12, color: T.slate, marginBottom: 14 }}>מי שרואה &quot;תקציב שטח&quot; יראה וירשום הוצאות רק על הסעיפים המסומנים כאן.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.keys(CAT_LABEL).map(cat => (
                <span key={cat} onClick={() => toggleFieldCategory(cat)}
                  style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 14, background: fieldCategories.includes(cat) ? "#EAF3EE" : T.bg, color: fieldCategories.includes(cat) ? T.ok : T.slate }}>
                  {CAT_LABEL[cat]}{fieldCategories.includes(cat) ? " ✓" : ""}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>הוצאות — יומן מלא</div>
          <button onClick={() => { setEditExp(null); setExpForm(EMPTY_EXPENSE); setShowExpForm(true) }} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>+ הוצאה חדשה</button>
        </div>

        {showExpForm && (
          <div style={{ background: T.bg, borderRadius: 10, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            <input placeholder="תיאור" value={expForm.description} onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <input placeholder="ספק" value={expForm.vendor} onChange={e => setExpForm(f => ({ ...f, vendor: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <input type="number" placeholder="סכום" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: Number(e.target.value) }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <input type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <select value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}>
              {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={expForm.status} onChange={e => setExpForm(f => ({ ...f, status: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}>
              <option value="pending">ממתין</option><option value="paid">שולם</option><option value="cancelled">בוטל</option>
            </select>
            <select value={expForm.event_id} onChange={e => setExpForm(f => ({ ...f, event_id: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}>
              <option value="">ללא אירוע</option>
              {events.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={saveExpense} style={{ background: T.ok, color: "#fff", border: "none", borderRadius: 8, padding: 8, fontWeight: 600, cursor: "pointer", flex: 1 }}>שמור</button>
              <button onClick={() => setShowExpForm(false)} style={{ background: "#fff", color: T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, cursor: "pointer" }}>ביטול</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
            <thead><tr style={{ background: "#EDF2F8" }}>
              {["תיאור", "ספק", "סעיף", "סכום", "תאריך", "סטטוס", ""].map(h => <th key={h} style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: T.slate }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {expenses.map((ex: any) => (
                <tr key={ex.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{ex.description}</td>
                  <td style={{ padding: "8px 12px", color: T.slate }}>{ex.vendor}</td>
                  <td style={{ padding: "8px 12px" }}>{CAT_LABEL[ex.category] || ex.category}</td>
                  <td style={{ padding: "8px 12px" }} className="ltr-numeric">{money(ex.amount)}</td>
                  <td style={{ padding: "8px 12px", color: T.slate }}>{ex.date?.slice(0, 10)}</td>
                  <td style={{ padding: "8px 12px", color: ex.status === "paid" ? T.ok : ex.status === "cancelled" ? T.breach : T.warn }}>{ex.status}</td>
                  <td style={{ padding: "8px 12px", display: "flex", gap: 8 }}>
                    <span onClick={() => { setEditExp(ex); setExpForm({ event_id: ex.event_id || "", description: ex.description, vendor: ex.vendor || "", amount: ex.amount, date: ex.date?.slice(0, 10) || "", status: ex.status, category: ex.category || "other" }); setShowExpForm(true) }} style={{ cursor: "pointer", color: T.blue }}>✎</span>
                    <span onClick={() => deleteExpense(ex.id)} style={{ cursor: "pointer", color: T.breach }}>✕</span>
                  </td>
                </tr>
              ))}
              {!expenses.length && <tr><td colSpan={7} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין עדיין הוצאות רשומות</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
