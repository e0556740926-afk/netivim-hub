"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"

const T = { navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const REL_COLOR: Record<string, { bg: string; fg: string }> = {
  "פעיל": { bg: "#EAF3EE", fg: T.ok }, "חדש": { bg: T.bg, fg: T.slate }, "בבדיקה": { bg: "#FDF6E7", fg: T.warn },
}

function Stars({ n }: { n: number }) {
  return <span style={{ color: T.warn, fontSize: 13 }}>{"★".repeat(n)}<span style={{ color: T.border }}>{"☆".repeat(5 - n)}</span></span>
}

export default function OrganizationsList() {
  const [orgs, setOrgs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [view, setView] = useState<"cards" | "table">("cards")
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [region, setRegion] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", category: "", region: "" })

  async function load() {
    setLoading(true); setError(false)
    try {
      const r = await fetch("/api/organizations")
      setOrgs((await r.json()).organizations || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function submit() {
    if (!form.name) return
    await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    setForm({ name: "", category: "", region: "" }); setShowForm(false)
    await load()
  }

  const categories = useMemo(() => Array.from(new Set(orgs.map(o => o.category).filter(Boolean))), [orgs])
  const regions = useMemo(() => Array.from(new Set(orgs.map(o => o.region).filter(Boolean))), [orgs])
  const filtered = orgs.filter(o =>
    (!search || o.name.includes(search) || (o.region || "").includes(search) || (o.category || "").includes(search)) &&
    (!category || o.category === category) && (!region || o.region === region))

  if (error) return <ErrorState retry={load} />

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › <span style={{ color: T.navy, fontWeight: 600 }}>מוסדות</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>מוסדות <span style={{ fontSize: 14, color: T.slate, fontWeight: 400 }}>· {orgs.length} מוסדות</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "#EEF1F6", borderRadius: 8, padding: 3, gap: 2 }}>
            {(["cards", "table"] as const).map(v => (
              <div key={v} onClick={() => setView(v)} style={{ padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: view === v ? "#fff" : "transparent", color: view === v ? T.navy : T.slate, boxShadow: view === v ? "0 1px 3px rgba(20,33,61,.08)" : "none", cursor: "pointer" }}>
                {v === "cards" ? "כרטיסים" : "טבלה"}
              </div>
            ))}
          </div>
          <button onClick={() => setShowForm(s => !s)} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ מוסד חדש</button>
        </div>
      </div>

      {showForm && (
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="שם המוסד" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, minWidth: 160 }} />
          <input placeholder="קטגוריה" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, minWidth: 120 }} />
          <input placeholder="אזור" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, minWidth: 120 }} />
          <button onClick={submit} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>שמור</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: "7px 12px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13 }}>
          <option value="">סוג מוסד: הכל</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={region} onChange={e => setRegion(e.target.value)} style={{ padding: "7px 12px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13 }}>
          <option value="">אזור: הכל</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חופשי..." style={{ background: T.bg, border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, minWidth: 180 }} />
      </div>

      {loading ? <SkeletonCard /> : view === "cards" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
          {filtered.map(o => (
            <Link key={o.id} href={`/admin/organizations/${o.id}`}>
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, cursor: "pointer", height: "100%" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{o.name}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                  {o.category && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: T.blueBg, color: T.blue }}>{o.category}</span>}
                  <span style={{ fontSize: 12, color: T.slate }}>{o.region || "אזור לא ידוע"}</span>
                </div>
                {o.rating > 0 && <div style={{ marginTop: 8 }}><Stars n={o.rating} /></div>}
                <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
                  <div><span style={{ fontWeight: 700 }}>{o.our_guys_count}</span> <span style={{ color: T.slate }}>מהבחורים שלנו</span></div>
                  <div><span style={{ fontWeight: 700, color: o.capacity_left === 0 ? T.breach : T.navy }}>{o.capacity_left ?? "?"}</span> <span style={{ color: T.slate }}>מקומות פנויים</span></div>
                </div>
              </div>
            </Link>
          ))}
          {!filtered.length && <div style={{ gridColumn: "1 / -1", textAlign: "center", color: T.slate, padding: 40 }}>לא נמצאו מוסדות</div>}
        </div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: T.blueBg }}>
              {["שם", "סוג", "אזור", "בעלים אחראי", "סטטוס יחסים", "מקומות פנויים", "דירוג"].map(h => (
                <th key={h} style={{ textAlign: "right", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(o => {
                const rel = REL_COLOR[o.relationship_status] || REL_COLOR["חדש"]
                return (
                  <tr key={o.id} style={{ borderTop: `1px solid ${T.bg}`, cursor: "pointer" }} onClick={() => window.location.assign(`/admin/organizations/${o.id}`)}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{o.name}</td>
                    <td style={{ padding: "10px 14px", color: T.slate }}>{o.category || "—"}</td>
                    <td style={{ padding: "10px 14px", color: T.slate }}>{o.region || "—"}</td>
                    <td style={{ padding: "10px 14px", color: T.slate }}>{o.owner_type === "coordinator" ? "רכז אזורי" : o.owner_type === "alexander" ? "אלכסנדר שירצקי" : "—"}</td>
                    <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: rel.bg, color: rel.fg }}>{o.relationship_status}</span></td>
                    <td style={{ padding: "10px 14px", color: o.capacity_left === 0 ? T.breach : undefined }}>{o.capacity_left ?? "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{o.rating > 0 ? <Stars n={o.rating} /> : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}
