"use client"
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { api, n, fmtDate, StatusPill, SetupNotice, CH_LABEL } from "@/components/messaging/ui"
import { renderEmailHtml, personalizeHtml, personalizeText, renderSms, contentProblems, EMPTY_EMAIL, EMPTY_SMS, EMPTY_WHATSAPP, type EmailContent, type SmsContent, type WhatsappContent } from "@/lib/messaging/render"
import { smsSegments } from "@/lib/messaging/normalize"
import { DEFAULT_REPLIES, type ReplyOption } from "@/lib/messaging/replies"

const STEPS = ["ערוץ ומטרה", "קהל", "תוכן", "בדיקה", "אישור ותזמון"]
const REASON: Record<string, string> = { no_address: "אין פרט לערוץ", invalid: "פרט לא תקין", suppressed: "הוסרו / חסומים", consent_revoked: "ביקשו הסרה", consent_unknown: "הרשאה לא ידועה" }

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<any>(null)
  const load = useCallback(async () => { try { setD(await api(`/api/messaging/campaigns/${id}`)); setErr(null) } catch (e) { setErr(e) } }, [id])
  useEffect(() => { load() }, [load])
  if (err) return <div className="mc-ws"><SetupNotice error={err} /></div>
  if (!d) return <div className="mc-ws"><div className="lw-skel" style={{ borderRadius: 16 }} /></div>
  return d.campaign.status === "draft" ? <Editor data={d} reload={load} /> : <Report data={d} reload={load} />
}

// ─────────────────────────────── editor ───────────────────────────────
function Editor({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const c0 = data.campaign
  const channel: "email" | "sms" | "whatsapp" = c0.channel
  const empty = channel === "email" ? EMPTY_EMAIL : channel === "sms" ? EMPTY_SMS : EMPTY_WHATSAPP
  const [step, setStep] = useState(1)
  const [name, setName] = useState(c0.name)
  const [goal, setGoal] = useState(c0.goal)
  const [aud, setAud] = useState<number[]>(c0.audience_ids || [])
  const [exc, setExc] = useState<number[]>(c0.exclude_audience_ids || [])
  const [content, setContent] = useState<any>({ ...empty, ...(c0.content || {}) })
  const [revision, setRevision] = useState<number>(c0.revision)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [elig, setElig] = useState<any>(null)
  const [testTo, setTestTo] = useState(data.me || "")
  const [testPhones, setTestPhones] = useState("")
  const [testing, setTesting] = useState(false)
  const [mode, setMode] = useState<"now" | "schedule">("now")
  const [when, setWhen] = useState("")
  const [approving, setApproving] = useState(false)
  const [events, setEvents] = useState<any[]>([])
  const conn = data.connection
  const canSend = data.can?.send
  const canEdit = data.can?.edit

  // Edits are counted so a save only clears "dirty" for what it actually sent,
  // and saves are queued so autosave and a step change never race each other
  // with the same revision (which the server would reject as a conflict).
  const edits = useRef(0), savedEdits = useRef(0), revRef = useRef<number>(c0.revision)
  const latest = useRef({ name, goal, aud, exc, content }); latest.current = { name, goal, aud, exc, content }
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))
  const touch = () => { edits.current++; setDirty(true) }
  const setC = (patch: any) => { setContent((c: any) => ({ ...c, ...patch })); touch() }

  const save = useCallback((quiet = false): Promise<boolean> => {
    const run = async () => {
      if (!canEdit) return true
      if (edits.current === savedEdits.current) { if (!quiet) success("הטיוטה נשמרה"); return true }
      const sentAt = edits.current
      setSaving(true)
      try {
        const v = latest.current
        const r = await api(`/api/messaging/campaigns/${c0.id}`, "PATCH", { revision: revRef.current, name: v.name, goal: v.goal, audience_ids: v.aud, exclude_audience_ids: v.exc, content: v.content })
        revRef.current = r.campaign.revision; setRevision(r.campaign.revision)
        savedEdits.current = sentAt; setDirty(edits.current !== sentAt)
        if (!quiet) success("הטיוטה נשמרה")
        return true
      } catch (e: any) { toastError(e.message); return false } finally { setSaving(false) }
    }
    queue.current = queue.current.then(run, run)
    return queue.current
  }, [c0.id, canEdit, success, toastError])

  // Autosave a few seconds after the last change (drafts only).
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => save(true), 2500); return () => clearTimeout(t) }, [dirty, name, goal, aud, exc, content, save])

  async function go(next: number) {
    if (dirty && !(await save(true))) return
    setStep(next)
    if (next >= 2) api(`/api/messaging/campaigns/${c0.id}/eligibility`).then(setElig).catch(() => setElig(null))
  }
  useEffect(() => { if (channel === "email") api("/api/events").then(r => setEvents((r.events || []).filter((e: any) => e.date && e.date.slice(0, 10) >= new Date().toISOString().slice(0, 10)))).catch(() => {}) }, [channel])

  const problems = contentProblems(channel, content)
  const sample = { first_name: "ישראל", full_name: "ישראל ישראלי", unsubscribe_url: "https://example.org/unsubscribe", preferences_url: "https://example.org/preferences" }

  async function sendTest() {
    if (dirty && !(await save(true))) return
    setTesting(true)
    try { const r = await api(`/api/messaging/campaigns/${c0.id}/test`, "POST", { emails: testTo.split(/[,\s]+/).filter(Boolean) }); success(`מייל בדיקה נשלח ל-${r.results.filter((x: any) => x.ok).length} כתובות`) }
    catch (e: any) { toastError(e.message) } finally { setTesting(false) }
  }
  async function sendSmsTest() {
    if (dirty && !(await save(true))) return
    setTesting(true)
    try { const r = await api(`/api/messaging/campaigns/${c0.id}/test`, "POST", { phones: testPhones }); success(`SMS בדיקה נשלח ל-${r.results.length} מספרים`) }
    catch (e: any) { toastError(e.message) } finally { setTesting(false) }
  }
  async function approve() {
    if (dirty && !(await save(true))) return
    const label = mode === "now" ? `לשלוח עכשיו ל-${n(elig?.eligible)} נמענים?` : `לתזמן ל-${new Date(when).toLocaleString("he-IL")} — ${n(elig?.eligible)} נמענים?`
    if (!confirm(`${label}\nהודעה שיצאה אי אפשר להחזיר.`)) return
    setApproving(true)
    try {
      await api(`/api/messaging/campaigns/${c0.id}/approve`, "POST", { revision: revRef.current, mode, scheduled_at: mode === "schedule" ? new Date(when).toISOString() : undefined })
      success(mode === "now" ? "הקמפיין אושר ונכנס לתור השליחה" : "הקמפיין תוזמן")
      await reload()
    } catch (e: any) { toastError(e.message) } finally { setApproving(false) }
  }
  async function remove() {
    if (!confirm("למחוק את הטיוטה?")) return
    try { await api(`/api/messaging/campaigns/${c0.id}`, "DELETE"); router.push("/admin/messaging?tab=campaigns") } catch (e: any) { toastError(e.message) }
  }

  const audiences: any[] = data.audiences
  const links = useMemo(() => {
    if (channel !== "email") return []
    const html = content.mode === "html" ? content.html : renderEmailHtml(content, { orgAddress: "" })
    return [...new Set((String(html).match(/href="(https?:[^"]+)"/g) || []).map((m: string) => m.slice(6, -1)))]
  }, [content, channel])

  return (
    <div className="mc-ws">
      <div className="mc-crumb"><Link href="/admin/messaging?tab=campaigns">מרכז דיוורים / קמפיינים</Link></div>
      <div className="mc-head">
        <div><h1>{name || "קמפיין ללא שם"}</h1><p>{CH_LABEL[channel]} · טיוטה · גרסה {revision}{saving ? " · שומר…" : dirty ? " · יש שינויים שלא נשמרו" : " · נשמר"}</p></div>
        <div className="mc-actions">
          {canEdit && <button type="button" className="lw-btn" onClick={() => save()} disabled={saving}>שמירת טיוטה</button>}
          {canEdit && <button type="button" className="lw-btn lw-btn-danger" onClick={remove}>מחיקה</button>}
        </div>
      </div>
      {!conn.connected && <div className="mc-note"><b>ערוץ {CH_LABEL[channel]} עדיין לא מחובר.</b> אפשר להכין תוכן וטיוטה{channel === "email" ? " ולשלוח מייל בדיקה" : ""}; תזמון ושליחה ייפתחו אחרי חיבור ואימות. <Link className="lw-link" href="/admin/messaging?tab=connections">מה חסר</Link></div>}

      <ol className="mc-steps">{STEPS.map((s, i) => <li key={s}><button type="button" aria-current={step === i + 1 ? "step" : undefined} onClick={() => go(i + 1)}>{s}</button></li>)}</ol>

      {step === 1 && <div className="mc-card"><div className="mc-form">
        <label className="mc-field">שם פנימי<input value={name} onChange={e => { setName(e.target.value); touch() }} /></label>
        <label className="mc-field">ערוץ<input value={CH_LABEL[channel]} disabled /><small>לשליחה בערוץ אחר — <Link className="lw-link" href={`/admin/messaging/campaigns/new?duplicate=${c0.id}`}>שכפול לקמפיין חדש</Link> (המטרה והקהל מועתקים; התוכן נכתב מחדש לערוץ).</small></label>
        <label className="mc-field full">מטרה ופעולה מרכזית<input value={goal} onChange={e => { setGoal(e.target.value); touch() }} placeholder="למשל: הרשמה למפגש ההורים" /></label>
      </div><div className="mc-stepfoot"><span /><button type="button" className="lw-btn lw-btn-primary" onClick={() => go(2)}>המשך לקהל</button></div></div>}

      {step === 2 && <div className="mc-split">
        <div className="mc-card">
          <h2>למי שולחים</h2>
          <p className="mc-sub" style={{ marginBottom: 10 }}>אפשר לבחור כמה קהלים — כל אדם יקבל הודעה אחת בלבד.</p>
          {audiences.map(a => <label key={a.id} className="mc-check"><input type="checkbox" checked={aud.includes(a.id)} onChange={e => { setAud(x => e.target.checked ? [...x, a.id] : x.filter(y => y !== a.id)); setExc(x => x.filter(y => y !== a.id)); touch() }} />{a.name}{a.system_key && <span className="mc-pill blue" style={{ marginInlineStart: 6 }}>מסונכרן</span>}</label>)}
          {canEdit && <div className="mc-note" style={{ marginTop: 12 }}>יש לכם רשימה בקובץ? <Link className="lw-link" href={`/admin/messaging/import?campaign=${c0.id}`}>ייבוא נמענים מקובץ לקמפיין הזה</Link> — ייווצר קהל חדש שיצורף לקמפיין אוטומטית.</div>}
          <h3 style={{ marginTop: 16 }}>החרגות</h3>
          {audiences.filter(a => !aud.includes(a.id)).map(a => <label key={a.id} className="mc-check"><input type="checkbox" checked={exc.includes(a.id)} onChange={e => { setExc(x => e.target.checked ? [...x, a.id] : x.filter(y => y !== a.id)); touch() }} />לא לשלוח למי שב״{a.name}״</label>)}
          <div className="mc-stepfoot"><button type="button" className="lw-btn" onClick={() => go(1)}>חזרה</button><button type="button" className="lw-btn lw-btn-primary" onClick={async () => { await save(true); go(2) }}>חישוב נמענים</button></div>
        </div>
        <EligibilityCard elig={elig} channel={channel} onRefresh={async () => { await save(true); go(2) }} dirty={dirty} />
      </div>}

      {step === 3 && channel === "email" && <EmailEditor content={content as EmailContent} setC={setC} sample={sample} events={events} />}
      {step === 3 && channel === "sms" && <SmsEditor content={content as SmsContent} setC={setC} sample={sample} />}
      {step === 3 && channel === "whatsapp" && <WaEditor content={content as WhatsappContent} setC={setC} sample={sample} />}
      {step === 3 && <div className="mc-stepfoot"><button type="button" className="lw-btn" onClick={() => go(2)}>חזרה</button><button type="button" className="lw-btn lw-btn-primary" onClick={() => go(4)}>לבדיקה</button></div>}

      {step === 4 && <div className="mc-split">
        <div className="mc-card">
          <h2>בדיקה לפני אישור</h2>
          {problems.length ? <div className="mc-note red">{problems.map(p => <div key={p}>• {p}</div>)}</div> : <div className="mc-note ok">התוכן שלם.</div>}
          <section className="ld-sec">
            <div className="ld-row"><span>ערוץ</span><b>{CH_LABEL[channel]} · {conn.connected ? `מחובר (${conn.provider})` : "לא מחובר"}</b></div>
            {channel === "email" && <><div className="ld-row"><span>נושא</span><b>{content.subject || "—"}</b></div>
              <div className="ld-row"><span>טקסט מקדים</span><b>{content.preheader || "—"}</b></div>
              <div className="ld-row"><span>שם שולח</span><b>{content.from_name || "—"}</b></div>
              <div className="ld-row"><span>כתובת שולח</span><b>{conn.connected ? "כתובת מאומתת מהגדרות השרת" : "תוגדר עם חיבור הדומיין"}</b></div>
              <div className="ld-row"><span>Reply-To</span><b className="mc-ltr">{content.reply_to || "—"}</b></div>
              <div className="ld-row"><span>ארכיון ציבורי</span><b>{content.archive ? "כן — עותק כללי בלי פרטים אישיים" : "לא"}</b></div></>}
            <div className="ld-row"><span>קהלים</span><b>{audiences.filter(a => aud.includes(a.id)).map(a => a.name).join(", ") || "—"}{exc.length ? ` (ללא ${audiences.filter(a => exc.includes(a.id)).map(a => a.name).join(", ")})` : ""}</b></div>
            <div className="ld-row"><span>נמענים כשירים</span><b>{elig ? n(elig.eligible) : "…"}</b></div>
            <div className="ld-row"><span>עלות משוערת</span><b>{channel === "email" ? "לפי חבילת הספק" : channel === "sms" ? (elig ? `${n(elig.eligible * Math.max(1, smsSegments(renderSms({ ...EMPTY_SMS, ...content }, sample)).segments))} הודעות מהיתרה ב-019 (+ תשובות אוטומטיות)` : "…") : "תחושב אחרי בחירת ספק"}</b></div>
            {channel === "sms" && <div className="ld-row"><span>תפריט תשובות</span><b>{(content.replies || []).length ? (content.replies as ReplyOption[]).map(r => `${r.key} — ${r.label || (r.callback ? "לחזור אליו" : "תשובה אוטומטית")}`).join(" · ") : "אין (רק ״השב הסר״)"}</b></div>}
          </section>
          {links.length > 0 && <><h3 style={{ marginTop: 14 }}>קישורים בתוכן</h3><ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, lineHeight: 1.9 }}>{links.map(l => <li key={l}><a href={l} target="_blank" rel="noopener noreferrer" className="mc-ltr" style={{ color: "var(--sh-green)" }}>{l}</a></li>)}</ul></>}
          {channel === "email" && <div className="mc-form" style={{ marginTop: 16 }}>
            <label className="mc-field full">שליחת בדיקה לכתובות מפורשות<input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="name@example.org" /><small>עד 5 כתובות. לא נספר בקמפיין ולא משנה מדדים.</small></label>
            <div className="full"><button type="button" className="lw-btn" disabled={testing || problems.length > 0} onClick={sendTest}>{testing ? "שולח…" : "שליחת מייל בדיקה"}</button></div>
          </div>}
          {channel === "sms" && <div className="mc-form" style={{ marginTop: 16 }}>
            <label className="mc-field full">SMS בדיקה למספרים מפורשים<input className="mc-ltr" value={testPhones} onChange={e => setTestPhones(e.target.value)} placeholder="0501234567" /><small>עד 3 מספרים, מופרדים בפסיק. יורד מהיתרה ב-019. אפשר להשיב להודעה ולראות שהתשובה נקלטת.</small></label>
            <div className="full"><button type="button" className="lw-btn" disabled={testing || problems.length > 0 || !conn.connected} onClick={sendSmsTest}>{testing ? "שולח…" : "שליחת SMS בדיקה"}</button></div>
          </div>}
          <div className="mc-stepfoot"><button type="button" className="lw-btn" onClick={() => go(3)}>חזרה</button><button type="button" className="lw-btn lw-btn-primary" onClick={() => go(5)}>לאישור ולתזמון</button></div>
        </div>
        <EligibilityCard elig={elig} channel={channel} onRefresh={() => go(4)} dirty={dirty} />
      </div>}

      {step === 5 && <div className="mc-card" style={{ maxWidth: 760 }}>
        <h2>אישור ותזמון</h2>
        <section className="ld-sec" style={{ marginTop: 10 }}>
          <div className="ld-row"><span>גרסת תוכן</span><b>{revision}</b></div>
          <div className="ld-row"><span>ערוץ</span><b>{CH_LABEL[channel]}</b></div>
          <div className="ld-row"><span>נמענים ייחודיים כשירים</span><b>{elig ? n(elig.eligible) : "…"}</b></div>
          <div className="ld-row"><span>לא ייכללו</span><b>{elig ? n(elig.selected - elig.eligible) : "…"}</b></div>
        </section>
        <p className="mc-sub">ברגע האישור נשמר צילום של רשימת הנמענים ושל גרסת התוכן. ממש לפני המסירה לספק נבדקות שוב הסרות וחסימות — מי שהוסר בינתיים לא יקבל.</p>
        <div className="mc-seg" role="group" aria-label="מועד שליחה" style={{ margin: "10px 0" }}>
          <button type="button" aria-pressed={mode === "now"} onClick={() => setMode("now")}>שליחה עכשיו</button>
          <button type="button" aria-pressed={mode === "schedule"} onClick={() => setMode("schedule")}>תזמון</button>
        </div>
        {mode === "schedule" && <label className="mc-field" style={{ maxWidth: 320 }}>מועד (שעון ישראל)<input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /><small>העבודה ברקע רצה כל כמה דקות; המסירה מתחילה סמוך למועד.</small></label>}
        {!conn.connected && <div className="mc-note" style={{ marginTop: 12 }}>השליחה נעולה — הערוץ אינו מחובר. אפשר לשמור את הטיוטה ולחזור אליה.</div>}
        {!canSend && conn.connected && <div className="mc-note" style={{ marginTop: 12 }}>אישור ושליחה זמינים רק למנהלים עם הרשאת שליחה. הטיוטה נשמרת ומחכה לאישור.</div>}
        {problems.length > 0 && <div className="mc-note red" style={{ marginTop: 12 }}>{problems.join(" · ")} <button type="button" className="lw-link" onClick={() => go(3)}>מעבר לשלב התוכן ←</button></div>}
        <div className="mc-stepfoot">
          <button type="button" className="lw-btn" onClick={() => go(4)}>חזרה</button>
          <button type="button" className="lw-btn lw-btn-primary" disabled={!conn.connected || !canSend || approving || problems.length > 0 || !elig?.eligible || (mode === "schedule" && !when)} onClick={approve}>
            {approving ? "מאשר…" : mode === "now" ? `אישור ושליחה ל-${n(elig?.eligible)}` : "אישור ותזמון"}
          </button>
        </div>
      </div>}
    </div>
  )
}

function EligibilityCard({ elig, channel, onRefresh, dirty }: { elig: any; channel: string; onRefresh: () => void; dirty: boolean }) {
  return <div className="mc-card" style={{ position: "sticky", top: 12 }}>
    <div className="mc-kpi"><span>נמענים כשירים ל{CH_LABEL[channel]}</span><b>{elig ? n(elig.eligible) : "—"}</b><small>{elig ? `מתוך ${n(elig.selected)} אנשים ייחודיים בקהלים שנבחרו` : "בחרו קהל"}</small></div>
    {elig && <div className="mc-bar"><i style={{ width: `${elig.selected ? Math.round(elig.eligible / elig.selected * 100) : 0}%` }} /></div>}
    {elig && <div style={{ fontSize: 12.5, color: "var(--sh-muted)", marginTop: 10, lineHeight: 1.9 }}>
      {Object.entries(elig.reasons).filter(([, v]) => Number(v) > 0).map(([k, v]) => <div key={k}>לא ייכללו — {REASON[k]}: <b>{n(v)}</b></div>)}
    </div>}
    <p className="mc-sub">החישוב נעשה בשרת על כל הקהל, לא על רשימה שמוצגת במסך.</p>
    {dirty && <button type="button" className="lw-link" onClick={onRefresh}>חישוב מחדש</button>}
  </div>
}

// ── channel editors ──
function EmailEditor({ content: c, setC, sample, events }: { content: EmailContent; setC: (p: any) => void; sample: any; events: any[] }) {
  const [view, setView] = useState<"desktop" | "phone">("desktop")
  const [noName, setNoName] = useState(false)
  const html = useMemo(() => personalizeHtml(renderEmailHtml(c, { orgAddress: "כתובת הארגון (מהגדרות השרת)", logoUrl: typeof window !== "undefined" ? `${location.origin}/netivim-logo-white.png` : undefined }), noName ? { ...sample, first_name: "", full_name: "" } : sample), [c, sample, noName])
  const sec = c.sections || []
  return <div className="mc-split">
    <div className="mc-card">
      <div className="mc-form">
        <label className="mc-field full">נושא המייל *<input value={c.subject} onChange={e => setC({ subject: e.target.value })} maxLength={150} /><small>{c.subject.length}/150 · מה הערך לנמען, לא שם הקמפיין.</small></label>
        <label className="mc-field full">טקסט מקדים לתיבת הדואר<input value={c.preheader} onChange={e => setC({ preheader: e.target.value })} maxLength={150} /><small>מוסיף מידע שאינו חזרה על הנושא.</small></label>
        <label className="mc-field">שם השולח<input value={c.from_name} onChange={e => setC({ from_name: e.target.value })} /></label>
        <label className="mc-field">Reply-To<input className="mc-ltr" value={c.reply_to} onChange={e => setC({ reply_to: e.target.value })} placeholder="office@example.org" /></label>
        <div className="full mc-seg" role="group" aria-label="סוג עורך"><button type="button" aria-pressed={c.mode !== "html"} onClick={() => setC({ mode: "blocks" })}>עורך בלוקים</button><button type="button" aria-pressed={c.mode === "html"} onClick={() => setC({ mode: "html" })}>HTML מוכן</button></div>
        {c.mode === "html" ? <>
          <label className="mc-field full">קוד HTML<textarea className="mc-ltr" style={{ minHeight: 260, fontFamily: "monospace", fontSize: 12.5 }} value={c.html} onChange={e => setC({ html: e.target.value })} /><small>סקריפטים, טפסים ומסגרות מוסרים. תמונות צריכות כתובת ציבורית יציבה. אם אין בקוד <span className="mc-ltr">{"{{unsubscribe_url}}"}</span> — תתווסף שורת הסרה.</small></label>
          <label className="mc-field full">או טעינת קובץ HTML<input type="file" accept=".html,.htm" onChange={async e => { const f = e.target.files?.[0]; if (f) setC({ html: await f.text() }) }} /></label>
        </> : <>
          <label className="mc-field full">כותרת<input value={c.title} onChange={e => setC({ title: e.target.value })} /></label>
          <label className="mc-field">פתיח אישי<input value={c.greeting} onChange={e => setC({ greeting: e.target.value })} /><small><span className="mc-ltr">{"{{first_name}}"}</span> = שם פרטי; בלי שם יוצג ״שלום,״.</small></label>
          <label className="mc-field full">פתיחה<textarea value={c.intro} onChange={e => setC({ intro: e.target.value })} rows={3} /></label>
          <div className="full mc-blocks">
            <div className="mc-block-head">התוכן המרכזי</div>
            <label className="mc-field">כותרת<input value={c.main.title} onChange={e => setC({ main: { ...c.main, title: e.target.value } })} /></label>
            <label className="mc-field">טקסט<textarea value={c.main.text} onChange={e => setC({ main: { ...c.main, text: e.target.value } })} rows={4} /></label>
            <div className="mc-form"><label className="mc-field">קישור לתמונה<input className="mc-ltr" value={c.main.image_url} onChange={e => setC({ main: { ...c.main, image_url: e.target.value } })} placeholder="https://" /></label>
              <label className="mc-field">טקסט חלופי לתמונה<input value={c.main.image_alt} onChange={e => setC({ main: { ...c.main, image_alt: e.target.value } })} /></label></div>
          </div>
          {sec.map((s, i) => <div key={i} className="full mc-blocks">
            <div className="mc-block-head">קטע {i + 1}<span className="mc-actions">
              <button type="button" className="lw-link" disabled={i === 0} onClick={() => { const x = [...sec];[x[i - 1], x[i]] = [x[i], x[i - 1]]; setC({ sections: x }) }}>↑</button>
              <button type="button" className="lw-link" disabled={i === sec.length - 1} onClick={() => { const x = [...sec];[x[i + 1], x[i]] = [x[i], x[i + 1]]; setC({ sections: x }) }}>↓</button>
              <button type="button" className="lw-link" style={{ color: "var(--sh-red)" }} onClick={() => setC({ sections: sec.filter((_, j) => j !== i) })}>הסרה</button></span></div>
            <label className="mc-field">כותרת<input value={s.title} onChange={e => setC({ sections: sec.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} /></label>
            <label className="mc-field">טקסט<textarea value={s.text} onChange={e => setC({ sections: sec.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} rows={3} /></label>
          </div>)}
          {sec.length < 4 && <div className="full"><button type="button" className="lw-btn" onClick={() => setC({ sections: [...sec, { title: "", text: "" }] })}>+ קטע המשך</button></div>}
          <div className="full mc-blocks">
            <div className="mc-block-head">אירוע קרוב<span>{c.event ? <button type="button" className="lw-link" style={{ color: "var(--sh-red)" }} onClick={() => setC({ event: null })}>הסרה</button> : null}</span></div>
            {!c.event ? <select className="lw-select" style={{ maxWidth: "none" }} value="" onChange={e => { const ev = events.find(x => String(x.id) === e.target.value); setC({ event: ev ? { name: ev.name, date: new Date(ev.date).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" }) + (ev.time ? ` · ${String(ev.time).slice(0, 5)}` : ""), location: ev.location || "", url: "" } : { name: "", date: "", location: "", url: "" } }) }}>
              <option value="">הוספת אירוע…</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} · {String(ev.date).slice(0, 10)}</option>)}<option value="manual">אירוע אחר (הקלדה)</option>
            </select> : <div className="mc-form">
              <label className="mc-field">שם<input value={c.event.name} onChange={e => setC({ event: { ...c.event!, name: e.target.value } })} /></label>
              <label className="mc-field">מועד<input value={c.event.date} onChange={e => setC({ event: { ...c.event!, date: e.target.value } })} /></label>
              <label className="mc-field">מקום<input value={c.event.location} onChange={e => setC({ event: { ...c.event!, location: e.target.value } })} /></label>
              <label className="mc-field">קישור להרשמה<input className="mc-ltr" value={c.event.url} onChange={e => setC({ event: { ...c.event!, url: e.target.value } })} placeholder="https://" /></label>
            </div>}
          </div>
          <div className="full mc-blocks">
            <div className="mc-block-head">כפתור פעולה מרכזי<span><button type="button" className="lw-link" onClick={() => setC({ cta: { label: c.cta?.label && c.cta.url === "{{callback_url}}" ? c.cta.label : "חזרו אליי", url: "{{callback_url}}" } })}>כפתור ״חזרו אליי״</button></span></div>
            {c.cta?.url === "{{callback_url}}" && <p className="mc-sub" style={{ margin: "0 0 8px" }}>מי שילחץ ייכנס ל״לידים מקמפיינים״ ויקבל דף תודה.</p>}
            <div className="mc-form"><label className="mc-field">טקסט הכפתור<input value={c.cta?.label || ""} onChange={e => setC({ cta: { label: e.target.value, url: c.cta?.url || "" } })} placeholder="למשל: להרשמה למפגש" /></label>
              <label className="mc-field">קישור<input className="mc-ltr" value={c.cta?.url || ""} onChange={e => setC({ cta: { label: c.cta?.label || "", url: e.target.value } })} placeholder="https://" /></label></div>
          </div>
          <label className="mc-field full">סיום<textarea value={c.closing} onChange={e => setC({ closing: e.target.value })} rows={2} /></label>
          <label className="mc-field">חתימה<input value={c.signature} onChange={e => setC({ signature: e.target.value })} /></label>
        </>}
        <label className="mc-check full"><input type="checkbox" checked={!!c.archive} onChange={e => setC({ archive: e.target.checked })} />לפרסם בארכיון הציבורי של הניוזלטר אחרי השליחה (עותק כללי, בלי שם נמען או קישור הסרה אישי)</label>
      </div>
    </div>
    <div className="mc-preview">
      <div className="mc-preview-bar">
        <span>תצוגה מקדימה</span>
        <span className="mc-actions">
          <label className="mc-check" style={{ minHeight: 0, fontSize: 12 }}><input type="checkbox" checked={noName} onChange={e => setNoName(e.target.checked)} />בלי שם</label>
          <span className="mc-seg"><button type="button" aria-pressed={view === "desktop"} onClick={() => setView("desktop")}>מחשב</button><button type="button" aria-pressed={view === "phone"} onClick={() => setView("phone")}>טלפון</button></span>
        </span>
      </div>
      <iframe className={`mc-frame ${view === "phone" ? "phone" : ""}`} title="תצוגה מקדימה של המייל" sandbox="" srcDoc={html} />
      <p className="mc-sub">התצוגה אינה בדיקת תאימות ל-Gmail/Outlook — לכן יש מייל בדיקה.</p>
    </div>
  </div>
}

function SmsEditor({ content: c, setC, sample }: { content: SmsContent; setC: (p: any) => void; sample: any }) {
  const text = renderSms(c, { ...sample, unsubscribe_url: "https://ntvm.co/u/ab12cd" })
  const seg = smsSegments(text)
  const replies: ReplyOption[] = c.replies || []
  const setR = (i: number, patch: Partial<ReplyOption>) => setC({ replies: replies.map((r, j) => j === i ? { ...r, ...patch } : r) })
  const nextKey = String(Math.max(0, ...replies.map(r => Number(r.key) || 0)) + 1)
  return <div className="mc-split">
    <div className="mc-card"><div className="mc-form">
      <div className="full mc-note" style={{ margin: 0 }}>ההודעה יוצאת מהמספר הווירטואלי של נתיבים ב-019, כך שאפשר להשיב לה. תשובות נקלטות במערכת לפי תפריט התשובות שלמטה.</div>
      <label className="mc-field full">טקסט ההודעה *<textarea value={c.text} onChange={e => setC({ text: e.target.value })} rows={5} placeholder={"נתיבים: ערב הסברה על מסלולי שירות ביום ג׳ בבני ברק.\nלשיחה עם רכז השב 1\nלפרטים נוספים השב 2"} /><small><span className="mc-ltr">{"{{first_name}}"}</span> לשם פרטי. כתבו בטקסט עצמו מה להשיב (״השב 1…״).</small></label>
      <label className="mc-field full">דרך הסרה *<input value={c.optout_text} onChange={e => setC({ optout_text: e.target.value })} /><small>״להסרה השב הסר״ עובד ישירות — מי שמשיב ״הסר״ מוסר אוטומטית. אפשר גם קישור <span className="mc-ltr">{"{{unsubscribe_url}}"}</span> (ארוך יותר).</small></label>
      <div className="full mc-blocks">
        <div className="mc-block-head">תפריט תשובות<span className="mc-actions">
          {!replies.length && <button type="button" className="lw-link" onClick={() => setC({ replies: DEFAULT_REPLIES })}>תפריט לדוגמה (1 / 2)</button>}
          <button type="button" className="lw-link" onClick={() => setC({ replies: [...replies, { key: nextKey, label: "", callback: false, reply_text: "" }] })}>+ מקש</button></span></div>
        {!replies.length && <p className="mc-sub" style={{ margin: 0 }}>בלי תפריט — רק ״הסר״ מטופל אוטומטית, וכל תשובה אחרת תגיע ל״תשובות לטיפול״.</p>}
        {replies.map((r, i) => <div key={i} className="mc-form" style={{ borderTop: i ? "1px solid var(--sh-line)" : undefined, paddingTop: i ? 12 : 0, marginTop: i ? 12 : 0 }}>
          <label className="mc-field">מקש<input className="mc-ltr" value={r.key} maxLength={10} onChange={e => setR(i, { key: e.target.value })} /></label>
          <label className="mc-field">מה זה אומר (לדוחות)<input value={r.label} onChange={e => setR(i, { label: e.target.value })} placeholder="ביקש שיחה חוזרת" /></label>
          <label className="mc-check full"><input type="checkbox" checked={r.callback} onChange={e => setR(i, { callback: e.target.checked })} />להכניס ל״לידים מקמפיינים״ — צריך לחזור אליו</label>
          <label className="mc-field full">תשובה אוטומטית (לא חובה)<textarea value={r.reply_text} onChange={e => setR(i, { reply_text: e.target.value })} rows={3} placeholder="למשל: הערב יתקיים ביום ג׳ ב-20:00 ברח׳… לפרטים: https://…" />
            <small>{r.reply_text ? `${smsSegments(r.reply_text).chars} תווים · ${smsSegments(r.reply_text).segments} הודעות לכל משיב` : "תישלח מיד למי שהשיב את המקש הזה."}</small></label>
          <div className="full"><button type="button" className="lw-link" style={{ color: "var(--sh-red)" }} onClick={() => setC({ replies: replies.filter((_, j) => j !== i) })}>הסרת המקש</button></div>
        </div>)}
      </div>
    </div></div>
    <div className="mc-preview">
      <div className="mc-preview-bar"><span>כך תיראה ההודעה</span><span>{seg.chars} תווים · {seg.segments} הודעות · {seg.unicode ? "עברית (70 לכל הודעה)" : "GSM (160)"}</span></div>
      <div className="mc-phone"><div className="mc-bubble">{text || "…"}</div></div>
      {replies.filter(r => r.reply_text).map(r => <div key={r.key} className="mc-phone" style={{ marginTop: 8 }}><div className="mc-sub" style={{ marginBottom: 4 }}>אם ישיבו {r.key}:</div><div className="mc-bubble">{r.reply_text}</div></div>)}
      <p className="mc-sub">בעברית כל 70 תווים נספרים כהודעה (67 בהודעה ארוכה). החיוב בפועל לפי 019.</p>
    </div>
  </div>
}

function WaEditor({ content: c, setC, sample }: { content: WhatsappContent; setC: (p: any) => void; sample: any }) {
  const vars = c.variables || []
  const body = String(c.body_preview || "").replace(/\{\{(\d+)\}\}/g, (_, i) => personalizeText(vars[Number(i) - 1] ?? `{{${i}}}`, sample) || "—")
  return <div className="mc-split">
    <div className="mc-card"><div className="mc-form">
      <div className="full mc-note" style={{ margin: 0 }}>פנייה יזומה ב-WhatsApp אפשרית רק בתבנית שאושרה בחשבון העסקי. אחרי חיבור החשבון התבניות ייטענו ממנו; עד אז אפשר להכין טיוטה לפי שם התבנית והמשתנים.</div>
      <label className="mc-field">שם התבנית המאושרת *<input className="mc-ltr" value={c.template_name} onChange={e => setC({ template_name: e.target.value })} placeholder="event_invite_he" /></label>
      <label className="mc-field">שפה<select value={c.language} onChange={e => setC({ language: e.target.value })}><option value="he">עברית</option><option value="en">English</option></select></label>
      <label className="mc-field full">גוף התבנית (לתצוגה בלבד)<textarea value={c.body_preview} onChange={e => setC({ body_preview: e.target.value })} rows={4} placeholder="שלום {{1}}, מוזמנים למפגש…" /><small>בדיוק כפי שאושר; משתנים בסימון <span className="mc-ltr">{"{{1}}"}</span>, <span className="mc-ltr">{"{{2}}"}</span>…</small></label>
      {vars.map((v, i) => <label key={i} className="mc-field">משתנה {i + 1}<input value={v} onChange={e => setC({ variables: vars.map((x, j) => j === i ? e.target.value : x) })} /></label>)}
      <div className="full mc-actions"><button type="button" className="lw-btn" onClick={() => setC({ variables: [...vars, ""] })}>+ משתנה</button>{vars.length > 0 && <button type="button" className="lw-link" onClick={() => setC({ variables: vars.slice(0, -1) })}>הסרת האחרון</button>}</div>
    </div></div>
    <div className="mc-preview">
      <div className="mc-preview-bar"><span>תצוגה לנמען</span><span>{c.template_name ? <span className="mc-ltr">{c.template_name}</span> : "לא נבחרה תבנית"}</span></div>
      <div className="mc-phone"><div className="mc-bubble wa">{body || "…"}</div></div>
      <p className="mc-sub">״נקרא״ יוצג רק אם הספק ידווח עליו.</p>
    </div>
  </div>
}

// ─────────────────────────────── report ───────────────────────────────
function Report({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const c = data.campaign
  const { success, error: toastError } = useToast()
  const router = useRouter()
  const [r, setR] = useState<any>(null)
  const load = useCallback(() => api(`/api/messaging/campaigns/${c.id}/report`).then(setR).catch(() => {}), [c.id])
  useEffect(() => { load(); if (["queued", "sending", "scheduled"].includes(c.status)) { const t = setInterval(() => { load(); reload() }, 8000); return () => clearInterval(t) } }, [load, reload, c.status])
  const canSend = data.can?.send
  async function act(path: string, msg: string, body?: any, ask?: string) {
    if (ask && !confirm(ask)) return
    try { await api(`/api/messaging/campaigns/${c.id}/${path}`, "POST", body || {}); success(msg); await reload(); load() } catch (e: any) { toastError(e.message) }
  }
  const f = r?.funnel || {}
  const st = c.stats || {}
  const tracking = r?.tracking
  const pct = (a: number, b: number) => b ? `${Math.round(a / b * 100)}%` : "—"
  const content = c.approved_content || c.content || {}
  const previewHtml = c.channel === "email" ? personalizeHtml(renderEmailHtml({ ...EMPTY_EMAIL, ...content }, { orgAddress: "", logoUrl: typeof window !== "undefined" ? `${location.origin}/netivim-logo-white.png` : undefined }), { first_name: "", unsubscribe_url: "#", preferences_url: "#" }) : ""
  return (
    <div className="mc-ws">
      <div className="mc-crumb"><Link href="/admin/messaging?tab=campaigns">מרכז דיוורים / קמפיינים</Link></div>
      <div className="mc-head">
        <div><h1>{c.name}</h1><p>{CH_LABEL[c.channel]} · <StatusPill status={c.status} /> · אושר ע״י {c.approved_by || "—"} {fmtDate(c.approved_at)} · גרסה {c.approved_revision}{c.status === "scheduled" ? ` · מתוזמן ל-${fmtDate(c.scheduled_at)}` : ""}</p></div>
        <div className="mc-actions">
          {canSend && c.status === "scheduled" && <button type="button" className="lw-btn" onClick={() => act("unschedule", "התזמון בוטל — הקמפיין חזר לטיוטה", undefined, "לבטל את התזמון ולהחזיר לטיוטה?")}>ביטול תזמון</button>}
          {canSend && ["scheduled", "queued", "sending"].includes(c.status) && <button type="button" className="lw-btn lw-btn-danger" onClick={() => act("stop", "הקמפיין נעצר", undefined, "לעצור? הודעות שכבר נמסרו לספק לא יחזרו; השאר יבוטלו.")}>עצירה</button>}
          {canSend && ["partial", "sent"].includes(c.status) && (f.failed > 0) && <button type="button" className="lw-btn" onClick={() => act("retry", "המסירות שנכשלו הוחזרו לתור")}>ניסיון חוזר ל-{n(f.failed)} שנכשלו</button>}
          {canSend && ["partial"].includes(c.status) && (f.unknown > 0) && <button type="button" className="lw-btn" onClick={() => act("retry", "הוחזרו לתור", { include_unknown: true }, `${f.unknown} מסירות במצב ״לא ידוע״ — ייתכן שכבר התקבלו אצל הספק. לשלוח שוב בכל זאת?`)}>שליחה חוזרת ל״לא ידוע״</button>}
          <button type="button" className="lw-btn" onClick={() => router.push(`/admin/messaging/campaigns/new?duplicate=${c.id}`)}>שכפול</button>
        </div>
      </div>
      {c.last_error && <div className="mc-note">{c.last_error}</div>}
      <div className="mc-funnel">
        <div><span>נבחרו (ייחודיים)</span><b>{st.selected != null ? n(st.selected) : "—"}</b><small>באישור</small></div>
        <div><span>כשירים</span><b>{st.eligible != null ? n(st.eligible) : "—"}</b><small>{pct(st.eligible, st.selected)} מהנבחרים</small></div>
        <div><span>נכנסו לתור</span><b>{n(f.queued_total)}</b><small>{f.waiting ? `${n(f.waiting)} ממתינים` : "—"}</small></div>
        <div><span>התקבלו אצל הספק</span><b>{n(f.accepted)}</b><small>{pct(f.accepted, f.queued_total)} מהתור</small></div>
        <div><span>נמסרו</span><b>{tracking ? n(f.delivered) : "לא זמין"}</b><small>{tracking ? pct(f.delivered, f.accepted) + " מההתקבלו" : "דורש webhook מהספק"}</small></div>
        <div><span>פעולה (הקלקה)</span><b>{tracking ? n(f.clicked) : "לא זמין"}</b><small>{tracking ? `פתיחות משוערות: ${n(f.opened)}` : "—"}</small></div>
      </div>
      <div className="mc-grid k3" style={{ marginTop: 12 }}>
        <div className="mc-card mc-kpi"><span>נכשלו</span><b>{n(f.failed)}</b><small>{n(f.unknown)} במצב לא ידוע (ייתכן שנשלחו)</small></div>
        <div className="mc-card mc-kpi"><span>דולגו לפני שליחה</span><b>{n(f.skipped)}</b><small>הוסרו/בוטלה הרשאה בין האישור למסירה · {n(f.cancelled)} בוטלו בעצירה</small></div>
        <div className="mc-card mc-kpi"><span>הסרות מהקמפיין</span><b>{n(r?.unsubscribes)}</b><small>{c.archive_issue_id ? <a className="lw-link" href={`/newsletter/archive/${c.archive_issue_id}`} target="_blank">פורסם בארכיון</a> : "—"}</small></div>
      </div>
      {r?.replies && (c.channel === "sms" || r.replies.callbacks > 0) && <><div className="mc-section"><h2>תשובות</h2><span className="mc-actions">
          <Link className="lw-link" href={`/admin/messaging/leads?campaign=${c.id}`}>לידים מהקמפיין ({n(r.replies.callbacks)})</Link>
          {r.replies.inbound_open > 0 && <Link className="lw-link" href={`/admin/messaging/leads?view=replies&campaign=${c.id}`}>תשובות לטיפול ({n(r.replies.inbound_open)})</Link>}</span></div>
        <div className="mc-grid k3">
          <div className="mc-card mc-kpi"><span>השיבו</span><b>{n(r.replies.replied)}</b><small>{pct(r.replies.replied, f.accepted)} ממי שקיבל</small></div>
          <div className="mc-card mc-kpi"><span>ביקשו שנחזור אליהם</span><b>{n(r.replies.callbacks)}</b><small>{n(r.replies.callbacks_open)} עדיין חדשים</small></div>
          <div className="mc-card mc-kpi"><span>תשובות שלא זוהו</span><b>{n(r.replies.inbound_open)}</b><small>ממתינות לטיפול</small></div>
        </div>
        {r.replies.by_key.length > 0 && <div className="lw-card" style={{ marginTop: 12 }}><div className="mc-table-wrap"><table className="mc-table"><thead><tr><th>תשובה</th><th>משמעות</th><th className="num">השיבו</th></tr></thead>
          <tbody>{r.replies.by_key.map((x: any) => { const opt = ((content.replies || []) as ReplyOption[]).find(o => o.key === x.key); return <tr key={x.key}><td className="mc-ltr">{x.key === "callback" ? "חזרו אליי (מייל)" : x.key || "תשובה חופשית"}</td><td>{x.key === "הסר" ? "הסרה" : opt?.label || (opt?.callback ? "לחזור אליו" : "—")}</td><td className="num">{n(x.n)}</td></tr> })}</tbody></table></div></div>}
      </>}
      {r?.reasons?.length > 0 && <><div className="mc-section"><h2>סיבות כשל ודילוג</h2></div>
        <div className="lw-card"><div className="mc-table-wrap"><table className="mc-table"><thead><tr><th>סיבה</th><th>מצב</th><th className="num">כמות</th></tr></thead>
          <tbody>{r.reasons.map((x: any, i: number) => <tr key={i}><td>{x.reason || "—"}</td><td>{({ failed: "נכשל", unknown: "לא ידוע", skipped: "דולג" } as any)[x.status]}</td><td className="num">{n(x.n)}</td></tr>)}</tbody></table></div></div></>}
      <div className="mc-section"><h2>התוכן שאושר</h2></div>
      {c.channel === "email" ? <div className="mc-preview" style={{ position: "static" }}><iframe className="mc-frame" title="התוכן שנשלח" sandbox="" srcDoc={previewHtml} /></div>
        : c.channel === "sms" ? <div className="mc-phone" style={{ maxWidth: 420 }}><div className="mc-bubble">{renderSms({ ...EMPTY_SMS, ...content }, { first_name: "", unsubscribe_url: "…" })}</div></div>
        : <div className="mc-phone" style={{ maxWidth: 420 }}><div className="mc-bubble wa">{content.template_name || "—"}</div></div>}
    </div>
  )
}
