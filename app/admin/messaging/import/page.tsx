"use client"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/components/ui/Toast"
import { api, n, SetupNotice } from "@/components/messaging/ui"
import { IMPORT_FIELDS, suggestMapping, normalizeRow, type ImportField } from "@/lib/messaging/normalize"

type Parsed = { fileName: string; size: number; sheets: { name: string; rows: unknown[][] }[]; sheet: number; headerRow: number }
const MAX_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 10000
const OUT: [string, string, string][] = [
  ["new", "חדשים", "ייווצרו במאגר ויצטרפו לקהל"],
  ["existing", "קיימים", "כבר במאגר — יצטרפו לקהל, שדות ריקים יושלמו"],
  ["duplicate", "כפולים בקובץ", "ידולגו — אותו פרט מופיע בשורה קודמת"],
  ["invalid", "שגויים", "ידולגו — אין פרט קשר תקין"],
  ["suppressed", "הוסרו / חסומים", "יצטרפו לקהל, אבל לא יקבלו הודעות"],
  ["conflict", "התנגשות זהות", "ידולגו — מייל וטלפון של שני אנשים שונים"],
]

function cellText(v: unknown) { return v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v) }

export default function ImportPage() {
  return <Suspense fallback={null}><ImportWizard /></Suspense>
}

function ImportWizard() {
  const params = useSearchParams()
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [step, setStep] = useState(1)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [parseErr, setParseErr] = useState("")
  const [over, setOver] = useState(false)
  const [country, setCountry] = useState("IL")
  const [jobId, setJobId] = useState<number | null>(null)
  const [mapping, setMapping] = useState<Record<string, ImportField | "">>({})
  const [audiences, setAudiences] = useState<any[]>([])
  // ?campaign=<id>: "ייבוא לקמפיין" — a new audience is created and attached to that draft.
  const campaignId = Number(params.get("campaign")) || 0
  const [campaignName, setCampaignName] = useState("")
  const [audienceId, setAudienceId] = useState<string>(params.get("audience") || (campaignId ? "new" : ""))
  const [newAudName, setNewAudName] = useState("")
  const [basis, setBasis] = useState<{ channels: string[]; source: string }>({ channels: [], source: "" })
  const [busy, setBusy] = useState("")
  const [job, setJob] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([])
  const [outcome, setOutcome] = useState("")
  const [progress, setProgress] = useState<{ applied: number; total: number } | null>(null)
  const [err, setErr] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api("/api/messaging/audiences").then(d => setAudiences(d.audiences.filter((a: any) => !a.system_key))).catch(setErr)
  }, [])
  useEffect(() => {
    if (!campaignId) return
    api(`/api/messaging/campaigns/${campaignId}`).then(d => { setCampaignName(d.campaign.name); setNewAudName(n => n || `נמעני קמפיין: ${d.campaign.name}`.slice(0, 120)) }).catch(() => {})
  }, [campaignId])

  // Resume an existing job (?job=)
  useEffect(() => {
    const id = Number(params.get("job"))
    if (!id) return
    setJobId(id)
    refreshJob(id).then(j => {
      if (!j) return
      if (j.status === "done" || j.status === "importing") setStep(5)
      else if (j.status === "validated") setStep(4)
      else setStep(1)
      if (j.audience_id) setAudienceId(String(j.audience_id))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshJob(id = jobId!, oc = outcome) {
    try {
      const d = await api(`/api/messaging/imports/${id}${oc ? `?outcome=${oc}` : ""}`)
      setJob(d.job); setRows(d.rows); setProgress({ applied: d.progress.applied, total: d.progress.to_apply })
      return d.job
    } catch (e) { setErr(e); return null }
  }

  // ── step 1: read file in the browser (values only, no formulas or macros run) ──
  async function readFile(f: File) {
    setParseErr("")
    const ext = f.name.toLowerCase().split(".").pop()
    if (f.size > MAX_BYTES) { setParseErr("הקובץ גדול מ-10MB. אפשר לפצל אותו לכמה קבצים."); return }
    try {
      let sheets: Parsed["sheets"] = []
      if (ext === "csv" || ext === "txt") {
        const Papa = (await import("papaparse")).default
        const text = await f.text()
        const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t", "|"] })
        if (res.errors.length && !res.data.length) throw new Error(res.errors[0].message)
        sheets = [{ name: "CSV", rows: res.data }]
      } else if (ext === "xlsx") {
        const readExcel = (await import("read-excel-file/browser")).default
        const all = await readExcel(f)
        sheets = all.map((s: any) => ({ name: s.sheet, rows: s.data }))
      } else { setParseErr("אפשר לייבא קובצי Excel ‏(.xlsx) או CSV בלבד. קובץ ‎.xls ישן צריך לשמור מחדש כ-xlsx."); return }
      sheets = sheets.map(s => ({ ...s, rows: s.rows.filter(r => Array.isArray(r) && r.some(c => cellText(c).trim() !== "")) }))
      const first = Math.max(0, sheets.findIndex(s => s.rows.length > 1))
      setParsed({ fileName: f.name, size: f.size, sheets, sheet: first, headerRow: 0 })
    } catch (e: any) { setParseErr(`לא ניתן לקרוא את הקובץ: ${e?.message || e}`) }
  }

  const sheet = parsed?.sheets[parsed.sheet]
  const headers = useMemo(() => (sheet?.rows[parsed!.headerRow] || []).map((h, i) => cellText(h).trim() || `עמודה ${i + 1}`), [sheet, parsed])
  const dataRows = useMemo(() => sheet ? sheet.rows.slice(parsed!.headerRow + 1) : [], [sheet, parsed])

  async function startJob() {
    if (!parsed || !sheet) return
    if (dataRows.length === 0) { setParseErr("לא נמצאו שורות נתונים מתחת לשורת הכותרות"); return }
    if (dataRows.length > MAX_ROWS) { setParseErr(`בקובץ ${n(dataRows.length)} שורות — המגבלה היא ${n(MAX_ROWS)}. אפשר לפצל לכמה קבצים.`); return }
    setBusy("upload")
    try {
      const d = await api("/api/messaging/imports", "POST", { file_name: parsed.fileName, file_size: parsed.size, sheet: sheet.name, headers, row_count: dataRows.length, default_country: country })
      setJobId(d.job_id)
      setMapping(suggestMapping(headers))
      router.replace(`/admin/messaging/import?job=${d.job_id}`, { scroll: false })
      setStep(2)
    } catch (e: any) { setParseErr(e.message) } finally { setBusy("") }
  }

  // ── step 2: mapping ──
  const mapped = Object.values(mapping).filter(Boolean) as string[]
  const dupTargets = mapped.filter((v, i) => mapped.indexOf(v) !== i)
  const hasContact = mapped.includes("email") || mapped.includes("phone")
  const sampleFor = (field: string) => {
    const col = headers.findIndex(h => mapping[h] === field)
    return col < 0 ? "" : dataRows.slice(0, 3).map(r => cellText(r[col])).filter(Boolean).join(" · ")
  }
  function rowObject(r: unknown[]) {
    const o: Record<string, unknown> = {}
    headers.forEach((h, i) => { const f = mapping[h]; if (f) o[f] = r[i] instanceof Date ? (r[i] as Date).toISOString().slice(0, 10) : (r[i] as any) })
    return o
  }
  const preview = useMemo(() => dataRows.slice(0, 5).map(r => normalizeRow(rowObject(r), country)), [dataRows, mapping, country]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveMapping() {
    if (dupTargets.length) { toastError("אותו שדה נבחר ליותר מעמודה אחת"); return }
    if (!hasContact) { toastError("יש למפות לפחות עמודת מייל או טלפון"); return }
    setBusy("map")
    try { await api(`/api/messaging/imports/${jobId}`, "PATCH", { mapping, default_country: country }); setStep(3) }
    catch (e: any) { toastError(e.message) } finally { setBusy("") }
  }

  // ── step 3: target + policy, then upload rows and check ──
  async function check() {
    setBusy("check")
    try {
      let aid = audienceId
      if (aid === "new") {
        if (!newAudName.trim()) { toastError("יש להזין שם לקהל החדש"); setBusy(""); return }
        const d = await api("/api/messaging/audiences", "POST", { name: newAudName, source: parsed?.fileName || "ייבוא" })
        aid = String(d.audience.id); setAudienceId(aid)
        setAudiences(a => [...a, d.audience])
      }
      if (!aid) { toastError("יש לבחור קהל יעד"); setBusy(""); return }
      if (basis.channels.length && !basis.source.trim()) { toastError("כדי לסמן הסכמה לכל הקובץ יש לתעד את מקור ההסכמה"); setBusy(""); return }
      await api(`/api/messaging/imports/${jobId}`, "PATCH", { audience_id: Number(aid), consent_basis: basis.channels.length ? basis : null })
      if (campaignId) await api(`/api/messaging/campaigns/${campaignId}/audiences`, "POST", { audience_id: Number(aid) }).catch((e: any) => toastError(`הקהל לא צורף לקמפיין: ${e.message}`))
      if (parsed) {
        const all = dataRows.map((r, i) => ({ row_no: parsed.headerRow + i + 2, data: rowObject(r) }))
        for (let i = 0; i < all.length; i += 1000) {
          await api(`/api/messaging/imports/${jobId}/rows`, "POST", { rows: all.slice(i, i + 1000), reset: i === 0 })
        }
      }
      await api(`/api/messaging/imports/${jobId}/validate`, "POST", {})
      await refreshJob(jobId!, "")
      setStep(4)
    } catch (e: any) { toastError(e.message) } finally { setBusy("") }
  }

  // ── step 5: apply in bounded batches (resumable) ──
  async function commit() {
    setBusy("commit"); setStep(5)
    try {
      for (let guard = 0; guard < 200; guard++) {
        const d = await api(`/api/messaging/imports/${jobId}/commit`, "POST", {})
        setProgress(p => p ? { ...p, applied: p.applied + d.applied } : p)
        if (d.done) break
      }
      await refreshJob(jobId!, "")
      success("הייבוא הושלם")
    } catch (e: any) { toastError(`${e.message} — אפשר להמשיך מאותה נקודה.`); await refreshJob(jobId!, "") }
    finally { setBusy("") }
  }
  async function undo() {
    if (!confirm("להסיר מהקהל את מי שנוסף בייבוא הזה? פרטי הנמענים וההסכמות שתועדו נשארים ביומן.")) return
    try { const d = await api(`/api/messaging/imports/${jobId}/undo`, "POST", {}); success(`${d.removed} הוסרו מהקהל`); await refreshJob(jobId!, "") }
    catch (e: any) { toastError(e.message) }
  }

  const counts = job?.counts || {}
  const total = Number(job?.total_rows || 0)
  const steps = ["העלאה", "התאמת עמודות", "יעד ומדיניות", "בדיקה", "אישור ותוצאה"]
  const isCrm = job && Array.isArray(job.headers) && job.headers.length === 0

  return (
    <div className="mc-ws">
      <div className="mc-crumb"><Link href="/admin/messaging">מרכז דיוורים</Link> / ייבוא</div>
      <div className="mc-head"><div><h1>ייבוא נמענים</h1><p>מקובץ Excel או CSV. רואים מה ייכנס לפני האישור. ייבוא לא יוצר לידים או שותפים, לא משנה רכז מטפל ולא מבטל הסרות.</p></div></div>
      {campaignId > 0 && <div className="mc-note ok">ייבוא לקמפיין <b>{campaignName || `#${campaignId}`}</b> — הנמענים ייכנסו לקהל חדש שיצורף לקמפיין. כדי שיקבלו SMS, סמנו בשלב ״יעד ומדיניות״ את הרשאת ה-SMS ואת מקור ההסכמה.</div>}
      {err && <SetupNotice error={err} />}

      <ol className="mc-steps">
        {steps.map((s, i) => <li key={s}><button type="button" aria-current={step === i + 1 ? "step" : undefined} disabled={i + 1 > step || step === 5 || (isCrm && i < 3)} onClick={() => setStep(i + 1)}>{s}</button></li>)}
      </ol>

      {step === 1 && <div className="mc-card">
        <div className={`mc-drop ${over ? "over" : ""}`} role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click() }}
          onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) readFile(f) }}>
          <b>בחירת קובץ או גרירה לכאן</b>
          <span>Excel ‏(.xlsx) או CSV בקידוד UTF-8 · עד 10MB ו-{n(MAX_ROWS)} שורות</span>
          <a href="/messaging-import-example.csv" download onClick={e => e.stopPropagation()} className="lw-link">הורדת קובץ דוגמה</a>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" hidden onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = "" }} />
        {parseErr && <div className="mc-note red" role="alert" style={{ marginTop: 12 }}>{parseErr}</div>}
        {parsed && sheet && <>
          <div className="mc-form" style={{ marginTop: 16 }}>
            <div className="full" style={{ fontSize: 14 }}><b>{parsed.fileName}</b> · {(parsed.size / 1024).toFixed(0)}KB · {n(dataRows.length)} שורות נתונים · {headers.length} עמודות</div>
            {parsed.sheets.length > 1 && <label className="mc-field">גיליון<select value={parsed.sheet} onChange={e => setParsed(p => p && ({ ...p, sheet: Number(e.target.value), headerRow: 0 }))}>{parsed.sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows.length} שורות)</option>)}</select></label>}
            <label className="mc-field">שורת הכותרות<select value={parsed.headerRow} onChange={e => setParsed(p => p && ({ ...p, headerRow: Number(e.target.value) }))}>{sheet.rows.slice(0, 5).map((r, i) => <option key={i} value={i}>שורה {i + 1}: {r.slice(0, 3).map(cellText).join(" | ")}</option>)}</select></label>
            <label className="mc-field">מדינת ברירת מחדל לטלפונים<select value={country} onChange={e => setCountry(e.target.value)}>{[["IL", "ישראל"], ["US", "ארה״ב"], ["GB", "בריטניה"], ["FR", "צרפת"], ["BE", "בלגיה"], ["CA", "קנדה"]].map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select><small>מספר כמו 0501234567 יפורש לפי המדינה הזו, אלא אם בשורה צוינה מדינה אחרת.</small></label>
          </div>
          <div className="lw-card" style={{ marginTop: 14 }}><div className="mc-table-wrap"><table className="mc-table">
            <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{dataRows.slice(0, 5).map((r, i) => <tr key={i}>{headers.map((_, j) => <td key={j}>{cellText(r[j])}</td>)}</tr>)}</tbody>
          </table></div></div>
          <div className="mc-stepfoot"><span /><button type="button" className="lw-btn lw-btn-primary" disabled={!!busy} onClick={startJob}>{busy ? "מעלה…" : "המשך להתאמת עמודות"}</button></div>
        </>}
        {!parsed && jobId && job && job.status === "uploaded" && <div className="mc-note" style={{ marginTop: 12 }}>כדי להמשיך את הייבוא ״{job.file_name}״ יש לבחור את הקובץ שוב (הקובץ עצמו לא נשמר בשרת).</div>}
      </div>}

      {step === 2 && parsed && <div className="mc-card">
        <h2>התאמת עמודות</h2>
        <p className="mc-sub" style={{ marginBottom: 14 }}>ההצעה מבוססת על שמות העמודות. אפשר לשנות. עמודה שלא ממופה — לא תיובא.</p>
        <div className="mc-table-wrap"><table className="mc-table">
          <thead><tr><th>עמודה בקובץ</th><th>דוגמה</th><th>שדה במאגר</th></tr></thead>
          <tbody>{headers.map((h, i) => <tr key={h}>
            <td><b>{h}</b></td>
            <td><span className="mc-sub" style={{ marginTop: 0 }}>{dataRows.slice(0, 2).map(r => cellText(r[i])).filter(Boolean).join(" · ") || "—"}</span></td>
            <td><select className="lw-select" style={{ maxWidth: 260 }} value={mapping[h] || ""} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value as ImportField }))} aria-label={`שדה עבור ${h}`}>
              <option value="">— לא לייבא —</option>
              {IMPORT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>{dupTargets.includes(mapping[h] as string) && <span className="mc-pill red" style={{ marginInlineStart: 6 }}>כפול</span>}</td>
          </tr>)}</tbody>
        </table></div>
        {!hasContact && <div className="mc-note red" style={{ marginTop: 12 }}>יש למפות לפחות עמודת מייל או טלפון.</div>}
        <h3 style={{ marginTop: 18 }}>כך זה ייקלט (5 שורות ראשונות)</h3>
        <div className="mc-table-wrap"><table className="mc-table">
          <thead><tr><th>שם</th><th>מייל</th><th>טלפון</th><th>עיר</th><th>תגיות</th></tr></thead>
          <tbody>{preview.map((p, i) => <tr key={i}>
            <td>{p.full_name || <span className="mc-sub" style={{ marginTop: 0 }}>ללא שם — ברכה כללית</span>}</td>
            <td className="mc-ltr">{p.email ? <>{p.email}{!p.email_valid && <span className="mc-pill red" style={{ marginInlineStart: 6 }}>לא תקין</span>}</> : "—"}</td>
            <td className="mc-ltr">{p.phone_raw ? <>{p.phone_raw} → {p.phone}{!p.phone_valid && <span className="mc-pill red" style={{ marginInlineStart: 6 }}>לא תקין</span>}</> : "—"}</td>
            <td>{p.city || "—"}</td><td>{p.tags.join(", ") || "—"}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="mc-stepfoot"><button type="button" className="lw-btn" onClick={() => setStep(1)}>חזרה</button><button type="button" className="lw-btn lw-btn-primary" disabled={!!busy || !hasContact || dupTargets.length > 0} onClick={saveMapping}>המשך</button></div>
      </div>}
      {step === 2 && !parsed && <div className="mc-note">יש לבחור את הקובץ מחדש כדי להמשיך. <button className="lw-link" onClick={() => setStep(1)}>לבחירת קובץ</button></div>}

      {step === 3 && <div className="mc-card">
        <h2>יעד ומדיניות</h2>
        <div className="mc-form" style={{ marginTop: 12 }}>
          <label className="mc-field">קהל יעד *<select value={audienceId} onChange={e => setAudienceId(e.target.value)}>
            <option value="">— בחירת קהל —</option>
            {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="new">+ קהל חדש…</option>
          </select></label>
          {audienceId === "new" && <label className="mc-field">שם הקהל החדש *<input value={newAudName} onChange={e => setNewAudName(e.target.value)} /></label>}
          <div className="full mc-note ok" style={{ margin: 0 }}>
            מה יקרה: נמענים חדשים ייווצרו במאגר הדיוורים; נמענים קיימים יצורפו לקהל, ושדות ריקים אצלם יושלמו — בלי לדרוס נתונים קיימים. לא נוצרים לידים או שותפים, הרכז המטפל לא משתנה, והסרות וחסימות נשארות בתוקף.
          </div>
          <fieldset className="full" style={{ border: "1px solid var(--sh-line)", borderRadius: 12, padding: "12px 14px", margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>הרשאת פנייה</legend>
            <p className="mc-sub" style={{ marginTop: 0 }}>העלאת קובץ אינה הוכחת הסכמה. בלי תיעוד — הנמענים ייכנסו במצב ״הרשאה לא ידועה״ ולא יהיו זמינים לשליחה שיווקית עד בירור. אם בקובץ יש עמודות הרשאה (ערוץ / מצב / מקור / תאריך) הן יגברו על הסימון כאן.</p>
            {[["email", "מייל"], ["sms", "SMS"], ["whatsapp", "WhatsApp"]].map(([k, l]) => (
              <label key={k} className="mc-check" style={{ display: "inline-flex", marginInlineEnd: 16 }}><input type="checkbox" checked={basis.channels.includes(k)} onChange={e => setBasis(b => ({ ...b, channels: e.target.checked ? [...b.channels, k] : b.channels.filter(x => x !== k) }))} />יש תיעוד הסכמה ל{l} לכל השורות</label>
            ))}
            {basis.channels.length > 0 && <label className="mc-field" style={{ marginTop: 8 }}>מקור ההסכמה *<input value={basis.source} onChange={e => setBasis(b => ({ ...b, source: e.target.value }))} placeholder="למשל: טופס הרשמה במפגש 12.10, הסכמה חתומה" /><small>נשמר ביומן ההרשאות של כל נמען, עם מזהה הייבוא.</small></label>}
          </fieldset>
        </div>
        <div className="mc-stepfoot"><button type="button" className="lw-btn" onClick={() => setStep(2)} disabled={!parsed}>חזרה</button><button type="button" className="lw-btn lw-btn-primary" disabled={!!busy} onClick={check}>{busy === "check" ? "בודק את כל השורות…" : "בדיקת הנתונים"}</button></div>
      </div>}

      {step === 4 && job && <div>
        <div className="mc-grid k6">
          {OUT.map(([k, l]) => <button key={k} type="button" className="mc-card mc-kpi" style={{ textAlign: "start", cursor: "pointer", outline: outcome === k ? "2px solid var(--sh-green)" : undefined }} onClick={() => { const v = outcome === k ? "" : k; setOutcome(v); refreshJob(jobId!, v) }}><span>{l}</span><b>{n(counts[k])}</b></button>)}
        </div>
        <div className="mc-note ok" style={{ marginTop: 12 }}>
          {n(total)} שורות בסך הכול = {OUT.map(([k, l]) => `${n(counts[k])} ${l}`).join(" + ")}.
          {" "}כשירות לפי פרט: מייל תקין ב-{n(counts.channels?.email)} שורות, טלפון תקין ב-{n(counts.channels?.phone)} (חופפים — לא מחברים).
          {job.options?.consent_basis ? ` הסכמה תתועד ל: ${job.options.consent_basis.channels.join(", ")} · מקור: ${job.options.consent_basis.source}.` : " בלי תיעוד הסכמה — הנמענים לא יהיו זמינים לשליחה שיווקית עד בירור."}
        </div>
        <div className="mc-section"><h2>{outcome ? OUT.find(o => o[0] === outcome)?.[1] : "שורות לדוגמה"}</h2><a className="lw-link" href={`/api/messaging/imports/${jobId}/report`}>הורדת דוח לתיקון (CSV)</a></div>
        <div className="lw-card"><div className="mc-table-wrap"><table className="mc-table">
          <thead><tr><th className="num">שורה</th><th>תוצאה</th><th>שם</th><th>מייל</th><th>טלפון</th><th>סיבה / מה יקרה</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.row_no}>
            <td className="num">{r.row_no}</td>
            <td><span className={`mc-pill ${r.outcome === "new" || r.outcome === "existing" ? "green" : r.outcome === "suppressed" ? "amber" : "red"}`}>{OUT.find(o => o[0] === r.outcome)?.[1]}</span></td>
            <td>{r.norm?.full_name || "—"}</td>
            <td className="mc-ltr">{r.norm?.email || "—"}</td>
            <td className="mc-ltr">{r.norm?.phone || r.norm?.phone_raw || "—"}</td>
            <td><span className="mc-sub" style={{ marginTop: 0 }}>{r.reason || OUT.find(o => o[0] === r.outcome)?.[2]}</span></td>
          </tr>)}
            {!rows.length && <tr><td colSpan={6}><div className="mc-empty">אין שורות בקטגוריה הזו.</div></td></tr>}
          </tbody>
        </table></div></div>
        <div className="mc-stepfoot">
          <button type="button" className="lw-btn" onClick={() => setStep(3)} disabled={!parsed && !isCrm}>חזרה</button>
          <button type="button" className="lw-btn lw-btn-primary" disabled={!!busy || !(counts.new || counts.existing || counts.suppressed)} onClick={commit}>
            אישור ייבוא — {n((counts.new || 0) + (counts.existing || 0) + (counts.suppressed || 0))} נמענים לקהל ״{job.audience_name}״
          </button>
        </div>
        <p className="mc-sub">האישור לא שולח שום הודעה.</p>
      </div>}

      {step === 5 && job && <div className="mc-card">
        <h2>{job.status === "done" ? "הייבוא הושלם" : "מייבא…"}</h2>
        {progress && <div style={{ margin: "12px 0" }}><div className="mc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.applied}><i style={{ width: `${progress.total ? Math.round(progress.applied / progress.total * 100) : 100}%` }} /></div><span className="mc-sub">{n(progress.applied)} מתוך {n(progress.total)}</span></div>}
        <div className="mc-grid k3" style={{ marginTop: 10 }}>
          <div className="mc-card mc-kpi"><span>נוספו כנמענים חדשים</span><b>{n(counts.new)}</b></div>
          <div className="mc-card mc-kpi"><span>חוברו לקהל (קיימים / חסומים)</span><b>{n((counts.existing || 0) + (counts.suppressed || 0))}</b></div>
          <div className="mc-card mc-kpi"><span>דולגו</span><b>{n((counts.duplicate || 0) + (counts.invalid || 0) + (counts.conflict || 0))}</b><small>שגויים, כפולים והתנגשויות</small></div>
        </div>
        <p className="mc-sub">לא נשלחו הודעות. {counts.undone ? `${n(counts.undone)} חברויות בקהל בוטלו.` : ""}</p>
        <div className="mc-stepfoot">
          <div className="mc-actions">
            {job.status !== "done" && !busy && <button type="button" className="lw-btn lw-btn-primary" onClick={commit}>המשך הייבוא</button>}
            {job.status === "done" && !counts.undone && <button type="button" className="lw-btn lw-btn-danger" onClick={undo}>ביטול ההוספה לקהל</button>}
            <a className="lw-btn" href={`/api/messaging/imports/${jobId}/report?all=1`}>דוח מלא (CSV)</a>
          </div>
          {campaignId ? <Link className="lw-btn lw-btn-primary" href={`/admin/messaging/campaigns/${campaignId}`}>חזרה לקמפיין{campaignName ? ` ״${campaignName}״` : ""}</Link>
            : job.audience_id && <Link className="lw-btn lw-btn-primary" href={`/admin/messaging/audiences/${job.audience_id}`}>לקהל ״{job.audience_name}״</Link>}
        </div>
      </div>}
    </div>
  )
}
