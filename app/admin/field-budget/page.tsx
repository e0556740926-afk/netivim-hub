"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", breach: "#C0392B" }
const CAT_LABEL: Record<string, string> = { equipment: "רכש ציוד", marketing: "פרסום", catering: "כיבוד", venue: 'מקום/שכ"ד', other: "אחר" }
function money(n: number) { return `₪${Math.round(n).toLocaleString()}` }

export default function FieldBudgetPage() {
  const [categories, setCategories] = useState<string[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [totals, setTotals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ description: "", vendor: "", amount: "", date: "", category: "" })

  async function load() {
    setLoading(true)
    const r = await fetch("/api/field-budget")
    const d = await r.json()
    setCategories(d.categories || []); setExpenses(d.expenses || []); setTotals(d.totals || [])
    if (d.categories?.length && !form.category) setForm(f => ({ ...f, category: d.categories[0] }))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function submit() {
    if (!form.description || !form.amount || !form.category) return
    const r = await fetch("/api/field-budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) })
    if (!r.ok) { const d = await r.json(); alert(d.error); return }
    setForm({ description: "", vendor: "", amount: "", date: "", category: categories[0] || "" })
    await load()
  }

  const totalsMap = new Map(totals.map((t: any) => [t.category, Number(t.spent)]))

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › שטח וקהילה › <span style={{ color: T.navy, fontWeight: 600 }}>תקציב שטח</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>תקציב שטח</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>מודול נפרד: הסעיפים מוגדרים מהתקציב הראשי (קריאה בלבד), אבל הזנת הוצאה כאן משתקפת אוטומטית שם — כתיבה אחת, שתי תצוגות. רואים ומזינים רק על הסעיפים שהוקצו.</div>

      {!categories.length ? (
        <div style={{ background: "#FDF6E7", border: "1px solid #B7791F33", borderRadius: 12, padding: 20, color: "#B7791F" }}>
          עדיין לא הוקצו סעיפים לתקציב השטח. מנהל ראשי צריך להקצות סעיפים מתוך דשבורד התקציב הראשי.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
            {categories.map(cat => (
              <div key={cat} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: T.slate }}>{CAT_LABEL[cat] || cat}</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }} className="ltr-numeric">{money(totalsMap.get(cat) || 0)}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            <input placeholder="תיאור ההוצאה" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <input placeholder="ספק" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <input placeholder="סכום" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}>
              {categories.map(cat => <option key={cat} value={cat}>{CAT_LABEL[cat] || cat}</option>)}
            </select>
            <button onClick={submit} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 8, fontWeight: 600, cursor: "pointer" }}>+ הוסף הוצאה</button>
          </div>

          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#EDF2F8" }}>
                {["תיאור", "סעיף", "סכום", "תאריך", "סטטוס"].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{e.description}</td>
                    <td style={{ padding: "10px 14px", color: T.slate }}>{CAT_LABEL[e.category] || e.category}</td>
                    <td style={{ padding: "10px 14px" }} className="ltr-numeric">{money(e.amount)}</td>
                    <td style={{ padding: "10px 14px", color: T.slate }}>{e.date}</td>
                    <td style={{ padding: "10px 14px", color: e.status === "paid" ? T.ok : T.slate }}>{e.status}</td>
                  </tr>
                ))}
                {!expenses.length && <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין עדיין הוצאות בסעיפים שהוקצו</td></tr>}
              </tbody>
            </table></div>
          </div>
        </>
      )}
    </div>
  )
}
