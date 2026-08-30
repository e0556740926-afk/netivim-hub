"use client"
import { useEffect, useState } from "react"
import Modal from "@/components/ui/Modal"
import { useToast } from "@/components/ui/Toast"
import EmptyState from "@/components/ui/EmptyState"
import ErrorState from "@/components/ui/ErrorState"
import { SkeletonCard } from "@/components/ui/Skeleton"

const TYPE_LABEL: Record<string, string> = { call: "שיחה", meeting: "פגישה", materials: "חומרים", backoffice: "בק-אופיס" }
const FREQ_LABEL: Record<string, string> = { daily: "כל יום", weekly: "כל שבוע", monthly: "כל חודש" }
const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]

const EMPTY_FORM = {
  title: "", type: "call", details: "", assignees: [] as string[],
  frequency: "daily", day_of_week: 0, day_of_month: 1,
}

export default function RecurringTasksPage() {
  const { success, error: toastError } = useToast()
  const [templates, setTemplates] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [available, setAvailable] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [tr, ur] = await Promise.all([
        fetch("/api/recurring-tasks"),
        fetch("/api/users/all"),
      ])
      if (!tr.ok) throw new Error()
      const td = await tr.json()
      const ud = await ur.json()
      setTemplates(td.templates || [])
      setAvailable(td.available !== false)
      setCoords(ud.coordinators || [])
      setAdmins(ud.admins || [])
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function startAdd() {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }
  function startEdit(t: any) {
    setEditId(t.id)
    setForm({
      title: t.title, type: t.type, details: t.details || "", assignees: t.assignees || [],
      frequency: t.frequency, day_of_week: t.day_of_week ?? 0, day_of_month: t.day_of_month ?? 1,
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.title.trim()) { toastError("כותרת היא שדה חובה"); return }
    setSaving(true)
    const res = await fetch("/api/recurring-tasks", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { ...form, id: editId } : form),
    })
    setSaving(false)
    if (!res.ok) { toastError("שמירה נכשלה"); return }
    setShowForm(false)
    success(editId ? "המשימה החוזרת עודכנה" : "משימה חוזרת נוצרה")
    load()
  }

  async function toggleActive(t: any) {
    await fetch("/api/recurring-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, toggle_active: true }),
    })
    setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, active: !x.active } : x))
    success(t.active ? "הושהתה" : "הופעלה מחדש")
  }

  async function del(id: number) {
    if (!confirm("למחוק משימה חוזרת זו? משימות שכבר נוצרו ממנה לא יימחקו.")) return
    await fetch("/api/recurring-tasks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    setTemplates(ts => ts.filter(x => x.id !== id))
    success("נמחקה")
  }

  function toggleAssignee(name: string) {
    setForm(f => ({ ...f, assignees: f.assignees.includes(name) ? f.assignees.filter(x => x !== name) : [...f.assignees, name] }))
  }

  const allAssignees = [
    ...coords.map((c: any) => ({ name: c.name, isManager: false })),
    ...admins.map((a: any) => ({ name: a.name, isManager: true })),
  ]

  if (error) return <div className="p-6"><ErrorState retry={load} /></div>

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">משימות חוזרות</h1>
          <div className="text-sm text-[#64748B] mt-0.5">
            נוצרות אוטומטית מדי יום/שבוע/חודש, גם אם המשימה הקודמת עדיין פתוחה
          </div>
        </div>
        <button onClick={startAdd}
          className="px-4 py-2 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold hover:bg-[#00488D] transition-colors">
          + משימה חוזרת חדשה
        </button>
      </div>

      {!available && (
        <div className="bg-[#FEF3C7] text-[#B45309] rounded-[10px] px-4 py-3 text-sm mb-4">
          הפיצ'ר ממתין לעדכון מסד נתונים שטרם הופעל.
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? "עריכת משימה חוזרת" : "משימה חוזרת חדשה"}
        footer={<>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50">
            {saving ? "שומר..." : "שמור"}
          </button>
          <button onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-[10px] text-sm">ביטול</button>
        </>}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold block mb-1">כותרת *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="לדוגמה: דוח שבועי לספקים"
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1">סוג</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">תדירות</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
                {Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {form.frequency === "weekly" && (
            <div>
              <label className="text-xs font-semibold block mb-1">יום בשבוע</label>
              <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: +e.target.value }))}
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
                {DAYS_HE.map((d, i) => <option key={i} value={i}>יום {d}</option>)}
              </select>
            </div>
          )}
          {form.frequency === "monthly" && (
            <div>
              <label className="text-xs font-semibold block mb-1">יום בחודש</label>
              <input type="number" min={1} max={31} value={form.day_of_month}
                onChange={e => setForm(f => ({ ...f, day_of_month: +e.target.value }))}
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]" />
              <div className="text-[10px] text-[#94A3B8] mt-1">אם החודש קצר יותר (למשל 31 בפברואר), תיווצר ביום האחרון של החודש</div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold block mb-1">הערות</label>
            <textarea value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm resize-none focus:outline-none focus:border-[#00488D]" />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5">שיוך משתמשים</label>
            <div className="flex flex-wrap gap-1.5">
              {allAssignees.map(a => (
                <label key={a.name}
                  className={`flex items-center gap-1.5 text-xs cursor-pointer border rounded-[8px] px-2.5 py-1.5 select-none transition-colors ${
                    form.assignees.includes(a.name)
                      ? a.isManager ? "bg-[#EDE9FE] border-[#C4B5FD] text-[#5B21B6]" : "bg-[#DBEAFE] border-[#BFDBFE] text-[#1E40AF]"
                      : "bg-white border-[#E2E8F0] text-[#374151] hover:bg-[#F8FAFC]"
                  }`}>
                  <input type="checkbox" checked={form.assignees.includes(a.name)} onChange={() => toggleAssignee(a.name)} className="w-3 h-3" />
                  {a.isManager && <span>👑</span>}
                  <span>{a.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} rows={3} />)}</div>
      ) : templates.length === 0 ? (
        <EmptyState icon="🔁" title="אין משימות חוזרות עדיין"
          hint="משימה חוזרת נוצרת אוטומטית לפי לוח זמנים קבוע — יומי, שבועי או חודשי"
          actionLabel="+ צור משימה חוזרת ראשונה" onAction={startAdd} />
      ) : (
        <div className="space-y-2">
          {templates.map((t: any) => (
            <div key={t.id} className={`bg-white border rounded-[12px] p-4 flex items-center gap-3 ${t.active ? "border-[#E2E8F0]" : "border-[#E2E8F0] opacity-60"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{t.title}</span>
                  <span className="text-xs px-2 py-0.5 bg-[#F0F7FF] text-[#00488D] rounded-full">{FREQ_LABEL[t.frequency]}</span>
                  {t.frequency === "weekly" && <span className="text-xs text-[#64748B]">יום {DAYS_HE[t.day_of_week]}</span>}
                  {t.frequency === "monthly" && <span className="text-xs text-[#64748B]">ה-{t.day_of_month} לחודש</span>}
                  {!t.active && <span className="text-xs px-2 py-0.5 bg-[#F3F4F6] text-[#64748B] rounded-full">מושהית</span>}
                </div>
                <div className="text-xs text-[#94A3B8] mt-1">
                  {TYPE_LABEL[t.type]} · {(t.assignees || []).join(", ") || "ללא שיוך"}
                  {t.last_generated_date && <> · נוצרה לאחרונה {String(t.last_generated_date).slice(0, 10)}</>}
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => toggleActive(t)}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] hover:bg-[#F8FAFC]">
                  {t.active ? "השהה" : "הפעל"}
                </button>
                <button onClick={() => startEdit(t)} className="px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
                <button onClick={() => del(t.id)} className="px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
