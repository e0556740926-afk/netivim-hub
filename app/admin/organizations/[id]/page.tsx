"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

const T = { navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B", referredFg: "#6B4E9E", referredBg: "#f2eef8" }
const REL_COLOR: Record<string, { bg: string; fg: string }> = { "פעיל": { bg: "#EAF3EE", fg: T.ok }, "חדש": { bg: T.bg, fg: T.slate }, "בבדיקה": { bg: "#FDF6E7", fg: T.warn } }
const TABS = ["overview", "tracks", "guys"] as const
const TAB_LABEL: Record<string, string> = { overview: "סקירה", tracks: "מסלולים", guys: "הבחורים שלנו" }
function Stars({ n }: { n: number }) { return <span style={{ color: T.warn }}>{"★".repeat(n)}<span style={{ color: T.border }}>{"☆".repeat(5 - n)}</span></span> }
function fdt(d?: string | null) { return d ? new Date(d).toLocaleDateString("he-IL") : "" }

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<typeof TABS[number]>("overview")
  const [showProgramForm, setShowProgramForm] = useState(false)
  const [programForm, setProgramForm] = useState({ name: "", category: "", capacity: "", current_count: "", age_min: "", age_max: "", intake_dates: "", admission_conditions: "" })

  async function load() {
    setLoading(true); setError(false)
    try {
      const r = await fetch(`/api/organizations/${id}`)
      if (!r.ok) throw new Error()
      setData(await r.json())
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  async function addProgram() {
    if (!programForm.name) return
    await fetch(`/api/organizations/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(programForm) })
    setProgramForm({ name: "", category: "", capacity: "", current_count: "", age_min: "", age_max: "", intake_dates: "", admission_conditions: "" })
    setShowProgramForm(false)
    await load()
  }

  if (loading) return <div className="p-6"><SkeletonCard /></div>
  if (error || !data) return <ErrorState retry={load} />

  const { organization: o, programs, referrals, stats } = data
  const rel = REL_COLOR[o.relationship_status] || REL_COLOR["חדש"]
  const guysRows = referrals.filter((r: any) => r.case_id)

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy }}>
      <div style={{ padding: "20px 32px 0" }}>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › מוסדות › <span style={{ color: T.navy, fontWeight: 600 }}>{o.name}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{o.name}</div>
              {o.category && <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: T.blueBg, color: T.blue }}>{o.category}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8, fontSize: 13, color: T.slate, flexWrap: "wrap" }}>
              <span>{o.region || "אזור לא ידוע"}</span>
              {o.rating > 0 && <Stars n={o.rating} />}
              <span>בעלים אחראי: <span style={{ color: T.navy, fontWeight: 600 }}>{o.owner_name || "טרם שויך"}</span></span>
              <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: rel.bg, color: rel.fg }}>קשר {o.relationship_status}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.slate, marginBottom: 6 }}>שלחנו אליהם</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: T.blue }}>{stats.sent_count} <span style={{ fontSize: 15, fontWeight: 600, color: T.slate }}>נועצים</span></div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.slate, marginBottom: 6 }}>הם הפנו אלינו</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.slate }}>עדיין לא נמדד</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
          {TABS.map(t => (
            <div key={t} onClick={() => setTab(t)} style={{ padding: "12px 16px", fontSize: 13, fontWeight: tab === t ? 700 : 600, color: tab === t ? T.blue : T.slate, borderBottom: `2px solid ${tab === t ? T.blue : "transparent"}`, whiteSpace: "nowrap", cursor: "pointer" }}>{TAB_LABEL[t]}</div>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div style={{ display: "flex", padding: "24px 32px", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 280, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 10 }}>רקע על המוסד</div>
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>{o.description || "אין עדיין תיאור למוסד זה."}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>כמות תלמידים כוללת</div>
              <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>{o.total_students ?? "לא ידוע"}</div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>מהבחורים שלנו כרגע</div>
              <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4, color: T.blue }}>{stats.our_guys_now}</div>
            </div>
            <div style={{ background: "#EAF3EE", border: "1px solid #2E6B4F33", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.ok }}>מדד התמדה היסטורי</div>
              <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4, color: T.ok }}>{stats.retention_rate !== null ? `${stats.retention_rate}%` : "אין עדיין נתונים"}</div>
            </div>
          </div>
        </div>
      )}

      {tab === "tracks" && (
        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setShowProgramForm(s => !s)} style={{ alignSelf: "flex-start", background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ מסלול חדש</button>
          {showProgramForm && (
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              <input placeholder="שם המסלול" value={programForm.name} onChange={e => setProgramForm(f => ({ ...f, name: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <input placeholder="קטגוריה" value={programForm.category} onChange={e => setProgramForm(f => ({ ...f, category: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <input placeholder="מועדי פתיחה" value={programForm.intake_dates} onChange={e => setProgramForm(f => ({ ...f, intake_dates: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <input placeholder="תנאי קבלה" value={programForm.admission_conditions} onChange={e => setProgramForm(f => ({ ...f, admission_conditions: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <input placeholder="גיל מינימום" value={programForm.age_min} onChange={e => setProgramForm(f => ({ ...f, age_min: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <input placeholder="גיל מקסימום" value={programForm.age_max} onChange={e => setProgramForm(f => ({ ...f, age_max: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <input placeholder="קיבולת" value={programForm.capacity} onChange={e => setProgramForm(f => ({ ...f, capacity: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <input placeholder="תפוסה נוכחית" value={programForm.current_count} onChange={e => setProgramForm(f => ({ ...f, current_count: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <button onClick={addProgram} style={{ gridColumn: "1 / -1", background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 8, fontWeight: 600, cursor: "pointer" }}>שמור מסלול</button>
            </div>
          )}
          {programs.map((p: any) => {
            const left = p.capacity != null ? p.capacity - (p.current_count || 0) : null
            return (
              <div key={p.id} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                  {left !== null && <span style={{ fontSize: 12, fontWeight: 700, color: left > 0 ? T.ok : T.breach }}>{left} מקומות פנויים</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 14, fontSize: 13 }}>
                  <div><div style={{ color: T.slate, marginBottom: 4 }}>מועדי פתיחה</div><div style={{ fontWeight: 600 }}>{p.intake_dates || "—"}</div></div>
                  <div><div style={{ color: T.slate, marginBottom: 4 }}>תנאי קבלה</div><div style={{ fontWeight: 600 }}>{p.admission_conditions || "—"}</div></div>
                  <div><div style={{ color: T.slate, marginBottom: 4 }}>טווח גילאים</div><div style={{ fontWeight: 600 }}>{p.age_min || "?"}–{p.age_max || "?"}</div></div>
                  <div><div style={{ color: T.slate, marginBottom: 4 }}>קיבולת</div><div style={{ fontWeight: 600 }}>{p.capacity ?? "—"}</div></div>
                </div>
              </div>
            )
          })}
          {!programs.length && <div style={{ textAlign: "center", color: T.slate, padding: 24 }}>אין עדיין מסלולים מוגדרים</div>}
        </div>
      )}

      {tab === "guys" && (
        <div style={{ padding: "24px 32px" }}>
          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: T.blueBg }}>
                {["שם", "תאריך הפניה", "סטטוס", "תוצאה"].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {guysRows.map((r: any) => {
                  const active = !["לא התקבל", "נשר", "הסתיים"].includes(r.status)
                  return (
                    <tr key={r.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>{r.case_name}{r.case_age ? `, ${r.case_age}` : ""}</td>
                      <td style={{ padding: "10px 16px", color: T.slate }}>{fdt(r.sent_at || r.created_at)}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: active ? "#EAF3EE" : "#eceef2", color: active ? T.ok : T.navy }}>{active ? "פעיל" : "היסטוריה"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", color: r.status === "לא התקבל" || r.status === "נשר" ? T.breach : T.slate }}>{r.case_status === "הסתיים בהצלחה" ? "הסתיים בהצלחה" : r.status}</td>
                    </tr>
                  )
                })}
                {!guysRows.length && <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין עדיין הפניות למוסד זה</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
