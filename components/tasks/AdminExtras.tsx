"use client"
import { useEffect, useState } from "react"
import { useToast } from "@/components/ui/Toast"
import { TYPE_LABEL, RECURRENCE_LABEL } from "./task-model"
import type { Person } from "./TaskPanel"

/**
 * Manager-only tools that used to be inline sections on the tasks page:
 * task templates (applied by hand) and recurring series. Rendered inside
 * the same side panel as the task editor, one tab each.
 */
export default function AdminExtras({ tab, people, today, onClose, onChanged }: {
  tab: "templates" | "series"; people: Person[]; today: string; onClose: () => void; onChanged: () => void
}) {
  const { success, error } = useToast()
  const [templates, setTemplates] = useState<any[]>([])
  const [series, setSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState("")
  const [newItems, setNewItems] = useState([{ title: "", type: "call", priority: "normal", offset_days: 0 }])
  const [applyId, setApplyId] = useState<number | null>(null)
  const [applyTo, setApplyTo] = useState<string[]>([])
  const [applyDate, setApplyDate] = useState(today)

  async function load() {
    setLoading(true)
    try {
      if (tab === "templates") { const r = await fetch("/api/task-templates"); setTemplates((await r.json()).templates || []) }
      else { const r = await fetch("/api/tasks/series"); setSeries((await r.json()).series || []) }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTemplate() {
    const items = newItems.filter(i => i.title.trim())
    if (!newName.trim() || !items.length) return
    await fetch("/api/task-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim(), items }) })
    setNewName(""); setNewItems([{ title: "", type: "call", priority: "normal", offset_days: 0 }])
    success("התבנית נשמרה"); load()
  }
  async function applyTemplate() {
    if (!applyId || !applyTo.length) { error("בחר תבנית ולפחות משויך אחד"); return }
    const r = await fetch("/api/task-templates/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template_id: applyId, assignees: applyTo, start_date: applyDate }) })
    const d = await r.json()
    if (d.ok) { success(`נוצרו ${d.created} משימות`); setApplyId(null); setApplyTo([]); onChanged() }
    else error(d.error || "שגיאה")
  }
  async function deleteTemplate(id: number) {
    if (!confirm("למחוק תבנית זו?")) return
    await fetch("/api/task-templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    load()
  }
  async function seriesAction(id: number, action: "pause" | "resume") {
    await fetch("/api/tasks/series", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) })
    success(action === "pause" ? "הסדרה הושהתה" : "הסדרה חודשה"); load(); onChanged()
  }

  const FIELD = "px-2.5 py-1.5 border border-[#CBD5E1] rounded-[8px] text-xs bg-white focus:outline-none focus:border-[#00488D]"

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="panel" role="dialog" aria-modal="true" dir="rtl">
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#EEF2F6]">
          <div className="text-base font-extrabold text-[#0D2744]">{tab === "templates" ? "תבניות משימות" : "סדרות חוזרות"}</div>
          <button onClick={onClose} aria-label="סגור" className="press w-8 h-8 rounded-[8px] text-[#64748B] hover:bg-[#F1F5F9] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && <div className="text-xs text-[#94A3B8]">טוען…</div>}

          {tab === "series" && !loading && (
            <>
              <p className="text-xs text-[#64748B] leading-relaxed">משימה עם חזרה היא &quot;סדרה&quot;: המערכת יוצרת ממנה הופעה חדשה בכל מועד. השהיה עוצרת את ההופעות הבאות בלי למחוק את הקיימות.</p>
              {series.map(s => (
                <div key={s.id} className="border border-[#E2E8F0] rounded-[12px] p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[#0D2744] truncate">{s.title}</div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">{RECURRENCE_LABEL[s.recurrence] || s.recurrence} · {s.spawned_count} נוצרו · {s.open_count} פתוחות{!s.next_run && " · מושהית"}</div>
                  </div>
                  {s.next_run
                    ? <button onClick={() => seriesAction(s.id, "pause")} className="press text-xs font-bold px-3 py-1.5 rounded-[8px] border border-[#E2E8F0] hover:bg-[#F8FAFC]">השהה</button>
                    : <button onClick={() => seriesAction(s.id, "resume")} className="press text-xs font-bold px-3 py-1.5 rounded-[8px] bg-[#DCFCE7] text-[#166534]">חדש</button>}
                </div>
              ))}
              {!series.length && <div className="text-sm text-[#94A3B8] text-center py-8">אין סדרות חוזרות. צור משימה ובחר &quot;חזרה&quot; כדי להתחיל אחת.</div>}
            </>
          )}

          {tab === "templates" && !loading && (
            <>
              {templates.map(t => (
                <div key={t.id} className="border border-[#E2E8F0] rounded-[12px] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-[#0D2744]">{t.name} <span className="text-[#94A3B8] font-normal text-xs">· {t.items.length} שלבים</span></div>
                    <div className="flex gap-1">
                      <button onClick={() => setApplyId(applyId === t.id ? null : t.id)} className="press text-xs font-bold px-3 py-1.5 rounded-[8px] bg-[#0D2744] text-white">{applyId === t.id ? "ביטול" : "החל"}</button>
                      <button onClick={() => deleteTemplate(t.id)} className="press text-xs px-2 py-1.5 rounded-[8px] text-[#64748B] hover:text-[#960010] hover:bg-[#FFF1F1]">מחק</button>
                    </div>
                  </div>
                  <ol className="text-[11px] text-[#64748B] mt-1.5 space-y-0.5 pr-4 list-decimal">{t.items.map((i: any) => <li key={i.id}>{i.title} <span className="text-[#B6C2D1]">+{i.offset_days}י׳</span></li>)}</ol>
                  {applyId === t.id && (
                    <div className="mt-3 pt-3 border-t border-[#EEF2F6] space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {people.map(p => {
                          const on = applyTo.includes(p.name)
                          return <button key={`${p.id}-${p._isManager ? "m" : "c"}`} type="button" onClick={() => setApplyTo(a => on ? a.filter(x => x !== p.name) : [...a, p.name])}
                            className={`press text-xs rounded-full px-2.5 py-1 border ${on ? "bg-[#0D2744] border-[#0D2744] text-white" : "bg-white border-[#E2E8F0] text-[#334155]"}`}>{p.name}</button>
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="date" value={applyDate} onChange={e => setApplyDate(e.target.value)} className={FIELD} />
                        <button onClick={applyTemplate} className="press text-xs font-bold px-3 py-1.5 rounded-[8px] bg-[#00488D] text-white">צור משימות</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!templates.length && <div className="text-sm text-[#94A3B8] text-center py-6">אין תבניות עדיין</div>}

              <details className="border border-dashed border-[#CBD5E1] rounded-[12px] p-3">
                <summary className="text-sm font-bold text-[#00488D] cursor-pointer select-none">+ תבנית חדשה</summary>
                <div className="mt-3 space-y-2">
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="שם התבנית, למשל: רצף פתיחת שותפות" className={FIELD + " w-full"} />
                  {newItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center">
                      <input value={it.title} onChange={e => setNewItems(items => items.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))} placeholder={`שלב ${idx + 1}`} className={FIELD} />
                      <select value={it.type} onChange={e => setNewItems(items => items.map((x, i) => i === idx ? { ...x, type: e.target.value } : x))} className={FIELD}>
                        {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-[#64748B]">
                        <input type="number" value={it.offset_days} onChange={e => setNewItems(items => items.map((x, i) => i === idx ? { ...x, offset_days: Number(e.target.value) } : x))} className={FIELD + " w-14"} />ימים
                      </label>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setNewItems(i => [...i, { title: "", type: "call", priority: "normal", offset_days: 0 }])} className="press text-xs font-bold px-3 py-1.5 rounded-[8px] border border-[#E2E8F0]">+ שלב</button>
                    <button type="button" onClick={saveTemplate} className="press text-xs font-bold px-3 py-1.5 rounded-[8px] bg-[#00488D] text-white">שמור תבנית</button>
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
