"use client"
import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import Sheet from "@/components/shell/Sheet"
import { Icon } from "@/components/shell/icons"
import { api, n, fmtDate, SetupNotice, CH_LABEL } from "@/components/messaging/ui"

const REASON: Record<string, string> = { no_address: "אין פרט לערוץ", invalid: "פרט לא תקין", suppressed: "הוסרו / חסומים", consent_revoked: "ביקשו הסרה", consent_unknown: "הרשאה לא ידועה" }
const CONSENT: Record<string, [string, string]> = { granted: ["מאושר", "green"], revoked: ["הוסר", "red"], unknown: ["לא ידוע", ""] }

export default function AudiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<any>(null)
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [person, setPerson] = useState<any>(null)
  const [crmOpen, setCrmOpen] = useState(false)
  const [crm, setCrm] = useState({ source: "contacts", type: "", owner: "", city: "", channels: [] as string[], consentSource: "" })
  const [editOpen, setEditOpen] = useState(false)
  const [edit, setEdit] = useState({ name: "", description: "", owner: "" })
  const [busy, setBusy] = useState(false)
  const [consentForm, setConsentForm] = useState({ channel: "email", source: "" })

  const load = useCallback(async () => {
    try { setD(await api(`/api/messaging/audiences/${id}?q=${encodeURIComponent(q)}&page=${page}`)); setErr(null) } catch (e) { setErr(e) }
  }, [id, q, page])
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t) }, [load, q])
  useEffect(() => { setPage(1); setSel(new Set()) }, [q])

  async function openPerson(rid: number) {
    try { setPerson(await api(`/api/messaging/recipients/${rid}`)) } catch (e: any) { toastError(e.message) }
  }
  async function personAction(body: any, done: string) {
    try { await api(`/api/messaging/recipients/${person.recipient.id}`, "PATCH", body); success(done); await openPerson(person.recipient.id); load() }
    catch (e: any) { toastError(e.message) }
  }
  async function removeSelected() {
    if (!confirm(`להסיר ${sel.size} נמענים מהקהל? הם נשארים במאגר ובקהלים אחרים.`)) return
    try { const r = await api(`/api/messaging/audiences/${id}`, "DELETE", { recipient_ids: [...sel] }); success(`${r.removed} הוסרו מהקהל`); setSel(new Set()); load() }
    catch (e: any) { toastError(e.message) }
  }
  async function fromCrm() {
    if (crm.channels.length && !crm.consentSource.trim()) { toastError("יש לתעד את מקור ההסכמה"); return }
    setBusy(true)
    try {
      const r = await api(`/api/messaging/audiences/${id}/crm`, "POST", { source: crm.source, filters: { type: crm.type, owner: crm.owner, city: crm.city }, consent_basis: crm.channels.length ? { channels: crm.channels, source: crm.consentSource } : null })
      router.push(`/admin/messaging/import?job=${r.job_id}`)
    } catch (e: any) { toastError(e.message) } finally { setBusy(false) }
  }
  async function saveEdit(archived = false) {
    try {
      await api("/api/messaging/audiences", "PATCH", archived ? { id: Number(id), archived: true } : { id: Number(id), ...edit })
      success(archived ? "הקהל הועבר לארכיון" : "הקהל עודכן")
      if (archived) router.push("/admin/messaging?tab=audiences"); else { setEditOpen(false); load() }
    } catch (e: any) { toastError(e.message) }
  }

  if (err) return <div className="mc-ws"><SetupNotice error={err} /></div>
  if (!d) return <div className="mc-ws"><div className="lw-skel" style={{ borderRadius: 16 }} /></div>
  const a = d.audience
  const canEdit = d.can?.edit
  const pages = Math.max(1, Math.ceil(d.total / d.size))

  return (
    <div className="mc-ws">
      <div className="mc-crumb"><Link href="/admin/messaging?tab=audiences">מרכז דיוורים / קהלים</Link></div>
      <div className="mc-head">
        <div>
          <h1>{a.name}</h1>
          <p>{a.description || "—"}{a.source ? ` · מקור: ${a.source}` : ""}{a.system_key ? " · מסונכרן אוטומטית מהניוזלטר" : ""}</p>
        </div>
        {canEdit && !a.system_key && <div className="mc-actions">
          <button type="button" className="lw-btn" onClick={() => { setEdit({ name: a.name, description: a.description, owner: a.owner }); setEditOpen(true) }}>עריכה</button>
          <button type="button" className="lw-btn" onClick={() => setCrmOpen(true)}>הוספה מתוך המערכת</button>
          <Link className="lw-btn lw-btn-primary" href={`/admin/messaging/import?audience=${a.id}`}>ייבוא מקובץ</Link>
        </div>}
      </div>

      <div className="mc-grid k3">
        {(["email", "sms", "whatsapp"] as const).map(ch => {
          const e = d.eligibility[ch]
          return <div key={ch} className="mc-card">
            <div className="mc-kpi"><span>כשירים ל{CH_LABEL[ch]}</span><b>{n(e.eligible)}</b><small>מתוך {n(e.selected)} אנשים בקהל</small></div>
            <div className="mc-bar"><i style={{ width: `${e.selected ? Math.round(e.eligible / e.selected * 100) : 0}%` }} /></div>
            <div style={{ fontSize: 12, color: "var(--sh-muted)", marginTop: 8, lineHeight: 1.8 }}>
              {Object.entries(e.reasons).filter(([, v]) => Number(v) > 0).map(([k, v]) => <div key={k}>{REASON[k]}: <b>{n(v)}</b></div>)}
            </div>
          </div>
        })}
      </div>

      <div className="mc-section"><h2>נמענים <span className="mc-pill">{n(d.total)}</span></h2>
        {canEdit && sel.size > 0 && !a.system_key && <button type="button" className="lw-btn lw-btn-danger" onClick={removeSelected}>הסרת {sel.size} מהקהל</button>}
      </div>
      <div className="mc-actions" style={{ marginBottom: 10 }}>
        <label className="mc-search"><Icon name="search" size={18} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם, מייל או טלפון" aria-label="חיפוש נמענים" /></label>
      </div>
      <div className="lw-card"><div className="mc-table-wrap"><table className="mc-table">
        <thead><tr>{canEdit && !a.system_key && <th style={{ width: 40 }} />}<th>שם</th><th>מייל</th><th>טלפון</th><th>הרשאות</th><th>קישור במערכת</th></tr></thead>
        <tbody>
          {d.members.map((m: any) => {
            const em = (m.endpoints || []).find((e: any) => e.kind === "email")
            const ph = (m.endpoints || []).find((e: any) => e.kind === "phone")
            const c = m.consents || {}
            return <tr key={m.id}>
              {canEdit && !a.system_key && <td><input type="checkbox" checked={sel.has(m.id)} aria-label={`בחירת ${m.full_name}`} onChange={() => setSel(s => { const x = new Set(s); x.has(m.id) ? x.delete(m.id) : x.add(m.id); return x })} style={{ accentColor: "var(--sh-green)", width: 16, height: 16 }} /></td>}
              <td><button type="button" className="mc-link" onClick={() => openPerson(m.id)}>{m.full_name || "ללא שם"}</button><span className="mc-sub">{[m.city, m.org].filter(Boolean).join(" · ")}</span></td>
              <td className="mc-ltr">{em ? <>{em.value}{!em.valid && <span className="mc-pill red" style={{ marginInlineStart: 6 }}>לא תקין</span>}{em.suppressed && <span className="mc-pill amber" style={{ marginInlineStart: 6 }}>הוסר</span>}</> : "—"}</td>
              <td className="mc-ltr">{ph ? <>{ph.value}{ph.suppressed && <span className="mc-pill amber" style={{ marginInlineStart: 6 }}>חסום</span>}</> : "—"}</td>
              <td><div className="mc-chan">{(["email", "sms", "whatsapp"] as const).map(ch => { const [l, t] = CONSENT[c[ch] || "unknown"]; return <span key={ch} className={`mc-pill ${t}`}>{CH_LABEL[ch]}: {l}</span> })}</div></td>
              <td><span className="mc-sub" style={{ marginTop: 0 }}>{[m.newsletter_subscriber_id && "נרשם לניוזלטר", m.lead_id && <Link key="l" href={`/admin/leads?open=${m.lead_id}`} className="lw-link">ליד</Link>, m.contact_id && <Link key="c" href={`/admin/contacts?open=${m.contact_id}`} className="lw-link">איש קשר</Link>].filter(Boolean).map((x, i) => <span key={i} style={{ marginInlineEnd: 8 }}>{x}</span>)}</span></td>
            </tr>
          })}
          {!d.members.length && <tr><td colSpan={6}><div className="mc-empty"><b>{q ? "לא נמצאו נמענים מתאימים" : "הקהל ריק"}</b>{!q && canEdit && !a.system_key && <Link className="lw-link" href={`/admin/messaging/import?audience=${a.id}`}>ייבוא נמענים</Link>}</div></td></tr>}
        </tbody>
      </table></div>
        {pages > 1 && <div className="mc-actions" style={{ justifyContent: "center", padding: 12 }}>
          <button type="button" className="lw-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>הקודם</button>
          <span className="mc-sub" style={{ marginTop: 0 }}>עמוד {page} מתוך {pages}</span>
          <button type="button" className="lw-btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>הבא</button>
        </div>}
      </div>

      {d.imports.length > 0 && <>
        <div className="mc-section"><h2>היסטוריית ייבוא</h2></div>
        <div className="lw-card"><div className="mc-table-wrap"><table className="mc-table">
          <thead><tr><th>מקור</th><th>מצב</th><th>תוצאה</th><th>מי ומתי</th></tr></thead>
          <tbody>{d.imports.map((j: any) => <tr key={j.id}>
            <td><Link className="mc-link" href={`/admin/messaging/import?job=${j.id}`}>{j.file_name || `ייבוא #${j.id}`}</Link></td>
            <td>{({ uploaded: "הועלה", validated: "ממתין לאישור", importing: "בייבוא", done: "הושלם", cancelled: "בוטל", failed: "נכשל" } as any)[j.status]}</td>
            <td><span className="mc-sub" style={{ marginTop: 0 }}>{j.counts?.new != null ? `${n(j.counts.new)} חדשים · ${n(j.counts.existing)} קיימים · ${n((j.counts.invalid || 0) + (j.counts.duplicate || 0) + (j.counts.conflict || 0))} דולגו${j.counts.undone ? ` · ${n(j.counts.undone)} בוטלו` : ""}` : "—"}</span></td>
            <td>{j.created_by}<span className="mc-sub">{fmtDate(j.created_at)}</span></td>
          </tr>)}</tbody>
        </table></div></div>
      </>}

      {/* Recipient */}
      <Sheet open={!!person} onClose={() => setPerson(null)} variant="side" title={person?.recipient?.full_name || "נמען"} subtitle={person ? [person.recipient.city, person.recipient.org].filter(Boolean).join(" · ") || undefined : undefined}>
        {person && <>
          <section className="ld-sec"><h3>פרטי קשר</h3>
            {person.endpoints.map((e: any) => <div key={e.kind + e.value_norm} className="ld-row"><span>{e.kind === "email" ? "מייל" : "טלפון"}</span><b className="mc-ltr">{e.value_norm}{!e.is_valid ? " (לא תקין)" : ""}</b></div>)}
            {!person.endpoints.length && <p className="ld-notes lw-none">אין פרטי קשר</p>}
          </section>
          <section className="ld-sec"><h3>הסרות וחסימות</h3>
            {person.suppressions.map((s: any, i: number) => <div key={i} className="ld-row"><span>{({ unsubscribe: "הסרה", bounce: "החזרה", complaint: "תלונה", manual: "הסרה ידנית", stop: "STOP" } as any)[s.reason]} · {s.channel === "all" ? "כל הערוצים" : CH_LABEL[s.channel]}</span><b>{fmtDate(s.created_at)}</b></div>)}
            {!person.suppressions.length && <p className="ld-notes lw-none">אין</p>}
          </section>
          <section className="ld-sec"><h3>יומן הרשאות</h3>
            {person.consents.map((c: any, i: number) => <div key={i} className="ld-row"><span>{CH_LABEL[c.channel]}: {CONSENT[c.status]?.[0]}<span className="mc-sub">{c.source}{c.created_by ? ` · ${c.created_by}` : ""}</span></span><b>{fmtDate(c.created_at)}</b></div>)}
            {!person.consents.length && <p className="ld-notes lw-none">אין תיעוד — ההרשאה לא ידועה</p>}
          </section>
          <section className="ld-sec"><h3>קהלים</h3><p className="ld-notes">{person.audiences.map((x: any) => x.name).join(" · ") || "—"}</p></section>
          {person.deliveries.length > 0 && <section className="ld-sec"><h3>קמפיינים</h3>{person.deliveries.map((x: any, i: number) => <div key={i} className="ld-row"><span>{x.name} · {CH_LABEL[x.channel]}</span><b>{x.status}</b></div>)}</section>}
          {person.can?.edit && <section className="ld-sec"><h3>עדכון הרשאה</h3>
            <div className="mc-form" style={{ padding: "8px 0 12px" }}>
              <label className="mc-field">ערוץ<select value={consentForm.channel} onChange={e => setConsentForm(f => ({ ...f, channel: e.target.value }))}>{Object.entries(CH_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="mc-field">מקור / תיעוד *<input value={consentForm.source} onChange={e => setConsentForm(f => ({ ...f, source: e.target.value }))} placeholder="למשל: אישר בטלפון 21.10" /></label>
              <div className="full mc-actions">
                <button type="button" className="lw-btn" onClick={() => personAction({ consent: { channel: consentForm.channel, status: "granted", source: consentForm.source } }, "ההסכמה תועדה")}>תיעוד הסכמה</button>
                <button type="button" className="lw-btn" onClick={() => personAction({ resubscribe: { channel: consentForm.channel, source: consentForm.source } }, "ההרשמה חודשה")}>חידוש הרשמה אחרי הסרה</button>
                <button type="button" className="lw-btn lw-btn-danger" onClick={() => { if (confirm("להסיר את הנמען מדיוור שיווקי בערוץ הזה?")) personAction({ suppress: { channel: consentForm.channel } }, "הנמען הוסר מהערוץ") }}>הסרה מהערוץ</button>
                <button type="button" className="lw-btn lw-btn-danger" onClick={() => { if (confirm("להסיר מכל הערוצים השיווקיים?")) personAction({ suppress: { channel: "all" } }, "הנמען הוסר מכל הערוצים") }}>הסרה מכל הערוצים</button>
              </div>
            </div>
          </section>}
        </>}
      </Sheet>

      <Sheet open={crmOpen} onClose={() => setCrmOpen(false)} title="הוספה מתוך המערכת" subtitle="יוצר בדיקת ייבוא לאישור. הרשומות במערכת רק מקושרות — לא נוצר ולא משתנה ליד, שותף או רכז."
        footer={<><button type="button" className="lw-btn lw-btn-primary" disabled={busy} onClick={fromCrm}>{busy ? "מכין…" : "לבדיקה לפני אישור"}</button><button type="button" className="lw-btn" onClick={() => setCrmOpen(false)}>ביטול</button></>}>
        <div className="mc-form">
          <label className="mc-field full">מקור<select value={crm.source} onChange={e => setCrm(c => ({ ...c, source: e.target.value }))}><option value="contacts">אנשי קשר ושותפים</option><option value="parents">הורים שפנו (לידים שסומנו כהורה)</option></select></label>
          {crm.source === "contacts" ? <>
            <label className="mc-field">סוג<select value={crm.type} onChange={e => setCrm(c => ({ ...c, type: e.target.value }))}><option value="">הכול</option><option value="partner">שותף אסטרטגי</option><option value="authority">גורם רשות</option><option value="vendor">ספק חיצוני</option></select></label>
            <label className="mc-field">אחראי<input value={crm.owner} onChange={e => setCrm(c => ({ ...c, owner: e.target.value }))} placeholder="שם הרכז, או ריק לכולם" /></label>
          </> : <label className="mc-field">עיר<input value={crm.city} onChange={e => setCrm(c => ({ ...c, city: e.target.value }))} placeholder="ריק = כל הערים" /></label>}
          <fieldset className="full" style={{ border: "1px solid var(--sh-line)", borderRadius: 12, padding: "10px 14px", margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>הרשאת פנייה</legend>
            <p className="mc-sub" style={{ marginTop: 0 }}>קשר עבודה אינו בהכרח הסכמה לדיוור. בלי תיעוד — ייכנסו כ״הרשאה לא ידועה״.</p>
            {[["email", "מייל"], ["sms", "SMS"], ["whatsapp", "WhatsApp"]].map(([k, l]) => <label key={k} className="mc-check" style={{ display: "inline-flex", marginInlineEnd: 14 }}><input type="checkbox" checked={crm.channels.includes(k)} onChange={e => setCrm(c => ({ ...c, channels: e.target.checked ? [...c.channels, k] : c.channels.filter(x => x !== k) }))} />הסכמה מתועדת ל{l}</label>)}
            {crm.channels.length > 0 && <label className="mc-field">מקור ההסכמה *<input value={crm.consentSource} onChange={e => setCrm(c => ({ ...c, consentSource: e.target.value }))} /></label>}
          </fieldset>
        </div>
      </Sheet>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="עריכת קהל"
        footer={<><button type="button" className="lw-btn lw-btn-primary" onClick={() => saveEdit()}>שמירה</button><button type="button" className="lw-btn lw-btn-danger" onClick={() => { if (confirm("להעביר את הקהל לארכיון? הנמענים נשארים במאגר.")) saveEdit(true) }}>העברה לארכיון</button></>}>
        <div className="mc-form">
          <label className="mc-field full">שם *<input value={edit.name} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} /></label>
          <label className="mc-field full">תיאור<textarea value={edit.description} onChange={e => setEdit(x => ({ ...x, description: e.target.value }))} rows={2} /></label>
          <label className="mc-field full">אחראי<input value={edit.owner} onChange={e => setEdit(x => ({ ...x, owner: e.target.value }))} /></label>
        </div>
      </Sheet>
    </div>
  )
}
