"use client"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useUrlState } from "@/lib/use-url-state"
import { useToast } from "@/components/ui/Toast"
import { api, n, fmtDate, SetupNotice, CH_LABEL } from "@/components/messaging/ui"

const STATUS: [string, string, string][] = [["new", "חדש", "blue"], ["in_progress", "בטיפול", "amber"], ["done", "טופל", "green"], ["no_answer", "לא ענה", "red"]]
const ST = Object.fromEntries(STATUS.map(([k, l, c]) => [k, { l, c }]))
const local = (ph: string) => ph?.startsWith("+972") ? "0" + ph.slice(4) : ph || ""

export default function Page() {
  return <Suspense fallback={<div className="mc-ws"><div className="lw-skel" style={{ borderRadius: 16 }} /></div>}><CampaignLeads /></Suspense>
}

function CampaignLeads() {
  const { success, error: toastError } = useToast()
  const [view, setView] = useUrlState("view", "leads")
  const [status, setStatus] = useUrlState("status", "")
  const [channel, setChannel] = useUrlState("channel", "")
  const [campaign, setCampaign] = useUrlState("campaign", "")
  const [q, setQ] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [d, setD] = useState<any>(null)
  const [inb, setInb] = useState<any>(null)
  const [err, setErr] = useState<any>(null)

  const qs = useMemo(() => new URLSearchParams(Object.entries({ status, channel, campaign, q: q.trim(), from, to }).filter(([, v]) => v) as [string, string][]).toString(), [status, channel, campaign, q, from, to])
  const load = useCallback(async () => {
    try {
      setErr(null)
      if (view === "replies") setInb(await api(`/api/messaging/inbound?open=1${campaign ? `&campaign=${campaign}` : ""}`))
      else setD(await api(`/api/messaging/callbacks${qs ? "?" + qs : ""}`))
    } catch (e) { setErr(e) }
  }, [view, qs, campaign])
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t) }, [load, q])
  useEffect(() => { api("/api/messaging/inbound?open=1").then(setInb).catch(() => {}) }, [])

  async function patch(id: number, body: any) {
    try {
      const r = await api(`/api/messaging/callbacks/${id}`, "PATCH", body)
      setD((x: any) => x && { ...x, callbacks: x.callbacks.map((c: any) => c.id === id ? { ...c, ...r.callback, assignee_name: d.staff.find((s: any) => s.id === r.callback.assignee_id)?.name || "" } : c) })
    } catch (e: any) { toastError(e.message) }
  }
  async function closeReply(id: number, toCallback: boolean) {
    try { await api(`/api/messaging/inbound/${id}`, "PATCH", { to_callback: toCallback }); success(toCallback ? "נוסף ללידים מקמפיינים" : "סומן כטופל"); load() }
    catch (e: any) { toastError(e.message) }
  }

  const counts = d?.counts || {}
  const can = d?.can || { edit: true }
  return (
    <div className="mc-ws">
      <div className="mc-crumb"><Link href="/admin/messaging">מרכז דיוורים</Link></div>
      <div className="mc-head">
        <div><h1>לידים מקמפיינים</h1><p>כל מי שביקש שנחזור אליו — מ-SMS (השיב למקש), ממייל (״חזרו אליי״) ובהמשך מ-WhatsApp.</p></div>
        <div className="mc-actions">
          {view !== "replies" && <a className="lw-btn" href={`/api/messaging/callbacks?format=csv${qs ? "&" + qs : ""}`}>ייצוא לאקסל</a>}
          <Link className="lw-btn lw-btn-primary" href="/admin/messaging/campaigns/new">+ קמפיין חדש</Link>
        </div>
      </div>

      <div className="mc-tabs" role="tablist">
        <button role="tab" aria-selected={view !== "replies"} onClick={() => setView("")}>לחזור אליהם</button>
        <button role="tab" aria-selected={view === "replies"} onClick={() => setView("replies")}>תשובות לטיפול{inb?.open ? ` (${n(inb.open)})` : ""}</button>
      </div>
      {err && <SetupNotice error={err} />}

      {view !== "replies" && <>
        <div className="mc-grid k4">
          {STATUS.map(([k, l]) => <button key={k} type="button" className="mc-card mc-kpi" style={{ textAlign: "start", cursor: "pointer", outline: status === k ? "2px solid var(--sh-green)" : undefined }} onClick={() => setStatus(status === k ? "" : k)}>
            <span>{l}</span><b>{n(counts[k])}</b></button>)}
        </div>
        <div className="mc-actions" style={{ flexWrap: "wrap", margin: "14px 0" }}>
          <label className="mc-search"><input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש שם, טלפון או מייל" /></label>
          <select className="lw-select" value={channel} onChange={e => setChannel(e.target.value)}><option value="">כל הערוצים</option><option value="sms">SMS</option><option value="email">מייל</option><option value="whatsapp">WhatsApp</option></select>
          <select className="lw-select" value={campaign} onChange={e => setCampaign(e.target.value)}><option value="">כל הקמפיינים</option>{(d?.campaigns || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="mc-field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>מ-<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="mc-field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>עד<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          {(status || channel || campaign || q || from || to) && <button type="button" className="lw-link" onClick={() => { setStatus(""); setChannel(""); setCampaign(""); setQ(""); setFrom(""); setTo("") }}>ניקוי סינון</button>}
        </div>
        <div className="lw-card"><div className="mc-table-wrap"><table className="mc-table">
          <thead><tr><th>שם</th><th>טלפון / מייל</th><th>קמפיין</th><th>בקשה</th><th>סטטוס</th><th>מטפל</th><th>הערה</th><th>נכנס</th></tr></thead>
          <tbody>
            {(d?.callbacks || []).map((c: any) => <tr key={c.id}>
              <td><b>{c.full_name || "ללא שם"}</b>{c.city && <span className="mc-sub">{c.city}</span>}</td>
              <td>{c.phone && <a className="mc-link mc-ltr" href={`tel:${local(c.phone)}`}>{local(c.phone)}</a>}{c.email && <span className="mc-sub mc-ltr">{c.email}</span>}</td>
              <td>{c.campaign_id ? <Link className="mc-link" href={`/admin/messaging/campaigns/${c.campaign_id}`}>{c.campaign_name}</Link> : "—"}<span className="mc-sub">{CH_LABEL[c.channel]}</span></td>
              <td style={{ maxWidth: 220 }}>{c.request_text}</td>
              <td><select className="lw-select" aria-label="סטטוס" disabled={!can.edit} value={c.status} onChange={e => patch(c.id, { status: e.target.value })}>
                {STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
              <td><select className="lw-select" aria-label="מטפל" disabled={!can.edit} value={c.assignee_id || ""} onChange={e => patch(c.id, { assignee_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>{(d?.staff || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
              <td><NoteCell value={c.note} disabled={!can.edit} onSave={v => patch(c.id, { note: v })} /></td>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDate(c.created_at)}<span className={`mc-pill ${ST[c.status]?.c}`} style={{ marginInlineStart: 6 }}>{ST[c.status]?.l}</span></td>
            </tr>)}
            {d && !d.callbacks.length && <tr><td colSpan={8}><div className="mc-empty"><b>אין כאן אף אחד כרגע</b><span>מי שישיב למקש ״לחזור אליו״ בקמפיין SMS, או ילחץ ״חזרו אליי״ במייל, יופיע כאן.</span></div></td></tr>}
            {!d && !err && <tr><td colSpan={8}><div className="lw-skel" /></td></tr>}
          </tbody>
        </table></div></div>
        {d?.callbacks?.length >= 500 && <p className="mc-sub">מוצגות 500 הרשומות הראשונות — אפשר לצמצם בסינון, והייצוא כולל את כולן.</p>}
      </>}

      {view === "replies" && <>
        <p className="mc-sub" style={{ marginBottom: 10 }}>תשובות שהמערכת לא זיהתה כמקש מהתפריט (למשל ״מתי זה?״). אפשר להעביר ללידים מקמפיינים או לסגור.</p>
        <div className="lw-card"><div className="mc-table-wrap"><table className="mc-table">
          <thead><tr><th>מאת</th><th>תשובה</th><th>קמפיין</th><th>התקבל</th><th /></tr></thead>
          <tbody>
            {(inb?.inbound || []).map((m: any) => <tr key={m.id}>
              <td><b>{m.full_name || "—"}</b><a className="mc-sub mc-ltr mc-link" href={`tel:${local(m.from_norm)}`}>{local(m.from_norm)}</a></td>
              <td style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>{m.body}</td>
              <td>{m.campaign_id ? <Link className="mc-link" href={`/admin/messaging/campaigns/${m.campaign_id}`}>{m.campaign_name}</Link> : <span className="mc-sub" style={{ marginTop: 0 }}>לא משויך לקמפיין</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDate(m.received_at)}</td>
              <td><span className="mc-actions">
                <button type="button" className="lw-btn" onClick={() => closeReply(m.id, true)}>לחזור אליו</button>
                <button type="button" className="lw-link" onClick={() => closeReply(m.id, false)}>סגירה</button></span></td>
            </tr>)}
            {inb && !inb.inbound.length && <tr><td colSpan={5}><div className="mc-empty"><b>אין תשובות שממתינות לטיפול</b></div></td></tr>}
          </tbody>
        </table></div></div>
      </>}
    </div>
  )
}

function NoteCell({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value || "")
  useEffect(() => setV(value || ""), [value])
  return <input style={{ minWidth: 140, border: "1px solid var(--sh-line)", borderRadius: 10, padding: "7px 10px", font: "inherit", fontSize: 13, background: "#fff" }} value={v} disabled={disabled} placeholder="הערה…" onChange={e => setV(e.target.value)}
    onBlur={() => { if (v !== (value || "")) onSave(v) }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
}
