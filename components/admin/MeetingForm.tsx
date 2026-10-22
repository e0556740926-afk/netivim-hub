"use client"
import { useState } from "react"
import { fd } from "@/lib/utils"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"

export const MTG_TYPE: Record<string, string> = { regular: "שגרתית", urgent: "חירום", goal: "מטרה מוגדרת" }
const TASK_TYPE_HE: Record<string, string> = { call: "שיחה", meeting: "פגישה", materials: "חומרים", backoffice: "בק-אופיס" }

interface Props {
  coordinators: { id: number; name: string }[]
  /** When given, the coordinator is fixed (card page) and the selector is hidden. */
  fixedCoordinatorId?: number
  onSaved: () => void
  onCancel: () => void
}

/**
 * Meeting summary form + AI task extraction. Shared by the coordinator
 * management page (any coordinator) and the coordinator card (fixed).
 */
export default function MeetingForm({ coordinators, fixedCoordinatorId, onSaved, onCancel }: Props) {
  const [form, setForm] = useState({
    coordinator_id: fixedCoordinatorId ? String(fixedCoordinatorId) : "",
    date: new Date().toISOString().slice(0, 10), type: "regular", agenda: "", summary: "", next_meeting_date: "",
  })
  const [extracting, setExtracting] = useState(false)
  const [tasks, setTasks] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const inp = "w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm bg-white focus:outline-none focus:border-[#28634e]"

  async function extract() {
    if (!form.summary.trim() || !form.coordinator_id) return
    setExtracting(true); setTasks([])
    try {
      const coord = coordinators.find(c => String(c.id) === form.coordinator_id)
      const res = await fetch("/api/extract-tasks", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: form.summary, coordinator_name: coord?.name || "", date: form.date }) })
      const d = await res.json()
      setTasks(d.tasks || [])
    } finally { setExtracting(false) }
  }

  async function save() {
    if (!form.coordinator_id || !form.summary.trim()) return
    setSaving(true)
    try {
      await fetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, coordinator_id: parseInt(form.coordinator_id) }) })
      for (const t of tasks) {
        if (t._skip) continue
        await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...t, coordinator_id: parseInt(form.coordinator_id), status: "todo" }) })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const kept = tasks.filter(t => !t._skip).length

  return (
    <Card className="mb-5 border-2 border-[#28634e]">
      <div className="p-5">
        <div className="text-sm font-bold text-[#28634e] mb-4">סיכום פגישה חדש</div>
        <div className={`grid grid-cols-1 ${fixedCoordinatorId ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-3 mb-3`}>
          {!fixedCoordinatorId && (
            <div>
              <label className="text-xs font-semibold block mb-1">רכז *</label>
              <select value={form.coordinator_id} onChange={e => setForm(f => ({ ...f, coordinator_id: e.target.value }))} className={inp}>
                <option value="">— בחר רכז —</option>
                {coordinators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold block mb-1">תאריך</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">סוג פגישה</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={inp}>
              {Object.entries(MTG_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs font-semibold block mb-1">אג&apos;נדה / נושאים שדוברו</label>
          <input value={form.agenda} onChange={e => setForm(f => ({ ...f, agenda: e.target.value }))} placeholder="נושאי הפגישה בקצרה..." className={inp} />
        </div>
        <div className="mb-3">
          <label className="text-xs font-semibold block mb-1">סיכום הפגישה * <span className="text-[#28634e] font-normal">(ה-AI יגזור מכאן משימות)</span></label>
          <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} rows={5}
            placeholder="כתוב כאן את סיכום הפגישה בחופשיות — מה סוכם, מה צריך לעשות, מה האתגרים..."
            className={inp + " resize-none"} />
        </div>
        <div className="mb-4">
          <label className="text-xs font-semibold block mb-1">תאריך פגישה הבאה</label>
          <input type="date" value={form.next_meeting_date} onChange={e => setForm(f => ({ ...f, next_meeting_date: e.target.value }))} className="w-48 px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm focus:outline-none focus:border-[#28634e]" />
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={extract} disabled={extracting || !form.summary.trim() || !form.coordinator_id}
            className="flex items-center gap-2 px-4 py-2 bg-[#5B21B6] text-white rounded-[9px] text-sm font-semibold disabled:opacity-50 hover:bg-[#4C1D95] transition-colors">
            {extracting
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /><span>מחלץ משימות...</span></>
              : <><span>✨</span><span>חלץ משימות עם AI</span></>}
          </button>
          {tasks.length > 0 && <span className="text-xs text-[#28634e] self-center font-semibold">✓ נמצאו {tasks.length} משימות</span>}
        </div>

        {tasks.length > 0 && (
          <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[11px] p-4 mb-4">
            <div className="text-xs font-bold text-[#5B21B6] mb-3">✨ משימות שחולצו — בדוק וערוך לפני השמירה</div>
            <div className="space-y-2">
              {tasks.map((t, i) => (
                <div key={i} className={`flex items-start gap-2.5 p-3 rounded-[9px] border transition-colors ${t._skip ? "border-[#E5E7EB] bg-[#F9FAFB] opacity-50" : "border-[#C4B5FD] bg-white"}`}>
                  <input type="checkbox" checked={!t._skip} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, _skip: !e.target.checked } : x))} className="mt-0.5 accent-[#5B21B6] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <input value={t.title} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                      className="w-full text-sm font-semibold bg-transparent border-none outline-none focus:bg-white focus:border focus:border-[#C4B5FD] rounded px-1" />
                    {t.details && <div className="text-xs text-[#6B7280] mt-0.5 px-1">{t.details}</div>}
                  </div>
                  <div className="text-xs text-[#5B21B6] bg-[#EDE9FE] px-2 py-0.5 rounded-full flex-shrink-0">{TASK_TYPE_HE[t.type] || t.type}</div>
                  <div className="text-xs text-[#94A3B8] flex-shrink-0">{fd(t.due_date)}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-[#6B7280] mt-2">תאריך יעד ברירת מחדל: שבוע מהיום · ניתן לשנות מאוחר יותר</div>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "שומר..." : `שמור פגישה${kept > 0 ? ` ו-${kept} משימות` : ""}`}</Button>
          <Button variant="secondary" onClick={onCancel}>ביטול</Button>
        </div>
      </div>
    </Card>
  )
}
