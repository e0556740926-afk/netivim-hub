"use client"
import { useEffect, useState, useRef } from "react"
import KPICard from "@/components/ui/KPICard"
import Card from "@/components/ui/Card"
import Modal from "@/components/ui/Modal"
import { useToast } from "@/components/ui/Toast"
import EmptyState from "@/components/ui/EmptyState"
import ErrorState from "@/components/ui/ErrorState"
import { SkeletonCard } from "@/components/ui/Skeleton"

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]

function fd(d: string | null) {
  if (!d) return "—"
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
}

const EMPTY_ISSUE = { subject: "", intro: "", blocks: [{ title: "", text: "" }], closing: "בברכה,\nצוות נתיבים", fromName: "", replyTo: "", segmentArea: "" }

const STATUS_LABEL: Record<string,string> = { draft: "טיוטה", scheduled: "מתוזמן", sent: "נשלח", failed: "נכשל" }
const STATUS_COLOR: Record<string,{bg:string,color:string}> = {
  draft: { bg:"#F3F4F6", color:"#374151" },
  scheduled: { bg:"#FEF3C7", color:"#B45309" },
  sent: { bg:"#DCFCE7", color:"#166534" },
  failed: { bg:"#FEE2E2", color:"#991B1B" },
}
function fdt(d: string | null) {
  if (!d) return "—"
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} · ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`
}
function pct(n: number, total: number) {
  if (!total) return "0%"
  return `${Math.round((n / total) * 100)}%`
}

/**
 * Email clients can't resolve a relative image path like
 * "images/photo.jpg" — there's no page it's relative TO. Every image
 * needs a full https:// URL. Design tools that export "download as
 * HTML" (rather than an email-specific export) typically produce
 * exactly this, silently — worth catching before a send goes out
 * with broken images for every recipient.
 */
function findRelativeImages(html: string): string[] {
  const found: string[] = []
  const re = /<img[^>]+src=["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const src = m[1]
    if (!/^(https?:|data:|cid:)/i.test(src)) found.push(src)
  }
  return found
}

export default function AdminNewsletterPage() {
  const { success, error: toastError } = useToast()
  const [subscribers, setSubscribers] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [available, setAvailable] = useState(true)
  const [q, setQ] = useState("")

  const [showCompose, setShowCompose] = useState(false)
  const [composeMode, setComposeMode] = useState<"template"|"html">("template")
  const [customHtml, setCustomHtml] = useState("")
  const [issue, setIssue] = useState({ ...EMPTY_ISSUE })
  const [editingId, setEditingId] = useState<number|null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [scheduledAt, setScheduledAt] = useState("")
  const [testTo, setTestTo] = useState("")
  const [testSending, setTestSending] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: "", email: "" })
  const [addSaving, setAddSaving] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [csvPreview, setCsvPreview] = useState<{name:string,email:string}[]>([])
  const [importSaving, setImportSaving] = useState(false)
  const [csvFileName, setCsvFileName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [htmlFileName, setHtmlFileName] = useState("")
  const htmlFileInputRef = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState(false)

  const [showHistory, setShowHistory] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const [sr, ir] = await Promise.all([
        fetch("/api/newsletter/subscribers"),
        fetch("/api/newsletter/issues"),
      ])
      if (!sr.ok) throw new Error()
      const sd = await sr.json()
      const id = await ir.json()
      setSubscribers(sd.subscribers || [])
      setStats(sd.stats)
      setAvailable(sd.available !== false)
      setIssues(id.issues || [])
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function addBlock() {
    if (issue.blocks.length >= 4) return
    setIssue(i => ({ ...i, blocks: [...i.blocks, { title: "", text: "" }] }))
  }
  function removeBlock(idx: number) {
    setIssue(i => ({ ...i, blocks: i.blocks.filter((_, x) => x !== idx) }))
  }
  function updateBlock(idx: number, field: "title" | "text", value: string) {
    setIssue(i => ({ ...i, blocks: i.blocks.map((b, x) => x === idx ? { ...b, [field]: value } : b) }))
  }

  function resetCompose() {
    setShowCompose(false); setEditingId(null); setScheduling(false); setScheduledAt("")
    setIssue({ ...EMPTY_ISSUE }); setCustomHtml(""); setComposeMode("template"); setHtmlFileName("")
  }

  function openNew() {
    setEditingId(null); setIssue({ ...EMPTY_ISSUE }); setCustomHtml(""); setComposeMode("template")
    setScheduling(false); setScheduledAt(""); setShowCompose(true)
  }

  /** Opens an existing draft/scheduled issue for editing, or (asNew) pre-fills a new draft from it — used for both "edit" and "duplicate". */
  function openFromIssue(i: any, asNew: boolean) {
    const isHtml = i.intro === "[HTML מותאם אישית]"
    setComposeMode(isHtml ? "html" : "template")
    setCustomHtml(isHtml ? (i.html || "") : "")
    setIssue({
      subject: asNew ? `${i.subject} (עותק)` : i.subject,
      intro: isHtml ? "" : (i.intro || ""),
      blocks: i.blocks?.length ? i.blocks : [{ title:"", text:"" }],
      closing: i.closing || "בברכה,\nצוות נתיבים",
      fromName: i.from_name || "", replyTo: i.reply_to || "", segmentArea: i.segment_area || "",
    })
    setEditingId(asNew ? null : i.id)
    setScheduling(!!i.scheduled_at)
    setScheduledAt(i.scheduled_at ? new Date(i.scheduled_at).toISOString().slice(0,16) : "")
    setShowHistory(false); setShowCompose(true)
  }

  function validateCompose(): boolean {
    if (!issue.subject.trim()) { toastError("כותרת היא שדה חובה"); return false }
    if (composeMode === "html" && !customHtml.trim()) { toastError("יש להדביק תוכן HTML"); return false }
    if (composeMode === "html") {
      const relImgs = findRelativeImages(customHtml)
      if (relImgs.length > 0 && !confirm(`נמצאו ${relImgs.length} תמונות עם כתובת יחסית שלא יוצגו במייל. לשלוח בכל זאת?`)) return false
    }
    return true
  }

  function payload(mode: "draft"|"schedule"|"send") {
    return {
      mode, ...issue,
      customHtml: composeMode === "html" ? customHtml : null,
      scheduledAt: mode === "schedule" ? scheduledAt : null,
    }
  }

  async function saveDraft() {
    if (!validateCompose()) return
    if (scheduling && !scheduledAt) { toastError("יש לבחור תאריך ושעה לתזמון"); return }
    setSavingDraft(true)
    const url = editingId ? `/api/newsletter/issues/${editingId}` : "/api/newsletter/issues"
    const method = editingId ? "PATCH" : "POST"
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { ...payload(scheduling ? "schedule" : "draft") } : payload(scheduling ? "schedule" : "draft")),
    })
    setSavingDraft(false)
    if (!res.ok) { const d = await res.json().catch(()=>({})); toastError(d.error || "השמירה נכשלה"); return }
    resetCompose()
    success(scheduling ? "הגיליון תוזמן" : "הטיוטה נשמרה")
    load()
  }

  async function sendIssue() {
    if (!validateCompose()) return
    const recipCount = issue.segmentArea ? "בפילוח שנבחר" : `${stats?.total || 0} נרשמים פעילים`
    if (!confirm(`לשלוח גיליון ל-${recipCount}? לא ניתן לבטל אחרי השליחה.`)) return
    setSending(true)
    const url = editingId ? `/api/newsletter/issues/${editingId}/send` : "/api/newsletter/issues"
    // Editing an existing draft: save first, then trigger send-now on it.
    let res: Response
    if (editingId) {
      const saveRes = await fetch(`/api/newsletter/issues/${editingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload("draft")),
      })
      if (!saveRes.ok) { setSending(false); toastError("השמירה נכשלה"); return }
      res = await fetch(url, { method: "POST" })
    } else {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload("send")) })
    }
    setSending(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); toastError(d.error || "השליחה נכשלה"); return }
    resetCompose()
    success("הגיליון נשלח בהצלחה")
    load()
  }

  async function sendTest() {
    if (!validateCompose()) return
    setTestSending(true)
    const res = await fetch("/api/newsletter/issues/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...issue, customHtml: composeMode === "html" ? customHtml : null, email: testTo.trim() || undefined }),
    })
    setTestSending(false)
    if (!res.ok) { const d = await res.json().catch(()=>({})); toastError(d.error || "שליחת הבדיקה נכשלה"); return }
    const d = await res.json()
    success(`נשלחה בדיקה ל-${d.to}`)
  }

  async function sendNow(id: number) {
    if (!confirm("לשלוח את הגיליון הזה עכשיו?")) return
    const res = await fetch(`/api/newsletter/issues/${id}/send`, { method: "POST" })
    if (!res.ok) { const d = await res.json().catch(()=>({})); toastError(d.error || "השליחה נכשלה"); return }
    success("נשלח בהצלחה")
    load()
  }

  async function deleteIssue(id: number) {
    if (!confirm("למחוק את הטיוטה הזו?")) return
    const res = await fetch(`/api/newsletter/issues/${id}`, { method: "DELETE" })
    if (!res.ok) { toastError("המחיקה נכשלה"); return }
    success("נמחק")
    load()
  }

  async function addParent() {
    if (!addForm.name.trim() || !addForm.email.trim()) { toastError("שם ומייל הם שדות חובה"); return }
    setAddSaving(true)
    const res = await fetch("/api/newsletter/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addForm.name.trim(), email: addForm.email.trim() }),
    })
    setAddSaving(false)
    if (!res.ok) { toastError("ההוספה נכשלה"); return }
    const d = await res.json()
    if (d.added === 0) { toastError("המייל הזה כבר ברשימה"); return }
    setShowAdd(false); setAddForm({ name: "", email: "" })
    success("ההורה נוסף")
    load()
  }

  // Minimal, dependency-free CSV parser — deliberately not using the
  // xlsx (SheetJS) npm package: it carries two unpatched high-severity
  // vulnerabilities (prototype pollution + ReDoS), which is a real risk
  // for a file an admin uploads and the server parses. CSV is safe to
  // hand-parse for a simple two-column name/email file, and Excel
  // exports to CSV in two clicks — the practical need is covered
  // without pulling in a vulnerable dependency.
  function parseCsv(text: string): {name:string,email:string}[] {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) return []
    const splitLine = (l: string) => l.split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    let start = 0
    const first = splitLine(lines[0]).map(c => c.toLowerCase())
    const looksLikeHeader = first.some(c => c.includes("שם") || c.includes("name") || c.includes("מייל") || c.includes("email") || c.includes("אימייל"))
    let nameIdx = 0, emailIdx = 1
    if (looksLikeHeader) {
      start = 1
      const ni = first.findIndex(c => c.includes("שם") || c.includes("name"))
      const ei = first.findIndex(c => c.includes("מייל") || c.includes("email") || c.includes("אימייל"))
      if (ni >= 0) nameIdx = ni
      if (ei >= 0) emailIdx = ei
    }
    const out: {name:string,email:string}[] = []
    for (let i = start; i < lines.length; i++) {
      const cols = splitLine(lines[i])
      const name = cols[nameIdx] || ""
      const email = cols[emailIdx] || ""
      if (name && email.includes("@")) out.push({ name, email })
    }
    return out
  }

  function onCsvChange(text: string) {
    setCsvText(text)
    setCsvPreview(parseCsv(text))
  }

  async function onFileSelected(file: File) {
    setCsvFileName(file.name)
    const text = await file.text()
    onCsvChange(text)
  }

  async function onHtmlFileSelected(file: File) {
    setHtmlFileName(file.name)
    const text = await file.text()
    setCustomHtml(text)
  }

  async function confirmImport() {
    if (!csvPreview.length) return
    setImportSaving(true)
    const res = await fetch("/api/newsletter/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: csvPreview }),
    })
    setImportSaving(false)
    if (!res.ok) { toastError("הייבוא נכשל"); return }
    const d = await res.json()
    setShowImport(false); setCsvText(""); setCsvPreview([]); setCsvFileName("")
    success(`יובאו ${d.added} הורים${d.skipped ? ` · ${d.skipped} דולגו (כבר קיימים)` : ""}`)
    load()
  }

  async function unsubscribe(id: number, name: string) {
    if (!confirm(`להסיר את ${name} מרשימת התפוצה?`)) return
    await fetch("/api/newsletter/subscribers", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    })
    success("הוסר מהרשימה")
    load()
  }

  const filtered = subscribers.filter((s: any) =>
    s.status === "active" && (!q || s.name?.includes(q) || s.email?.includes(q))
  )
  const areas = Array.from(new Set(subscribers.map((s:any) => s.area).filter(Boolean))).sort()

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-up">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0D2744]">ניוזלטר להורים</h1>
          <div className="text-sm text-[#64748B] mt-0.5">רשימת תפוצה, כתיבה ושליחת גיליונות</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/newsletter/archive" target="_blank" rel="noreferrer"
            className="px-4 py-2 border border-[#E2E8F0] bg-white rounded-[10px] text-sm font-semibold hover:bg-[#F8FAFC] flex items-center">
            📰 ארכיון ציבורי
          </a>
          <a href="/api/export?type=newsletter" target="_blank" rel="noreferrer"
            className="px-4 py-2 border border-[#E2E8F0] bg-white rounded-[10px] text-sm font-semibold hover:bg-[#F8FAFC] flex items-center">
            ⬇ ייצוא CSV
          </a>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 border border-[#E2E8F0] bg-white rounded-[10px] text-sm font-semibold hover:bg-[#F8FAFC]">
            + הוסף הורה
          </button>
          <button onClick={() => setShowImport(true)}
            className="px-4 py-2 border border-[#E2E8F0] bg-white rounded-[10px] text-sm font-semibold hover:bg-[#F8FAFC]">
            📥 ייבוא מאקסל
          </button>
          <button onClick={() => setShowHistory(true)}
            className="px-4 py-2 border border-[#E2E8F0] bg-white rounded-[10px] text-sm font-semibold hover:bg-[#F8FAFC]">
            📜 גיליונות {issues.length > 0 && `(${issues.length})`}
          </button>
          <button onClick={openNew}
            className="px-4 py-2 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold hover:bg-[#00488D] transition-colors">
            ✉ כתוב גיליון חדש
          </button>
        </div>
      </div>

      {!available && (
        <div className="bg-[#FEF3C7] text-[#B45309] rounded-[10px] px-4 py-3 text-sm mb-4">
          הפיצ'ר ממתין לעדכון מסד נתונים שטרם הופעל.
        </div>
      )}

      {(() => {
        const scheduledCount = issues.filter((i:any)=>i.status==="scheduled").length
        const draftCount = issues.filter((i:any)=>i.status==="draft").length
        if (!scheduledCount && !draftCount) return null
        return (
          <div className="bg-[#EFF6FF] text-[#00488D] rounded-[10px] px-4 py-3 text-sm mb-4 flex items-center gap-2">
            <span>🗓️</span>
            <span>
              {scheduledCount > 0 && <>{scheduledCount} גיליונות מתוזמנים</>}
              {scheduledCount > 0 && draftCount > 0 && " · "}
              {draftCount > 0 && <>{draftCount} טיוטות ממתינות</>}
            </span>
            <button onClick={() => setShowHistory(true)} className="underline font-semibold mr-auto">צפה</button>
          </div>
        )
      })()}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={3}/>)}</div>
      ) : (
      <>
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard label="נרשמים פעילים" value={stats?.total || 0}/>
          <KPICard label="נרשמו החודש" value={stats?.thisMonth || 0} color="#166534"/>
          <KPICard label="הוסרו" value={stats?.unsubscribed || 0} color={stats?.unsubscribed > 0 ? "#960010" : "#0D2744"}/>
          <KPICard label="גיליונות שנשלחו" value={issues.filter((i:any)=>i.sent_at).length}/>
        </div>

        {/* Channel breakdown */}
        {stats?.byChannel?.length > 0 && (
          <Card className="p-5 mb-4">
            <div className="text-sm font-bold mb-4">פילוח לפי ערוץ הרשמה</div>
            <div className="space-y-2.5">
              {stats.byChannel.map((c: any) => {
                const pct = stats.total > 0 ? Math.round((c.count / stats.total) * 100) : 0
                return (
                  <div key={c.channel} className="flex items-center gap-3">
                    <div className="w-32 text-sm font-medium truncate">{c.channel}</div>
                    <div className="flex-1 h-2 bg-[#F0F4F8] rounded-full overflow-hidden">
                      <div style={{ width: `${pct}%` }} className="h-full bg-[#00488D] rounded-full"/>
                    </div>
                    <div className="w-16 text-left text-sm font-bold text-[#0D2744]">{c.count}</div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Subscribers list */}
        <Card>
          <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-bold">רשימת נרשמים ({filtered.length})</div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש..."
              className="px-3 py-1.5 border border-[#E2E8F0] rounded-[8px] text-sm w-48 focus:outline-none focus:border-[#00488D]"/>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon="📬" title="אין עדיין נרשמים" hint="שתף את הלינק הכללי או שהרכזים ישתפו את הלינקים האישיים שלהם"/>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {filtered.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-xs text-[#64748B]">{s.email}</div>
                  </div>
                  <div className="text-xs text-[#94A3B8]">{s.coordinator_name || "כללי"}{s.area ? ` · ${s.area}` : ""}</div>
                  <div className="text-xs text-[#94A3B8] w-24 text-left">{fd(s.created_at)}</div>
                  <button onClick={() => unsubscribe(s.id, s.name)}
                    className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </>
      )}

      {/* Compose modal */}
      <Modal
        open={showCompose}
        onClose={resetCompose}
        title={editingId ? "✎ עריכת טיוטה" : "✉ גיליון חדש"}
        subtitle={issue.segmentArea ? `יישלח רק לנרשמים באזור: ${issue.segmentArea}` : `יישלח ל-${stats?.total || 0} נרשמים פעילים`}
        width="600px"
        footer={<>
          <div className="w-full space-y-2">
            <div className="flex gap-2">
              <button onClick={sendIssue} disabled={sending || savingDraft || testSending}
                className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50">
                {sending ? "שולח..." : "שלח עכשיו"}
              </button>
              <button onClick={saveDraft} disabled={sending || savingDraft || testSending}
                className="flex-1 py-2.5 border border-[#00488D] text-[#00488D] rounded-[10px] text-sm font-bold disabled:opacity-50">
                {savingDraft ? "שומר..." : scheduling ? "תזמן" : "שמור טיוטה"}
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <input value={testTo} onChange={e=>setTestTo(e.target.value)} placeholder="מייל לבדיקה (ריק = המייל שלי)"
                className="flex-1 px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-xs focus:outline-none focus:border-[#00488D]"/>
              <button onClick={sendTest} disabled={testSending}
                className="px-3 py-2 border border-[#E2E8F0] rounded-[9px] text-xs font-semibold hover:bg-[#F8FAFC] disabled:opacity-50 whitespace-nowrap">
                {testSending ? "שולח..." : "📧 שלח בדיקה"}
              </button>
              <button onClick={resetCompose} className="px-3 py-2 text-xs text-[#94A3B8]">ביטול</button>
            </div>
          </div>
        </>}
      >
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-2 p-1 bg-[#F0F4F8] rounded-[10px]">
            <button onClick={() => setComposeMode("template")}
              className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${composeMode==="template"?"bg-white text-[#0D2744] shadow-sm":"text-[#64748B]"}`}>
              תבנית פשוטה
            </button>
            <button onClick={() => setComposeMode("html")}
              className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-colors ${composeMode==="html"?"bg-white text-[#0D2744] shadow-sm":"text-[#64748B]"}`}>
              HTML מוכן (Canva ועוד)
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">כותרת הגיליון *</label>
            <input value={issue.subject} onChange={e => setIssue(i => ({ ...i, subject: e.target.value }))}
              placeholder="לדוגמה: עדכון חודשי — ספטמבר 2026"
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold block mb-1">שם השולח (לא חובה)</label>
              <input value={issue.fromName} onChange={e => setIssue(i => ({ ...i, fromName: e.target.value }))}
                placeholder="למשל: צוות נתיבים"
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Reply-To (לא חובה)</label>
              <input value={issue.replyTo} onChange={e => setIssue(i => ({ ...i, replyTo: e.target.value }))} type="email" dir="ltr"
                placeholder="office@netivim.org"
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold block mb-1">קהל יעד</label>
              <select value={issue.segmentArea} onChange={e => setIssue(i => ({ ...i, segmentArea: e.target.value }))}
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
                <option value="">כל הנרשמים הפעילים</option>
                {areas.map((a:string) => <option key={a} value={a}>רק אזור: {a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 flex items-center gap-1.5">
                <input type="checkbox" checked={scheduling} onChange={e=>setScheduling(e.target.checked)} className="w-3.5 h-3.5"/>
                תזמון לשליחה עתידית
              </label>
              {scheduling && (
                <input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
              )}
            </div>
          </div>

          {composeMode === "html" ? (
            <div>
              <label className="text-xs font-semibold block mb-1">תוכן HTML</label>
              <input ref={htmlFileInputRef} type="file" accept=".html,text/html" className="hidden"
                onChange={e => e.target.files?.[0] && onHtmlFileSelected(e.target.files[0])}/>
              <button type="button" onClick={() => htmlFileInputRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-[#CBD5E1] rounded-[10px] text-sm font-semibold text-[#374151] hover:border-[#00488D] hover:bg-[#F0F7FF] transition-colors flex items-center justify-center gap-2 mb-2">
                📁 {htmlFileName || "בחר קובץ HTML (מיוצא מ-Canva)"}
              </button>
              {htmlFileName && (
                <div className="text-xs text-[#166534] mb-2 text-center">✓ הקובץ נטען — אפשר לערוך למטה במידת הצורך</div>
              )}
              <div className="text-xs text-[#94A3B8] text-center mb-2">— או הדבק ישירות —</div>
              <textarea value={customHtml} onChange={e => setCustomHtml(e.target.value)} rows={8}
                placeholder="הדבק כאן HTML שיוצא מ-Canva או כל כלי עיצוב אחר..."
                dir="ltr"
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-xs font-mono resize-none focus:outline-none focus:border-[#00488D]"/>
              {customHtml.trim() && findRelativeImages(customHtml).length > 0 && (
                <div className="text-xs text-[#991B1B] bg-[#FEE2E2] rounded-[8px] px-3 py-2.5 mt-2">
                  ⚠️ נמצאו {findRelativeImages(customHtml).length} תמונות עם כתובת יחסית (למשל <code dir="ltr">{findRelativeImages(customHtml)[0]}</code>) — הן <b>לא יוצגו</b> במייל בפועל.
                  <div className="mt-1 font-normal">בקנווה: יש לבחור <b>Share ← Email</b> ולא <b>Download</b>, כדי לקבל קישורי תמונה מלאים.</div>
                </div>
              )}
              <div className="text-xs text-[#94A3B8] bg-[#F0F7FF] rounded-[8px] px-3 py-2 mt-2">
                קישור הסרה מתווסף אוטומטית בסוף המייל, גם אם לא כלול בתוכן שהדבקת.
              </div>
            </div>
          ) : (
          <>
          <div>
            <label className="text-xs font-semibold block mb-1">פתיחה</label>
            <textarea value={issue.intro} onChange={e => setIssue(i => ({ ...i, intro: e.target.value }))} rows={3}
              placeholder="כמה מילות פתיחה חמות... אפשר לכתוב שלום {{{first_name}}}, לפנייה אישית"
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/>
            <div className="text-[11px] text-[#94A3B8] mt-1">
              {"{{{first_name}}}"} יוחלף בשם הפרטי — מובטח בשליחה לאזור/בדיקה, ותלוי בתמיכת Resend בשליחה לכל הרשימה.
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold">קטעים ({issue.blocks.length}/4)</label>
              {issue.blocks.length < 4 && (
                <button onClick={addBlock} className="text-xs font-bold text-[#00488D]">+ הוסף קטע</button>
              )}
            </div>
            {issue.blocks.map((b, idx) => (
              <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#64748B]">קטע {idx + 1}</span>
                  {issue.blocks.length > 1 && (
                    <button onClick={() => removeBlock(idx)} className="text-xs text-[#94A3B8] hover:text-[#960010]">הסר</button>
                  )}
                </div>
                <input value={b.title} onChange={e => updateBlock(idx, "title", e.target.value)}
                  placeholder="כותרת הקטע" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[8px] text-sm focus:outline-none focus:border-[#00488D]"/>
                <textarea value={b.text} onChange={e => updateBlock(idx, "text", e.target.value)} rows={3}
                  placeholder="תוכן הקטע..." className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[8px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">סיום</label>
            <textarea value={issue.closing} onChange={e => setIssue(i => ({ ...i, closing: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm resize-none focus:outline-none focus:border-[#00488D]"/>
          </div>

          <div className="text-xs text-[#94A3B8] bg-[#F0F7FF] rounded-[8px] px-3 py-2">
            עיצוב הגיליון קבוע — לוגו, כותרת וקישור הסרה מתווספים אוטומטית. אתה ממלא רק את התוכן.
          </div>
          </>
          )}
        </div>
      </Modal>

      {/* History modal */}
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="📜 גיליונות" width="560px">
        {issues.length === 0 ? (
          <div className="text-sm text-[#94A3B8] text-center py-6">עדיין לא נוצר אף גיליון</div>
        ) : (
          <div className="space-y-2">
            {issues.map((i: any) => {
              const st = STATUS_COLOR[i.status] || STATUS_COLOR.draft
              const canEdit = i.status === "draft" || i.status === "scheduled"
              return (
                <div key={i.id} className="border border-[#E2E8F0] rounded-[10px] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold truncate">{i.subject}</div>
                    <span style={st} className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0">{STATUS_LABEL[i.status] || i.status}</span>
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">
                    {i.status === "scheduled" ? `מתוזמן ל-${fdt(i.scheduled_at)}` : i.status === "sent" ? fdt(i.sent_at) : `נוצר ${fdt(i.created_at)}`}
                    {i.segment_area && ` · אזור: ${i.segment_area}`}
                    {i.status === "sent" && ` · ${i.recipients || 0} נמענים`}
                    {i.created_by && ` · ${i.created_by}`}
                  </div>

                  {i.status === "sent" && (i.recipients > 0) && (
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-[#00488D] font-semibold">👁 {i.unique_opens || 0} פתיחות ({pct(i.unique_opens||0, i.recipients)})</span>
                      <span className="text-[#166534] font-semibold">🔗 {i.unique_clicks || 0} הקלקות ({pct(i.unique_clicks||0, i.recipients)})</span>
                      {i.bounced > 0 && <span className="text-[#B45309] font-semibold">⚠ {i.bounced} החזרות</span>}
                      {i.complained > 0 && <span className="text-[#991B1B] font-semibold">🚩 {i.complained} תלונות</span>}
                    </div>
                  )}

                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {i.status === "sent" && (
                      <a href={`/newsletter/archive/${i.id}`} target="_blank" rel="noreferrer"
                        className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] hover:bg-[#F8FAFC]">👁 צפה</a>
                    )}
                    {canEdit && (
                      <button onClick={() => openFromIssue(i, false)} className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] hover:bg-[#F8FAFC]">✎ ערוך</button>
                    )}
                    {canEdit && (
                      <button onClick={() => sendNow(i.id)} className="text-xs px-2 py-1 rounded-[6px] border border-[#00488D] text-[#00488D] hover:bg-[#F0F7FF]">שלח עכשיו</button>
                    )}
                    <button onClick={() => openFromIssue(i, true)} className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] hover:bg-[#F8FAFC]">⧉ שכפל</button>
                    {canEdit && (
                      <button onClick={() => deleteIssue(i.id)} className="text-xs px-2 py-1 rounded-[6px] border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">🗑 מחק</button>
                    )}
                    {i.status === "failed" && (
                      <button onClick={() => sendNow(i.id)} className="text-xs px-2 py-1 rounded-[6px] border border-[#B45309] text-[#B45309] hover:bg-[#FEF3C7]">נסה שוב</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* Manual add modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="+ הוסף הורה"
        footer={<>
          <button onClick={addParent} disabled={addSaving}
            className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50">
            {addSaving ? "מוסיף..." : "הוסף"}
          </button>
          <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-[10px] text-sm">ביטול</button>
        </>}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold block mb-1">שם מלא *</label>
            <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">מייל *</label>
            <input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} type="email"
              className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          </div>
        </div>
      </Modal>

      {/* CSV import modal */}
      <Modal
        open={showImport}
        onClose={() => { setShowImport(false); setCsvText(""); setCsvPreview([]); setCsvFileName("") }}
        title="📥 ייבוא מאקסל"
        subtitle="שמור את הקובץ כ-CSV באקסל (שמירה בשם → CSV) והעלה כאן"
        width="520px"
        footer={csvPreview.length > 0 ? <>
          <button onClick={confirmImport} disabled={importSaving}
            className="flex-1 py-2.5 bg-[#0D2744] text-white rounded-[10px] text-sm font-bold disabled:opacity-50">
            {importSaving ? "מייבא..." : `ייבא ${csvPreview.length} שורות`}
          </button>
          <button onClick={() => { setCsvText(""); setCsvPreview([]); setCsvFileName("") }} className="px-4 py-2.5 border border-[#E2E8F0] rounded-[10px] text-sm">נקה</button>
        </> : undefined}
      >
        <div className="space-y-3">
          <div>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => e.target.files?.[0] && onFileSelected(e.target.files[0])}/>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-[#CBD5E1] rounded-[10px] text-sm font-semibold text-[#374151] hover:border-[#00488D] hover:bg-[#F0F7FF] transition-colors flex items-center justify-center gap-2">
              📁 {csvFileName || "בחר קובץ CSV"}
            </button>
            {csvFileName && (
              <div className="text-xs text-[#166534] mt-1.5 text-center">✓ הקובץ נטען — {csvPreview.length} שורות זוהו</div>
            )}
          </div>
          <div className="text-xs text-[#94A3B8] text-center">— או —</div>
          <textarea value={csvText} onChange={e => onCsvChange(e.target.value)} rows={5}
            placeholder={"שם,מייל\nישראל ישראלי,israel@example.com"}
            dir="ltr"
            className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-xs font-mono resize-none focus:outline-none focus:border-[#00488D]"/>

          {csvPreview.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1.5">תצוגה מקדימה ({csvPreview.length} שורות)</div>
              <div className="max-h-40 overflow-y-auto border border-[#E2E8F0] rounded-[9px]">
                {csvPreview.slice(0, 20).map((r, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 text-xs border-b border-[#F1F5F9] last:border-0">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[#64748B]">{r.email}</span>
                  </div>
                ))}
                {csvPreview.length > 20 && (
                  <div className="text-xs text-[#94A3B8] text-center py-1.5">ועוד {csvPreview.length - 20}...</div>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
