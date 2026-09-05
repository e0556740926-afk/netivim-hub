"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
function money(n: number) { return `₪${Math.round(n).toLocaleString()}` }

export default function CEODashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<number | null>(null)
  const [expenses, setExpenses] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])

  async function load() {
    const [s, e, r] = await Promise.all([fetch("/api/dashboards/summary"), fetch("/api/expenses"), fetch("/api/budget/purchase-requests")])
    setData(await s.json())
    setExpenses(((await e.json()).expenses || []).filter((x: any) => x.status === "pending"))
    setRequests(((await r.json()).purchase_requests || []).filter((x: any) => x.status === "pending"))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function approveExpense(id: number, approve: boolean) {
    setApproving(id)
    await fetch("/api/expenses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: approve ? "paid" : "cancelled" }) })
    await load(); setApproving(null)
  }
  async function approveRequest(id: number) {
    setApproving(id)
    await fetch("/api/budget/purchase-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", id }) })
    await load(); setApproving(null)
  }

  if (loading || !data) return <div style={{ padding: 32 }}>טוען...</div>

  const f = data.funnel
  const monthMap = new Map(data.monthly_placements.map((m: any) => [m.month, m.n]))
  const now = new Date()
  const last12 = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return d.toISOString().slice(0, 7) })
  const maxPlacement = Math.max(1, ...last12.map(m => Number(monthMap.get(m) || 0)))

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › דשבורדים › <span style={{ color: T.navy, fontWeight: 600 }}>דשבורד מנכ&quot;ל</span></div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>דשבורד מנכ&quot;ל</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}><div style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>סך תיקים</div><div style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{f.total_inquiries}</div></div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}><div style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>תיקים פעילים</div><div style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{f.active_process}</div></div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}><div style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>שיבוצים סה&quot;כ</div><div style={{ fontSize: 30, fontWeight: 700, marginTop: 4, color: T.ok }}>{f.placed}</div></div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}><div style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>שיעור המרה</div><div style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{f.conversion_rate !== null ? `${f.conversion_rate}%` : "—"}</div></div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>ניצול תקציב לפי מקור מימון</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.budget_sources.map((b: any) => (
            <div key={b.funder}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{b.funder}</span><span className="ltr-numeric" style={{ color: T.slate }}>{money(b.used)} / {money(b.amount)}</span></div>
              <div style={{ height: 10, background: T.bg, borderRadius: 5 }}><div style={{ height: "100%", width: `${b.amount ? Math.min(100, (b.used / b.amount) * 100) : 0}%`, background: b.amount && b.used / b.amount > 0.8 ? T.warn : T.blue, borderRadius: 5 }} /></div>
            </div>
          ))}
          {!data.budget_sources.length && <div style={{ color: T.slate, fontSize: 13 }}>אין עדיין מקורות מימון מוגדרים</div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>בקרת איכות מוקד</div>
          <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: "20px 0" }}>אין עדיין נתוני מוקד — ממתין לאינטגרציית Aspire (מחוץ להיקף שלב זה)</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>ביצועי רכזים מול יעדים (החודש)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.coordinator_performance.map((c: any) => {
              const pct = c.target_leads ? Math.min(100, Math.round((c.actual_leads / c.target_leads) * 100)) : 0
              return (
                <div key={c.coordinator_name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{c.coordinator_name}</span><span style={{ color: T.slate }}>{c.actual_leads} / {c.target_leads} לידים</span></div>
                  <div style={{ height: 8, background: T.bg, borderRadius: 4 }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? T.ok : T.warn, borderRadius: 4 }} /></div>
                </div>
              )
            })}
            {!data.coordinator_performance.length && <div style={{ color: T.slate, fontSize: 13 }}>אין עדיין יעדים מוגדרים לחודש הנוכחי</div>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>ממתין לאישורך</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {expenses.map(e => (
              <div key={`e${e.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px" }}>
                <div><div style={{ fontSize: 13, fontWeight: 600 }}>{e.description}</div><div style={{ fontSize: 12, color: T.slate }} className="ltr-numeric">{money(e.amount)} · {e.vendor}</div></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button disabled={approving === e.id} onClick={() => approveExpense(e.id, true)} style={{ background: "#EAF3EE", color: T.ok, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>אשר</button>
                  <button disabled={approving === e.id} onClick={() => approveExpense(e.id, false)} style={{ background: "#FDECEA", color: T.breach, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>דחה</button>
                </div>
              </div>
            ))}
            {requests.map(r => (
              <div key={`r${r.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px" }}>
                <div><div style={{ fontSize: 13, fontWeight: 600 }}>דרישת רכש — {r.item}</div><div style={{ fontSize: 12, color: T.slate }}>{r.requested_by}</div></div>
                <button disabled={approving === r.id} onClick={() => approveRequest(r.id)} style={{ background: "#EAF3EE", color: T.ok, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>אשר והזמן</button>
              </div>
            ))}
            {!expenses.length && !requests.length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center" }}>אין דבר הממתין לאישור כרגע</div>}
          </div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>מגמות 12 חודשים — שיבוצים</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
            {last12.map((m, i) => (
              <div key={m} style={{ flex: 1, background: i === 11 ? T.blue : T.blueBg, borderRadius: "3px 3px 0 0", height: `${Math.max(4, ((Number(monthMap.get(m)) || 0) / maxPlacement) * 100)}%` }} title={`${m}: ${monthMap.get(m) || 0}`} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {last12.map(m => <div key={m} style={{ flex: 1, textAlign: "center", fontSize: 10, color: T.slate }}>{m.slice(5)}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}
