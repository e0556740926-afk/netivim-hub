"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const CAT_LABEL: Record<string, string> = { equipment: "רכש ציוד", marketing: "פרסום", catering: "כיבוד", venue: "מקום/שכ\"ד", other: "אחר" }
function money(n: number) { return `₪${Math.round(n).toLocaleString()}` }

export default function BudgetDashboard() {
  const [sources, setSources] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [fieldCategories, setFieldCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [sr, er, fr] = await Promise.all([fetch("/api/budget/funding-sources"), fetch("/api/expenses"), fetch("/api/admin/field-budget-categories")])
      setSources((await sr.json()).funding_sources || [])
      setExpenses((await er.json()).expenses || [])
      setFieldCategories((await fr.json()).categories || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function toggleFieldCategory(cat: string) {
    const method = fieldCategories.includes(cat) ? "DELETE" : "POST"
    await fetch("/api/admin/field-budget-categories", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: cat }) })
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

    // Burn rate: average monthly paid spend over the last 3 calendar months with data.
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
    const categoryBreakdown = Array.from(byCategory.entries()).map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt)

    return { totalBudget, totalUsed, periodPct, usedPct, burnRate, forecast, forecastPct, months, byMonth, categoryBreakdown }
  }, [sources, expenses])

  if (error) return <ErrorState retry={load} />
  if (loading) return <div className="p-6"><SkeletonCard /></div>

  const chartMonths = metrics.months.slice(-6)
  const maxMonthAmt = Math.max(1, ...chartMonths.map(m => metrics.byMonth.get(m) || 0))

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › <span style={{ color: T.navy, fontWeight: 600 }}>תקציב</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>דשבורד תקציב <span style={{ fontSize: 14, color: T.slate, fontWeight: 400 }}>· תקציב מוגדר {money(metrics.totalBudget)}</span></div>
        <Link href="/admin/budget/funding" style={{ fontSize: 13, fontWeight: 600, color: T.blue }}>מקורות מימון וכספים צבועים ←</Link>
      </div>
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/budget/procurement" style={{ fontSize: 13, color: T.slate }}>רכש וספקים ←</Link>
      </div>

      {!metrics.totalBudget ? (
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 40, textAlign: "center", color: T.slate }}>
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

          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>הוצאות לפי סעיף</div>
            <div style={{ fontSize: 12, color: T.slate, marginBottom: 14 }}>פילוח פשוט לפי קטגוריית הוצאה — אין עדיין תקציב מוגדר לכל סעיף בנפרד, ולכן אין כאן "חריגה" מחושבת (מפת חום/רשימת חריגות מהמוק המקורי דורשות יעד תקציבי לכל סעיף).</div>
            {metrics.categoryBreakdown.map(({ cat, amt }) => (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${T.bg}` }}>
                <span>{CAT_LABEL[cat] || cat}</span>
                <span className="ltr-numeric" style={{ fontWeight: 700 }}>{money(amt)}</span>
              </div>
            ))}
            {!metrics.categoryBreakdown.length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>אין עדיין הוצאות שולמו</div>}
          </div>
          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginTop: 16 }}>
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
    </div>
  )
}
