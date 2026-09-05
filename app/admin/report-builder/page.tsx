"use client"
import { useEffect, useState } from "react"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", breach: "#C0392B" }
const FIELD_LABEL: Record<string, string> = { city: "עיר", sector: "מגזר", advisor_status: "סטטוס תיק", source: "מקור", owner_name: "יועץ מטפל", interest: "תחום עניין", type: "סוג", owner: "בעלים", status: "סטטוס" }

export default function ReportBuilderPage() {
  const [tab, setTab] = useState<"auto" | "builder">("auto")
  const [schedules, setSchedules] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [scheduleForm, setScheduleForm] = useState({ name: "", frequency: "weekly", recipients: "", report_type: "anomalies" })
  const [entity, setEntity] = useState<"leads" | "contacts">("leads")
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [runResult, setRunResult] = useState<any>(null)
  const [templateName, setTemplateName] = useState("")

  async function loadSchedules() { setSchedules((await (await fetch("/api/admin/report-schedules")).json()).schedules || []) }
  async function loadTemplates() { setTemplates((await (await fetch("/api/admin/report-builder")).json()).templates || []) }
  useEffect(() => { loadSchedules(); loadTemplates() }, [])

  async function addSchedule() {
    if (!scheduleForm.name || !scheduleForm.recipients) return
    await fetch("/api/admin/report-schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...scheduleForm, recipients: scheduleForm.recipients.split(",").map(s => s.trim()) }) })
    setScheduleForm({ name: "", frequency: "weekly", recipients: "", report_type: "anomalies" })
    await loadSchedules()
  }
  async function toggleSchedule(id: number, active: boolean) {
    await fetch("/api/admin/report-schedules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !active }) })
    await loadSchedules()
  }
  async function deleteSchedule(id: number) {
    await fetch("/api/admin/report-schedules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    await loadSchedules()
  }

  async function runReport() {
    const r = await fetch("/api/admin/report-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", entity, filters }) })
    setRunResult(await r.json())
  }
  async function saveTemplate() {
    if (!templateName) return
    await fetch("/api/admin/report-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", name: templateName, entity, filters }) })
    setTemplateName("")
    await loadTemplates()
  }
  function loadTemplate(t: any) { setEntity(t.entity); setFilters(t.filters || {}) }

  const fields = entity === "leads" ? ["city", "sector", "advisor_status", "source", "owner_name", "interest"] : ["type", "owner", "status"]

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › הנהלה › <span style={{ color: T.navy, fontWeight: 600 }}>דוחות</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>אזור דוחות</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 20 }}>נפרד מאזור הסטטיסטיקות — כאן דוחות מופצים ונשמרים, לא ניתוח אינטראקטיבי.</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("auto")} style={{ background: tab === "auto" ? T.blue : "#fff", color: tab === "auto" ? "#fff" : T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>דוחות אוטומטיים</button>
        <button onClick={() => setTab("builder")} style={{ background: tab === "builder" ? T.blue : "#fff", color: tab === "builder" ? "#fff" : T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>בונה דוח גמיש</button>
      </div>

      {tab === "auto" && (
        <div>
          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            <input placeholder="שם התזמון" value={scheduleForm.name} onChange={e => setScheduleForm(f => ({ ...f, name: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
            <select value={scheduleForm.frequency} onChange={e => setScheduleForm(f => ({ ...f, frequency: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}>
              <option value="daily">יומי</option><option value="weekly">שבועי</option><option value="monthly">חודשי</option>
            </select>
            <input placeholder="נמענים (מופרד בפסיקים)" value={scheduleForm.recipients} onChange={e => setScheduleForm(f => ({ ...f, recipients: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, gridColumn: "1 / -1" }} />
            <button onClick={addSchedule} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: 8, fontWeight: 600, cursor: "pointer", gridColumn: "1 / -1" }}>+ תזמון חדש (דוח חריגות)</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {schedules.map(s => (
              <div key={s.id} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: T.slate }}>{s.frequency} · {(s.recipients || []).join(", ")} · הופעל לאחרונה: {s.last_run_at ? new Date(s.last_run_at).toLocaleDateString("he-IL") : "טרם"}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span onClick={() => toggleSchedule(s.id, s.active)} style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: s.active ? "#EAF3EE" : T.bg, color: s.active ? T.ok : T.slate }}>{s.active ? "פעיל" : "מושבת"}</span>
                  <span onClick={() => deleteSchedule(s.id)} style={{ cursor: "pointer", color: T.breach, fontSize: 12 }}>מחק</span>
                </div>
              </div>
            ))}
            {!schedules.length && <div style={{ textAlign: "center", color: T.slate, padding: 20 }}>אין עדיין תזמוני דוחות</div>}
          </div>
        </div>
      )}

      {tab === "builder" && (
        <div>
          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["leads", "contacts"] as const).map(e => (
                <button key={e} onClick={() => { setEntity(e); setFilters({}) }} style={{ background: entity === e ? T.blue : T.bg, color: entity === e ? "#fff" : T.slate, border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>{e === "leads" ? "תיקים" : "אנשי קשר"}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {fields.map(f => (
                <input key={f} placeholder={FIELD_LABEL[f] || f} value={filters[f] || ""} onChange={e => setFilters(x => ({ ...x, [f]: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, fontSize: 13 }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={runReport} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>הרץ דוח</button>
              <input placeholder="שם לשמירת תבנית" value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, flex: 1 }} />
              <button onClick={saveTemplate} style={{ background: T.bg, color: T.slate, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>שמור תבנית</button>
            </div>
          </div>

          {templates.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {templates.map(t => <span key={t.id} onClick={() => loadTemplate(t)} style={{ cursor: "pointer", fontSize: 12, padding: "6px 12px", borderRadius: 14, background: T.bg, color: T.blue }}>📋 {t.name}</span>)}
            </div>
          )}

          {runResult && (
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, color: T.slate, marginBottom: 10 }}>{runResult.count} תוצאות (עד 500 מוצגות)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {runResult.rows?.slice(0, 50).map((r: any) => (
                  <div key={r.id} style={{ fontSize: 13, borderTop: `1px solid ${T.bg}`, padding: "6px 0" }}>{r.name} {r.city ? `· ${r.city}` : ""} {r.phone ? `· ${r.phone}` : ""}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
