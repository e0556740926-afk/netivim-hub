"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
const FIELD_TYPES = [["text", "טקסט"], ["number", "מספר"], ["date", "תאריך"], ["select", "בחירה"], ["multiselect", "בחירה מרובה"], ["boolean", "כן / לא"]]
const ROLES = ["יועצים", "מנהלים", "רכזי שטח"]
const SWATCHES = [T.blue, T.warn, T.ok, T.breach, "#6B4E9E"]

export default function FieldBuilder() {
  const [fields, setFields] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>({ label: "", field_type: "select", options: [], required: false, in_list: false, visible_roles: [], group_name: "שדות מותאמים כלליים" })
  const [optionInput, setOptionInput] = useState("")
  const [editing, setEditing] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const r = await fetch("/api/admin/custom-fields")
    setFields((await r.json()).fields || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toggleRole(role: string) {
    setForm((f: any) => ({ ...f, visible_roles: f.visible_roles.includes(role) ? f.visible_roles.filter((r: string) => r !== role) : [...f.visible_roles, role] }))
  }
  function addOption() {
    if (!optionInput.trim()) return
    setForm((f: any) => ({ ...f, options: [...f.options, { label: optionInput.trim(), color: SWATCHES[f.options.length % SWATCHES.length] }] }))
    setOptionInput("")
  }
  function removeOption(i: number) {
    setForm((f: any) => ({ ...f, options: f.options.filter((_: any, idx: number) => idx !== i) }))
  }

  async function save() {
    if (!form.label) return
    const method = editing ? "PATCH" : "POST"
    const body = editing ? { ...form, id: editing } : form
    await fetch("/api/admin/custom-fields", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setForm({ label: "", field_type: "select", options: [], required: false, in_list: false, visible_roles: [], group_name: "שדות מותאמים כלליים" })
    setEditing(null)
    await load()
  }
  function editField(f: any) {
    setForm({ label: f.label, field_type: f.field_type, options: f.options || [], required: f.required, in_list: f.in_list, visible_roles: f.visible_roles || [], group_name: f.group_name })
    setEditing(f.id)
  }
  async function remove(id: number) {
    await fetch("/api/admin/custom-fields", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    await load()
  }

  const showOptions = form.field_type === "select" || form.field_type === "multiselect"
  const listsByField = fields.filter(f => (f.options || []).length > 0)

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "24px 32px 60px" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>הגדרות › <span style={{ color: T.navy, fontWeight: 600 }}>בונה שדות מותאמים</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>בונה שדות מותאמים</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px 300px", gap: 20, marginBottom: 32 }}>
        {/* FIELD LIST */}
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, fontSize: 15, fontWeight: 700 }}>שדות מותאמים בתיק</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 60px 60px 100px 60px", gap: 10, padding: "8px 18px", fontSize: 11, fontWeight: 600, color: T.slate, background: T.bg }}>
            <span>תווית</span><span>סוג</span><span>חובה</span><span>ברשימה</span><span>מי רואה</span><span></span>
          </div>
          {loading ? <div style={{ padding: 20, color: T.slate, fontSize: 13 }}>טוען...</div> : fields.map(f => (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 60px 60px 100px 60px", gap: 10, alignItems: "center", padding: "12px 18px", borderTop: `1px solid ${T.bg}`, background: editing === f.id ? "#EDF2F8" : undefined }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
              <span style={{ fontSize: 12, color: T.slate }}>{FIELD_TYPES.find(t => t[0] === f.field_type)?.[1] || f.field_type}</span>
              <span style={{ fontSize: 16, color: f.required ? T.ok : T.border }}>{f.required ? "✓" : "–"}</span>
              <span style={{ fontSize: 16, color: f.in_list ? T.ok : T.border }}>{f.in_list ? "✓" : "–"}</span>
              <span style={{ fontSize: 11, color: T.slate }}>{f.visible_roles?.length ? f.visible_roles.join(", ") : "כולם"}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <span onClick={() => editField(f)} style={{ cursor: "pointer", color: T.blue, fontSize: 12 }}>ערוך</span>
                <span onClick={() => remove(f.id)} style={{ cursor: "pointer", color: T.breach, fontSize: 12 }}>✕</span>
              </span>
            </div>
          ))}
          {!loading && !fields.length && <div style={{ padding: 20, color: T.slate, fontSize: 13, textAlign: "center" }}>אין עדיין שדות מותאמים</div>}
          <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
            <button onClick={() => { setForm({ label: "", field_type: "select", options: [], required: false, in_list: false, visible_roles: [], group_name: "שדות מותאמים כלליים" }); setEditing(null) }}
              style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ שדה חדש</button>
          </div>
        </div>

        {/* CREATE/EDIT PANEL */}
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, alignSelf: "start" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{editing ? "עריכת שדה" : "יצירת שדה חדש"}</div>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.slate, display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}><span style={{ color: T.breach }}>*</span>תווית השדה</label>
          <input value={form.label} onChange={e => setForm((f: any) => ({ ...f, label: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 14 }} />

          <label style={{ fontSize: 12, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6 }}>סוג שדה</label>
          <select value={form.field_type} onChange={e => setForm((f: any) => ({ ...f, field_type: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 14 }}>
            {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>

          {showOptions && (
            <div style={{ background: T.bg, borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.slate, marginBottom: 8 }}>ערכי הרשימה</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {form.options.map((o: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, background: o.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 13 }}>{o.label}</span>
                    <span onClick={() => removeOption(i)} style={{ color: T.border, cursor: "pointer" }}>✕</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={optionInput} onChange={e => setOptionInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addOption()} placeholder="ערך חדש..." style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 13 }} />
                <button onClick={addOption} style={{ background: "none", border: "none", color: T.blue, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ הוסף ערך</button>
              </div>
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={form.required} onChange={e => setForm((f: any) => ({ ...f, required: e.target.checked }))} /> שדה חובה
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={form.in_list} onChange={e => setForm((f: any) => ({ ...f, in_list: e.target.checked }))} /> הצג בטבלת התיקים
          </label>

          <label style={{ fontSize: 12, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6 }}>גלוי לתפקידים</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {ROLES.map(r => (
              <span key={r} onClick={() => toggleRole(r)} style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 14, background: form.visible_roles.includes(r) ? "#EDF2F8" : T.bg, color: form.visible_roles.includes(r) ? T.blue : T.slate, cursor: "pointer" }}>
                {r}{form.visible_roles.includes(r) ? " ✓" : ""}
              </span>
            ))}
          </div>

          <label style={{ fontSize: 12, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6 }}>קבוצה בתיק</label>
          <input value={form.group_name} onChange={e => setForm((f: any) => ({ ...f, group_name: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 18 }} />

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setForm({ label: "", field_type: "select", options: [], required: false, in_list: false, visible_roles: [], group_name: "שדות מותאמים כלליים" }); setEditing(null) }}
              style={{ flex: 1, background: T.bg, color: T.slate, border: "none", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>ביטול</button>
            <button onClick={save} style={{ flex: 1, background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>שמור שדה</button>
          </div>
        </div>

        {/* LIVE PREVIEW */}
        <div style={{ alignSelf: "start" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.slate, marginBottom: 8 }}>תצוגה מקדימה — כך יופיע בתיק</div>
          <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 12 }}>{form.group_name}</div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginBottom: 6, justifyContent: "flex-end" }}>
              {form.label || "תווית השדה"}{form.required && <span style={{ color: T.breach }}>*</span>}
            </label>
            {showOptions ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {form.options.length ? form.options.map((o: any, i: number) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 14, background: i === 0 ? "#EDF2F8" : "#fff", color: i === 0 ? T.blue : T.slate, border: `1.5px solid ${i === 0 ? T.blue : T.border}` }}>{o.label}</span>
                )) : <span style={{ fontSize: 12, color: T.slate }}>הוסף ערכים כדי לראות תצוגה מקדימה</span>}
              </div>
            ) : form.field_type === "boolean" ? (
              <div style={{ display: "flex", gap: 6 }}><span style={{ fontSize: 12, padding: "6px 12px", borderRadius: 14, background: "#EDF2F8", color: T.blue, border: `1.5px solid ${T.blue}` }}>כן</span><span style={{ fontSize: 12, padding: "6px 12px", borderRadius: 14, background: "#fff", color: T.slate, border: `1.5px solid ${T.border}` }}>לא</span></div>
            ) : (
              <input disabled placeholder={form.field_type === "date" ? "תאריך..." : form.field_type === "number" ? "0" : "טקסט חופשי..."} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 6, padding: 8, fontSize: 13, background: "#fff" }} />
            )}
          </div>
        </div>
      </div>

      {/* LISTS MANAGEMENT */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>ניהול רשימות ערכים כללי</div>
      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {listsByField.map(f => (
            <div key={f.id}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{f.label} <span style={{ fontSize: 11, color: T.slate, fontWeight: 400 }}>· {f.options.length} ערכים</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {f.options.map((o: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: o.color }} />{o.label}</div>
                ))}
              </div>
            </div>
          ))}
          {!listsByField.length && <div style={{ color: T.slate, fontSize: 13 }}>אין עדיין שדות מסוג בחירה עם ערכים</div>}
        </div>
      </div>
    </div>
  )
}
