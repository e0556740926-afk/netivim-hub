"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
function money(n: number) { return `₪${Math.round(n).toLocaleString()}` }
function fdt(d?: string | null) { return d ? new Date(d).toLocaleDateString("he-IL") : "ללא הגבלה" }

// Real status logic (not decorative): flags a source as urgent when its
// period ends soon (<=30 days) and a large share (>=50%) is still unused —
// matches the mock's "12 days left, 82% unused" example exactly in spirit.
function computeStatus(f: any) {
  const used = Number(f.used_amount || 0), total = Number(f.amount || 0)
  const pctUsed = total > 0 ? used / total : 0
  const daysLeft = f.period_end ? (new Date(f.period_end).getTime() - Date.now()) / 864e5 : null
  if (daysLeft !== null && daysLeft <= 30 && pctUsed < 0.5) return { label: "דורש טיפול דחוף", urgent: true, daysLeft, pctUsed }
  if (daysLeft !== null && daysLeft <= 60) return { label: "מתקרב לסוף תקופה", urgent: false, warn: true, daysLeft, pctUsed }
  return { label: "תקין", urgent: false, warn: false, daysLeft, pctUsed }
}

export default function FundingSources() {
  const [sources, setSources] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ funder: "", purpose: "", amount: "", period_start: "", period_end: "" })

  async function load() {
    setLoading(true); setError(false)
    try {
      const r = await fetch("/api/budget/funding-sources")
      setSources((await r.json()).funding_sources || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function submit() {
    if (!form.funder || !form.amount) return
    await fetch("/api/budget/funding-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) })
    setForm({ funder: "", purpose: "", amount: "", period_start: "", period_end: "" }); setShowForm(false)
    await load()
  }

  if (error) return <ErrorState retry={load} />

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › <Link href="/admin/budget" style={{ color: T.slate }}>תקציב</Link> › <span style={{ color: T.navy, fontWeight: 600 }}>מקורות מימון וכספים צבועים</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>מקורות מימון וכספים צבועים</div>
          <div style={{ fontSize: 13, color: T.slate, marginBottom: 20 }}>עוקב אחרי כל מקור מימון בנפרד, כולל תקופת מימוש וניצול.</div>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ מקור מימון חדש</button>
      </div>

      {showForm && (
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          <input placeholder="מממן" value={form.funder} onChange={e => setForm(f => ({ ...f, funder: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
          <input placeholder="מטרה" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
          <input placeholder="סכום" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
          <input placeholder="תוקף עד" type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
          <button onClick={submit} style={{ gridColumn: "1 / -1", background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 8, fontWeight: 600, cursor: "pointer" }}>שמור</button>
        </div>
      )}

      {loading ? <SkeletonCard /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          {sources.map(f => {
            const st = computeStatus(f)
            const flagged = st.urgent
            const barColor = flagged ? T.breach : st.warn ? T.warn : T.blue
            const statusBg = flagged ? T.breach : st.warn ? "#FDF6E7" : "#EAF3EE"
            const statusFg = flagged ? "#fff" : st.warn ? T.warn : T.ok
            return (
              <div key={f.id} style={{ background: flagged ? "#FDECEA" : "#fff", border: flagged ? `2px solid ${T.breach}` : `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: flagged ? T.breach : T.navy }}>{f.funder}</div>
                  <span style={{ fontSize: 11, fontWeight: flagged ? 700 : 600, padding: "3px 9px", borderRadius: 6, background: statusBg, color: statusFg }}>{flagged ? `⚠ ${st.label}` : st.label}</span>
                </div>
                <div style={{ fontSize: 13, color: flagged ? T.breach : T.slate, marginBottom: 10 }}>מטרה: {f.purpose || "ללא ייעוד ספציפי"}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: flagged ? T.breach : T.slate, marginBottom: 4 }}><span>ניצול</span><span className="ltr-numeric">{money(f.used_amount)} / {money(f.amount)}</span></div>
                <div style={{ height: 8, background: flagged ? "#fff" : T.bg, borderRadius: 4 }}><div style={{ height: "100%", width: `${f.amount ? Math.min(100, (f.used_amount / f.amount) * 100) : 0}%`, background: barColor, borderRadius: 4 }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 10 }}><span style={{ color: flagged ? T.breach : T.slate }}>תקופת מימוש</span><span style={{ fontWeight: 600, color: flagged ? T.breach : T.navy }}>{fdt(f.period_end)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}><span style={{ color: flagged ? T.breach : T.slate }}>נותר{flagged ? " וטרם מומש" : ""}</span><span className="ltr-numeric" style={{ fontWeight: 700, color: barColor }}>{money(f.amount - f.used_amount)}</span></div>
                {flagged && st.daysLeft !== null && (
                  <div style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", marginTop: 12, fontSize: 12, color: T.breach, fontWeight: 600 }}>
                    ⚠ נותרו {Math.max(0, Math.round(st.daysLeft))} ימים לסוף תקופת המימוש ו-{Math.round(st.pctUsed * 100)}% מהסכום נוצל. יש לפעול מיידית או לתאם הארכה עם התורם.
                  </div>
                )}
              </div>
            )
          })}
          {!sources.length && <div style={{ gridColumn: "1 / -1", textAlign: "center", color: T.slate, padding: 40 }}>אין עדיין מקורות מימון</div>}
        </div>
      )}
    </div>
  )
}
