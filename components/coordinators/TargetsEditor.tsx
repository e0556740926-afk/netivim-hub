"use client"
import { useEffect, useMemo, useState } from "react"
import Modal from "@/components/ui/Modal"
import { initials, ymLabel, ym } from "./model"

interface Row { id: number; name: string; area: string; saved: number; actual: number }

/**
 * Lead targets for the CURRENT month (the existing /api/targets saves to
 * the current month only). Edits are a local draft; nothing is written
 * until "שמירת שינויים", which first shows exactly what will change.
 * `onlyId` limits the editor to one coordinator (card page).
 */
export default function TargetsEditor({ onlyId, onSaved }: { onlyId?: number; onSaved?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [bulk, setBulk] = useState("")
  const [review, setReview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loadErr, setLoadErr] = useState(false)

  async function load() {
    setLoadErr(false)
    try {
      const r = await fetch("/api/targets")
      if (!r.ok) throw new Error()
      const { coordinators, targets, leads } = await r.json()
      const list: Row[] = coordinators.filter((c: any) => !onlyId || c.id === onlyId).map((c: any) => ({
        id: c.id, name: c.name, area: c.area || "",
        saved: Number(targets.find((t: any) => t.coordinator_id === c.id)?.target_leads) || 0,
        actual: leads.filter((l: any) => l.coordinator_id === c.id).length,
      }))
      setRows(list)
      setDraft(Object.fromEntries(list.map(x => [x.id, String(x.saved)])))
    } catch { setLoadErr(true) }
  }
  useEffect(() => { load() }, [onlyId])

  const changes = useMemo(() => (rows || []).filter(r => String(Number(draft[r.id]) || 0) !== String(r.saved)).map(r => ({ ...r, next: Number(draft[r.id]) || 0 })), [rows, draft])

  async function commit() {
    setSaving(true); setMsg(null)
    const failed: string[] = []
    for (const c of changes) {
      try {
        const r = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinator_id: c.id, target_leads: c.next }) })
        if (!r.ok) failed.push(c.name)
      } catch { failed.push(c.name) }
    }
    setSaving(false); setReview(false)
    await load()
    if (failed.length) setMsg({ ok: false, text: `לא נשמרו: ${failed.join(", ")}. שאר השינויים נשמרו.` })
    else { setMsg({ ok: true, text: "היעדים נשמרו." }); onSaved?.() }
  }

  if (loadErr) return <div className="c-warn">לא ניתן לטעון את היעדים כרגע. <button className="c-textbtn" onClick={load}>ניסיון חוזר</button></div>
  if (!rows) return <div className="c-card"><div className="c-empty">טוען יעדים…</div></div>

  return (
    <div>
      <div className="c-scope">עריכה חלה על יעד החודש הנוכחי · {ymLabel(ym())}. שינויים נשמרים רק בלחיצה על ״שמירת שינויים״. יעד שנתי מוצג כהערכה (חודשי × 12), לא כיעד שנשמר בנפרד.</div>
      {!onlyId && (
        <div className="c-targettoolbar">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 12, fontWeight: 700 }}>החלת יעד אחיד על הטיוטה</span>
            <input className="c-targetinput" type="number" min={0} value={bulk} onChange={e => setBulk(e.target.value)} aria-label="יעד אחיד" />
            <button className="c-secondary" disabled={bulk === ""} onClick={() => setDraft(Object.fromEntries(rows.map(r => [r.id, bulk])))}>החלה על כל הרכזים</button>
          </div>
          <span className="c-sub">משנה את הטיוטה בלבד, לא את המערכת.</span>
        </div>
      )}
      <div className="c-tablebox">
        <div className="c-scroll">
          <table className="c-table" style={{ minWidth: 640 }}>
            <thead><tr><th>רכז / אזור</th><th>יעד חודשי</th><th>הערכה שנתית</th><th>לידים החודש</th><th>התקדמות</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const v = Number(draft[r.id]) || 0
                const p = v ? Math.min(100, Math.round(r.actual / v * 100)) : null
                return (
                  <tr key={r.id}>
                    <td><div className="c-person"><span className="c-avatar">{initials(r.name)}</span><div><b>{r.name}</b><small>{r.area || "ללא אזור"}</small></div></div></td>
                    <td><input className={`c-targetinput ${String(v) !== String(r.saved) ? "changed" : ""}`} type="number" min={0} value={draft[r.id] ?? ""} onChange={e => setDraft(d => ({ ...d, [r.id]: e.target.value }))} aria-label={`יעד ל${r.name}`} /></td>
                    <td><span className="c-num">{v * 12}</span><small>הערכה</small></td>
                    <td><span className="c-num">{r.actual}</span></td>
                    <td>{p === null ? <span className="c-badge grey">לא הוגדר יעד</span> : <><span className="c-num">{p}%</span><div className="c-progress"><i style={{ width: `${p}%` }} /></div></>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <button className="c-primary" disabled={!changes.length} onClick={() => setReview(true)}>שמירת שינויים{changes.length ? ` (${changes.length})` : ""}</button>
        <button className="c-secondary" disabled={!changes.length} onClick={() => setDraft(Object.fromEntries(rows.map(r => [r.id, String(r.saved)])))}>ביטול שינויים</button>
        {msg && <span className={`c-badge ${msg.ok ? "" : "red"}`} role="status">{msg.text}</span>}
      </div>

      <Modal open={review} onClose={() => !saving && setReview(false)} title="אישור שינוי יעדים" subtitle={`יעד לידים · ${ymLabel(ym())}`} accent="#27634e"
        footer={<div className="coord-dialog flex gap-2"><button className="c-primary" onClick={commit} disabled={saving}>{saving ? "שומר…" : "אישור ושמירה"}</button><button className="c-secondary" onClick={() => setReview(false)} disabled={saving}>חזרה לעריכה</button></div>}>
        <div className="coord-dialog">
          <table className="c-diff"><tbody>
            {changes.map(c => <tr key={c.id}><td><b>{c.name}</b></td><td className="c-sub">{c.saved || "ללא יעד"}</td><td>←</td><td><b>{c.next}</b></td></tr>)}
          </tbody></table>
        </div>
      </Modal>
    </div>
  )
}
