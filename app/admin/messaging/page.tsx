"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useUrlState } from "@/lib/use-url-state"
import { useToast } from "@/components/ui/Toast"
import Sheet from "@/components/shell/Sheet"
import { api, CH_LABEL, StatusPill, fmtDate, n, SetupNotice } from "@/components/messaging/ui"

const TABS = [["overview", "סקירה"], ["audiences", "קהלים ונמענים"], ["campaigns", "קמפיינים"], ["imports", "ייבוא"], ["connections", "חיבורים"]] as const

export default function MessagingCenter() {
  const [tab, setTab] = useUrlState("tab", "overview")
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [data, setData] = useState<any>(null)
  const [aud, setAud] = useState<any[] | null>(null)
  const [camps, setCamps] = useState<any[] | null>(null)
  const [jobs, setJobs] = useState<any[] | null>(null)
  const [conn, setConn] = useState<any>(null)
  const [err, setErr] = useState<any>(null)
  const [newAud, setNewAud] = useState(false)
  const [audForm, setAudForm] = useState({ name: "", description: "", source: "" })
  const [busy, setBusy] = useState(false)
  const [chFilter, setChFilter] = useUrlState("ch")

  const load = useCallback(async () => {
    setErr(null)
    try {
      if (tab === "overview") setData(await api("/api/messaging/overview"))
      if (tab === "audiences") setAud((await api("/api/messaging/audiences")).audiences)
      if (tab === "campaigns") setCamps((await api(`/api/messaging/campaigns${chFilter ? `?channel=${chFilter}` : ""}`)).campaigns)
      if (tab === "imports") setJobs((await api("/api/messaging/imports")).jobs)
      if (tab === "connections") setConn(await api("/api/messaging/connections?verify=1"))
    } catch (e) { setErr(e) }
  }, [tab, chFilter])
  useEffect(() => { load() }, [load])
  const can = data?.can || { edit: true, send: false }

  async function createAudience() {
    if (!audForm.name.trim()) { toastError("יש להזין שם לקהל"); return }
    setBusy(true)
    try {
      const d = await api("/api/messaging/audiences", "POST", audForm)
      success("הקהל נוצר"); setNewAud(false); setAudForm({ name: "", description: "", source: "" })
      router.push(`/admin/messaging/audiences/${d.audience.id}`)
    } catch (e: any) { toastError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="mc-ws">
      <div className="mc-head">
        <div>
          <h1>מרכז דיוורים</h1>
          <p>קהלים משותפים לכל הערוצים, ייבוא מסודר, וקמפיינים במייל, SMS ו-WhatsApp — כל ערוץ עם התוכן והמגבלות שלו.</p>
        </div>
        <div className="mc-actions">
          <Link className="lw-btn" href="/admin/newsletter">הניוזלטר הקיים</Link>
          <Link className="lw-btn" href="/admin/messaging/import">ייבוא נמענים</Link>
          <button type="button" className="lw-btn" onClick={() => setNewAud(true)}>קהל חדש</button>
          <Link className="lw-btn lw-btn-primary" href="/admin/messaging/campaigns/new">+ קמפיין חדש</Link>
        </div>
      </div>

      <div className="mc-tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k === "overview" ? "" : k)}>{l}</button>)}
      </div>

      {err && <SetupNotice error={err} />}

      {tab === "overview" && data && <>
        <div className="mc-grid k4">
          <div className="mc-card mc-kpi"><span>נמענים במאגר</span><b>{n(data.counts.recipients)}</b><small>{n(data.counts.audiences)} קהלים</small></div>
          <div className="mc-card mc-kpi"><span>טיוטות</span><b>{n(data.counts.drafts)}</b><small>{n(data.counts.scheduled)} מתוזמנים</small></div>
          <div className="mc-card mc-kpi"><span>בשליחה עכשיו</span><b>{n(data.counts.sending)}</b><small>קמפיינים בתור</small></div>
          <div className="mc-card mc-kpi"><span>כתובות חסומות / הוסרו</span><b>{n(data.counts.suppressed)}</b><small>לא יקבלו דיוור שיווקי</small></div>
        </div>
        <div className="mc-section"><h2>מצב הערוצים</h2><button type="button" className="lw-link" onClick={() => setTab("connections")}>לפרטי החיבורים</button></div>
        <div className="mc-grid k3">
          {(["email", "sms", "whatsapp"] as const).map(ch => {
            const c = data.connections[ch]
            return <div key={ch} className="mc-card">
              <h3>{CH_LABEL[ch]} <span className={`mc-pill ${c.connected ? "green" : "amber"}`} style={{ marginInlineStart: 6 }}><span className="mc-dot" />{c.connected ? "מחובר" : "טרם חובר"}</span></h3>
              <p className="mc-sub" style={{ marginTop: 0 }}>{c.connected ? `ספק: ${c.provider}` : "אפשר להכין טיוטות. שליחה חסומה עד חיבור ואימות."}</p>
            </div>
          })}
        </div>
        {data.newsletter && <>
          <div className="mc-section"><h2>הניוזלטר הקיים</h2><Link className="lw-link" href="/admin/newsletter">לניהול הניוזלטר</Link></div>
          <div className="mc-card" style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14 }}>
            <span><b>{n(data.newsletter.active)}</b> נרשמים פעילים (מסונכרנים לקהל ״נרשמי הניוזלטר״)</span>
            <span><b>{n(data.newsletter.open_issues)}</b> גיליונות בטיוטה/תזמון</span>
            <span>גיליון אחרון: {fmtDate(data.newsletter.last_sent)}</span>
          </div>
        </>}
        <div className="mc-section"><h2>קמפיינים אחרונים</h2><button type="button" className="lw-link" onClick={() => setTab("campaigns")}>לכל הקמפיינים</button></div>
        <CampaignTable rows={data.campaigns} />
      </>}

      {tab === "audiences" && aud && (
        <div className="lw-card">
          <div className="mc-table-wrap"><table className="mc-table">
            <thead><tr><th>קהל</th><th>מקור</th><th className="num">אנשים</th><th>כשירים לפי ערוץ</th><th>אחראי</th></tr></thead>
            <tbody>
              {aud.map(a => <tr key={a.id}>
                <td><Link className="mc-link" href={`/admin/messaging/audiences/${a.id}`}>{a.name}</Link>{a.system_key && <span className="mc-pill blue" style={{ marginInlineStart: 6 }}>מסונכרן</span>}<span className="mc-sub">{a.description}</span></td>
                <td>{a.source || "—"}</td>
                <td className="num">{n(a.people)}</td>
                <td><div className="mc-chan"><span>מייל <b>{n(a.email_ok)}</b></span><span>· SMS <b>{n(a.sms_ok)}</b></span><span>· WhatsApp <b>{n(a.wa_ok)}</b></span></div></td>
                <td>{a.owner || a.created_by || "—"}</td>
              </tr>)}
              {!aud.length && <tr><td colSpan={5}><div className="mc-empty"><b>אין עדיין קהלים</b>צרו קהל וייבאו אליו נמענים מקובץ או מהמערכת.</div></td></tr>}
            </tbody>
          </table></div>
          <p className="mc-sub" style={{ padding: "10px 14px" }}>״כשירים״ = פרט תקין, הסכמה מתועדת לערוץ וללא הסרה או חסימה. הערוצים חופפים ולכן לא מחברים אותם.</p>
        </div>
      )}

      {tab === "campaigns" && camps && <>
        <div className="mc-actions" style={{ marginBottom: 12 }}>
          <div className="mc-seg" role="group" aria-label="סינון לפי ערוץ">
            {[["", "הכול"], ["email", "מייל"], ["sms", "SMS"], ["whatsapp", "WhatsApp"]].map(([k, l]) => <button key={k} type="button" aria-pressed={(chFilter || "") === k} onClick={() => setChFilter(k)}>{l}</button>)}
          </div>
        </div>
        <CampaignTable rows={camps} />
      </>}

      {tab === "imports" && jobs && (
        <div className="lw-card"><div className="mc-table-wrap"><table className="mc-table">
          <thead><tr><th>קובץ / מקור</th><th>קהל</th><th>מצב</th><th className="num">שורות</th><th>תוצאה</th><th>מי ומתי</th></tr></thead>
          <tbody>
            {jobs.map(j => <tr key={j.id}>
              <td><Link className="mc-link" href={`/admin/messaging/import?job=${j.id}`}>{j.file_name || `ייבוא #${j.id}`}</Link></td>
              <td>{j.audience_name || "—"}</td>
              <td><span className={`mc-pill ${j.status === "done" ? "green" : j.status === "cancelled" ? "" : "amber"}`}>{({ uploaded: "הועלה", validated: "נבדק — ממתין לאישור", importing: "בייבוא", done: "הושלם", failed: "נכשל", cancelled: "בוטל" } as any)[j.status] || j.status}</span></td>
              <td className="num">{n(j.total_rows)}</td>
              <td><span className="mc-sub" style={{ marginTop: 0 }}>{j.counts?.new != null ? `${n(j.counts.new)} חדשים · ${n(j.counts.existing)} קיימים · ${n((j.counts.invalid || 0) + (j.counts.duplicate || 0) + (j.counts.conflict || 0))} דולגו` : "—"}</span></td>
              <td>{j.created_by}<span className="mc-sub">{fmtDate(j.created_at)}</span></td>
            </tr>)}
            {!jobs.length && <tr><td colSpan={6}><div className="mc-empty"><b>עדיין לא בוצע ייבוא</b><Link className="lw-link" href="/admin/messaging/import">לייבוא ראשון</Link></div></td></tr>}
          </tbody>
        </table></div></div>
      )}

      {tab === "connections" && conn && <>
        <div className="mc-note">החיבורים מוגדרים במשתני הסביבה בשרת בלבד — שום מפתח לא מגיע לדפדפן. כל עוד ערוץ לא מחובר אפשר להכין בו טיוטות, אבל אי אפשר לאשר שליחה.</div>
        <div className="mc-grid k3">
          {(["email", "sms", "whatsapp"] as const).map(ch => {
            const c = conn.connections[ch]
            return <div key={ch} className="mc-card">
              <h3>{CH_LABEL[ch]} <span className={`mc-pill ${c.connected ? "green" : "amber"}`} style={{ marginInlineStart: 6 }}><span className="mc-dot" />{c.connected ? "מחובר" : "טרם חובר"}</span></h3>
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>ספק: <b>{c.provider}</b></div>
              {ch === "email" && conn.from !== undefined && <div style={{ fontSize: 13 }}>שולח: <span className="mc-ltr">{conn.from || "לא הוגדר"}</span></div>}
              {ch === "email" && conn.domain && <div style={{ fontSize: 13 }}>דומיין <span className="mc-ltr">{conn.domain.name}</span>: <b>{conn.domain.status === "verified" ? "מאומת" : conn.domain.status === "not_found" ? "לא נמצא בחשבון" : conn.domain.status}</b></div>}
              <p className="mc-sub">{c.note}</p>
              {!c.connected && <><div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>מה חסר להפעלה:</div><ul style={{ margin: "6px 0 0", paddingInlineStart: 18, fontSize: 12.5, lineHeight: 1.8, color: "var(--sh-muted)" }}>{c.missing.map((m: string) => <li key={m}>{m}</li>)}</ul></>}
            </div>
          })}
        </div>
      </>}

      <Sheet open={newAud} onClose={() => setNewAud(false)} title="קהל חדש" subtitle="רשימה פנימית. נמען יכול להשתייך לכמה קהלים ולקבל הודעה אחת בכל קמפיין."
        footer={<><button type="button" className="lw-btn lw-btn-primary" disabled={busy} onClick={createAudience}>{busy ? "יוצר…" : "יצירת קהל"}</button><button type="button" className="lw-btn" onClick={() => setNewAud(false)}>ביטול</button></>}>
        <div className="mc-form">
          <label className="mc-field full">שם הקהל *<input value={audForm.name} onChange={e => setAudForm(f => ({ ...f, name: e.target.value }))} placeholder="למשל: שותפים בירושלים" /></label>
          <label className="mc-field full">תיאור<textarea value={audForm.description} onChange={e => setAudForm(f => ({ ...f, description: e.target.value }))} rows={2} /></label>
          <label className="mc-field full">מקור<input value={audForm.source} onChange={e => setAudForm(f => ({ ...f, source: e.target.value }))} placeholder="למשל: נרשמי מפגש אוקטובר" /></label>
        </div>
      </Sheet>
      {!can.edit && tab !== "connections" && <p className="mc-sub">יש לך הרשאת צפייה בלבד במרכז הדיוורים.</p>}
    </div>
  )
}

function CampaignTable({ rows }: { rows: any[] }) {
  return <div className="lw-card"><div className="mc-table-wrap"><table className="mc-table">
    <thead><tr><th>קמפיין</th><th>ערוץ</th><th>מצב</th><th>קהל</th><th className="num">נמענים</th><th className="num">התקבלו בספק</th><th>מועד</th></tr></thead>
    <tbody>
      {rows.map(c => <tr key={c.id}>
        <td><Link className="mc-link" href={`/admin/messaging/campaigns/${c.id}`}>{c.name}</Link>{c.goal && <span className="mc-sub">{c.goal}</span>}</td>
        <td>{CH_LABEL[c.channel]}</td>
        <td><StatusPill status={c.status} /></td>
        <td><span className="mc-sub" style={{ marginTop: 0 }}>{c.audience_names || "—"}</span></td>
        <td className="num">{c.queued_total ? n(c.queued_total) : c.stats?.eligible != null ? n(c.stats.eligible) : "—"}</td>
        <td className="num">{c.queued_total ? n(c.accepted) : "—"}</td>
        <td>{fmtDate(c.completed_at || c.scheduled_at || c.updated_at)}</td>
      </tr>)}
      {!rows.length && <tr><td colSpan={7}><div className="mc-empty"><b>אין קמפיינים להצגה</b><Link className="lw-link" href="/admin/messaging/campaigns/new">+ קמפיין חדש</Link></div></td></tr>}
    </tbody>
  </table></div></div>
}
