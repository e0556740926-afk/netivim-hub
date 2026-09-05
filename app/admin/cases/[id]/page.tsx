"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import ReferralWizard from "@/components/cases/ReferralWizard"

// Tokens from design-tokens/tokens.css, kept local to this screen (see
// /admin/cases/page.tsx and DECISIONS_LOG.md for why it isn't global yet).
const T = {
  navy: "#14213D", blue: "#2E5C8A", blueBg: "#EDF2F8",
  slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC",
  ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B", breachBg: "#FDECEA",
  referredFg: "#6B4E9E", referredBg: "#f2eef8",
}
const DEFAULT_SLA_HOURS = 24 // overridden at runtime by /api/admin/automation-settings
const TABS = ["overview", "intake", "protected", "log", "referrals", "tasks", "documents", "rav"] as const
const TAB_LABEL: Record<string, string> = { overview: "סקירה", intake: "שאלון קליטה", protected: "מידע מוגן 🔒", log: "יומן קשר", referrals: "הפניות", tasks: "משימות", documents: "מסמכים", rav: "התייעצות רב" }
const INACTIVE_REASONS = ["אין מענה", "לא מעוניין", "לא רלוונטי", "פעילות קהילתית"]
const TRANSITIONS: Record<string, string[]> = {
  "פנייה חדשה": ["בתהליך ייעוץ", "לא פעיל"],
  "בתהליך ייעוץ": ["הופנה למסגרת", "לא פעיל"],
  "הופנה למסגרת": ["התקבל למסגרת", "בתהליך ייעוץ", "לא פעיל"],
  "התקבל למסגרת": ["שובץ במסגרת", "לא פעיל"],
  "שובץ במסגרת": ["הסתיים בהצלחה", "לא פעיל"],
  "לא פעיל": ["בתהליך ייעוץ"],
  "הסתיים בהצלחה": [],
}

function hoursSince(d?: string | null) { return d ? (Date.now() - new Date(d).getTime()) / 36e5 : null }
function fdt(d?: string | null) { return d ? new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "" }

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,33,61,.4)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 28, width: 460, maxWidth: "90vw" }}>{children}</div>
    </div>
  )
}
function RailBtn({ label, shape, color, onClick }: { label: string; shape: "square" | "circle"; color: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%", padding: "10px 4px", cursor: "pointer" }}>
      <span style={{ width: 22, height: 22, borderRadius: shape === "circle" ? "50%" : 6, border: `1.5px solid ${color}` }} />
      <span style={{ fontSize: 11, fontWeight: 600, color, textAlign: "center" }}>{label}</span>
    </div>
  )
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<typeof TABS[number]>("overview")
  const [modal, setModal] = useState<null | "status" | "triage" | "referred_blocked">(null)
  const [inactiveReason, setInactiveReason] = useState("")
  const [triageForm, setTriageForm] = useState({ description: "", urgency: "high", ask: "" })
  const [extended, setExtended] = useState({ education_background: "", army_status: "", family_status: "", aspirations: "", skills: "" })
  const [protectedData, setProtectedData] = useState<any>(null)
  const [protectedOpen, setProtectedOpen] = useState(false)
  const [showExtendedAccordion, setShowExtendedAccordion] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [interactionForm, setInteractionForm] = useState({ type: "call", summary: "", next_step: "" })
  const [showInteractionForm, setShowInteractionForm] = useState(false)
  const [slaHours, setSlaHours] = useState(DEFAULT_SLA_HOURS)
  const [docForm, setDocForm] = useState({ file_url: "", doc_type: "" })
  const [ravResponses, setRavResponses] = useState<Record<number, string>>({})

  async function load() {
    setLoading(true); setError(false)
    try {
      const [r, sr] = await Promise.all([fetch(`/api/cases/${id}`), fetch("/api/admin/automation-settings")])
      if (!r.ok) throw new Error()
      const d = await r.json()
      setData(d)
      if (d.extended) setExtended(d.extended)
      const s = await sr.json()
      if (s?.settings?.sla_hours) setSlaHours(Number(s.settings.sla_hours))
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  async function changeStatus(next: string, reason?: string) {
    const r = await fetch("/api/cases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: Number(id), advisor_status: next, inactive_reason: reason }) })
    if (!r.ok) {
      const { error } = await r.json()
      if (next === "הופנה למסגרת") { setModal("referred_blocked"); return }
      alert(error); return
    }
    setModal(null); setInactiveReason("")
    await load()
  }
  async function submitTriage() {
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_triage", triage_color: "red", ...triageForm }) })
    setModal(null)
    await load()
  }
  async function saveExtended() {
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_extended", ...extended }) })
  }
  async function openProtected() {
    const r = await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open_protected" }) })
    const { sensitive_data } = await r.json()
    setProtectedData(sensitive_data || {}); setProtectedOpen(true)
  }
  async function saveProtected() {
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_protected", sensitive_data: protectedData }) })
  }
  async function updateReferralStatus(refId: number, status: string) {
    const r = await fetch("/api/referrals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: refId, status }) })
    const { siblings_to_close } = await r.json()
    if (siblings_to_close?.length) alert(`התקבל! ${siblings_to_close.length} הפניות מקבילות נותרו פתוחות — סגור אותן ידנית עם סיבה.`)
    await load()
  }
  async function addDocument() {
    if (!docForm.file_url) return
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_document", ...docForm }) })
    setDocForm({ file_url: "", doc_type: "" })
    await load()
  }
  async function respondRav(consultationId: number) {
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "respond_rav", consultation_id: consultationId, response: ravResponses[consultationId] || "" }) })
    await load()
  }
  async function logInteraction() {
    if (!interactionForm.summary) return
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "log_interaction", ...interactionForm }) })
    setInteractionForm({ type: "call", summary: "", next_step: "" })
    setShowInteractionForm(false)
    await load()
  }

  if (loading) return <div className="p-6"><SkeletonCard /></div>
  if (error || !data) return <ErrorState retry={load} />

  const { case: c, referrals, history, interactions, custom_values, tasks: caseTasks, documents, consultations } = data
  const slaHrs = hoursSince(c.first_touch_at || c.created_at)
  const slaBreach = slaHrs !== null && slaHrs >= slaHours
  const allowedNext = TRANSITIONS[c.advisor_status] || []
  const activeReferrals = referrals.filter((r: any) => !["לא התקבל", "נשר", "הסתיים"].includes(r.status))
  const pastReferrals = referrals.filter((r: any) => ["לא התקבל", "נשר", "הסתיים"].includes(r.status))

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, display: "flex" }}>
      {/* ACTION RAIL */}
      <div style={{ width: 96, background: "#fff", borderLeft: `1px solid ${T.border}`, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "20px 0", position: "sticky", top: 0, height: "100vh" }}>
        <RailBtn label="שינוי סטטוס" shape="square" color={T.blue} onClick={() => setModal("status")} />
        <RailBtn label="שינוי סיווג רמזור" shape="circle" color={T.breach} onClick={() => setModal("triage")} />
        <RailBtn label="יצירת הפניה" shape="square" color={T.slate} onClick={() => setShowWizard(true)} />
        <RailBtn label="תיעוד שיחה" shape="square" color={T.slate} onClick={() => { setTab("log"); setShowInteractionForm(true) }} />
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "20px 32px" }}>
          <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>
            בית › <span onClick={() => router.push("/admin/cases")} style={{ cursor: "pointer" }}>תיקים</span> › <span style={{ color: T.navy, fontWeight: 600 }}>{c.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.name}{c.age ? `, ${c.age}` : ""}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: T.slate }} className="ltr-numeric">{c.phone}</div>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 11px", borderRadius: 6, background: T.bg, color: T.slate, border: `1px solid ${T.border}` }}>{c.advisor_status}</span>
            {slaBreach && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: T.breach }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: T.breach }} />חריגת SLA</span>}
          </div>
          <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 13, color: T.slate, flexWrap: "wrap" }}>
            <div>בעלים נוכחי: <span style={{ color: T.navy, fontWeight: 600 }}>{c.owner_name || "טרם שויך"}</span></div>
            <div>מקור פנייה: <span style={{ color: T.navy, fontWeight: 600 }}>{c.source}</span></div>
            {c.coordinator_name && <div>הובאה ע״י: <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: T.referredBg, color: T.referredFg }}>{c.coordinator_name} · רכז</span></div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, padding: "0 32px", borderBottom: `1px solid ${T.border}`, background: "#fff", overflowX: "auto" }}>
          {TABS.map(t => (
            <div key={t} onClick={() => setTab(t)} style={{ padding: "12px 16px", fontSize: 13, fontWeight: tab === t ? 700 : 600, color: tab === t ? T.blue : T.slate, borderBottom: `2px solid ${tab === t ? T.blue : "transparent"}`, whiteSpace: "nowrap", cursor: "pointer" }}>{TAB_LABEL[t]}</div>
          ))}
        </div>

        {tab === "overview" && (
          <div style={{ display: "flex", gap: 24, padding: "24px 32px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>ציר זמן</div>
              <div style={{ position: "relative", paddingRight: 20, borderRight: "2px solid #EEF1F6" }}>
                {history.length ? history.map((h: any) => (
                  <div key={h.id} style={{ position: "relative", paddingBottom: 24 }}>
                    <span style={{ position: "absolute", right: -25, top: 2, width: 10, height: 10, borderRadius: "50%", background: T.border, border: "2px solid #fff" }} />
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{h.from_status || "נוצר"} ← {h.to_status}</div>
                    <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{fdt(h.changed_at)} · {h.changed_by || "אוטומטי"}{h.reason ? ` · ${h.reason}` : ""}</div>
                  </div>
                )) : <div style={{ fontSize: 13, color: T.slate }}>אין עדיין אירועים בציר הזמן</div>}
              </div>
            </div>
            <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 12 }}>פרטי קליטה</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.slate }}>עיר</span><span style={{ fontWeight: 600 }}>{c.city || "—"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.slate }}>תחום עניין</span><span style={{ fontWeight: 600 }}>{c.interest || "—"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.slate }}>מגזר</span><span style={{ fontWeight: 600 }}>{c.sector || "—"}</span></div>
                </div>
              </div>
              {slaHrs !== null && (
                <div style={{ background: slaBreach ? T.breachBg : "#fff", border: `1px solid ${slaBreach ? T.breach + "55" : T.border}`, borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: slaBreach ? T.breach : T.slate, marginBottom: 6 }}>מד SLA</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: slaBreach ? T.breach : T.navy }}>{Math.round(slaHrs)} שעות</div>
                  <div style={{ fontSize: 12, color: slaBreach ? T.breach : T.slate, marginTop: 2 }}>{slaBreach ? `חריגה מזמן התגובה היעד (${slaHours} שעות)` : "בתוך זמן התגובה היעד"}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "intake" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 32px" }}>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>בסיסי</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, fontSize: 14 }}>
                {[["שם", c.name], ["טלפון", c.phone], ["גיל", c.age], ["עיר", c.city], ["מגזר", c.sector], ["מקור", c.source], ["תחום עניין", c.interest]].map(([label, val]) => (
                  <div key={label as string}><div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>{label}</div><div style={{ fontWeight: 600 }}>{val || "—"}</div></div>
                ))}
              </div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
              <div onClick={() => setShowExtendedAccordion(s => !s)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: "0.05em" }}>מורחב</div>
                <span style={{ color: T.slate }}>{showExtendedAccordion ? "︿" : "﹀"}</span>
              </div>
              {showExtendedAccordion && (
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                  {(["education_background", "army_status", "family_status", "aspirations", "skills"] as const).map(key => (
                    <div key={key}>
                      <div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>
                        {{ education_background: "רקע לימודי", army_status: "סטטוס צה״ל וקב״ס", family_status: "מצב משפחתי", aspirations: "שאיפות", skills: "כישורים" }[key]}
                      </div>
                      <textarea value={extended[key]} onChange={e => setExtended(x => ({ ...x, [key]: e.target.value }))} onBlur={saveExtended}
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14, fontFamily: "inherit", border: `1px solid ${T.border}`, borderRadius: 8, resize: "none" }} rows={2} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            {custom_values?.length > 0 && (
              <div style={{ background: "#fff", border: `2px dashed ${T.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>שדות מותאמים</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, fontSize: 14 }}>
                  {custom_values.map((cv: any) => (
                    <div key={cv.field_id}><div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>{cv.label}</div><div style={{ fontWeight: 600 }}>{cv.value || "—"}</div></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "protected" && (
          <div style={{ padding: "24px 32px" }}>
            {!protectedOpen ? (
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 48, textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>רובד מידע מוגן</div>
                <div style={{ fontSize: 13, color: T.slate, marginBottom: 20 }}>מכיל מידע רגיש (רפואי, משפחתי) הנגיש לתפקידים מורשים בלבד. פתיחת הרובד תירשם ביומן הביקורת עם שמך ושעת הצפייה.</div>
                <button onClick={openProtected} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>פתח גישה</button>
              </div>
            ) : (
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, maxWidth: 640, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.breach, marginBottom: 16 }}>🔒 הצפייה ברובד זה נרשמה ביומן הביקורת</div>
                <textarea value={protectedData?.notes || ""} onChange={e => setProtectedData((p: any) => ({ ...p, notes: e.target.value }))} onBlur={saveProtected}
                  placeholder="מידע רפואי, רקע משפחתי מורחב, הערות חסויות..." rows={5}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, fontFamily: "inherit", border: `1px solid ${T.border}`, borderRadius: 8, resize: "none" }} />
              </div>
            )}
          </div>
        )}

        {tab === "log" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 32px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowInteractionForm(s => !s)} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ תעד אינטראקציה</button>
            </div>
            {showInteractionForm && (
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <select value={interactionForm.type} onChange={e => setInteractionForm(f => ({ ...f, type: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }}>
                  <option value="call">שיחת טלפון</option><option value="whatsapp">WhatsApp</option><option value="meeting">פגישה פרונטלית</option><option value="email">מייל</option>
                </select>
                <textarea placeholder="סיכום" value={interactionForm.summary} onChange={e => setInteractionForm(f => ({ ...f, summary: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
                <input placeholder="צעד הבא" value={interactionForm.next_step} onChange={e => setInteractionForm(f => ({ ...f, next_step: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
                <button onClick={logInteraction} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" }}>שמור</button>
              </div>
            )}
            {interactions.map((i: any) => (
              <div key={i.id} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{{ call: "שיחת טלפון", whatsapp: "הודעת WhatsApp", meeting: "פגישה פרונטלית", email: "מייל" }[i.type as string] || i.type}</div>
                  <div style={{ fontSize: 12, color: T.slate }}>{fdt(i.created_at)}</div>
                </div>
                {i.summary && <div style={{ fontSize: 13, marginBottom: 6 }}>סיכום: {i.summary}</div>}
                {i.next_step && <div style={{ fontSize: 13, color: T.slate }}>צעד הבא: {i.next_step}</div>}
              </div>
            ))}
            {!interactions.length && <div style={{ textAlign: "center", color: T.slate, padding: "24px 0" }}>אין עדיין תיעוד אינטראקציות</div>}
          </div>
        )}

        {tab === "referrals" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "24px 32px" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 12 }}>הפניות פעילות (עד 3 במקביל)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {activeReferrals.map((r: any) => (
                  <div key={r.id} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{r.organization_name}</div>
                    {r.program_name && <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>מסלול: {r.program_name}</div>}
                    <div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>נשלח: {fdt(r.sent_at)}</div>
                    <span style={{ display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: T.referredBg, color: T.referredFg }}>{r.status}</span>
                    {r.status === "ממתין" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                        <button onClick={() => updateReferralStatus(r.id, "התקבל")} style={{ flex: 1, background: "#EAF3EE", color: T.ok, border: "none", borderRadius: 6, padding: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>התקבל</button>
                        <button onClick={() => updateReferralStatus(r.id, "לא התקבל")} style={{ flex: 1, background: T.breachBg, color: T.breach, border: "none", borderRadius: 6, padding: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>לא התקבל</button>
                      </div>
                    )}
                  </div>
                ))}
                {activeReferrals.length < 3 && (
                  <div onClick={() => setShowWizard(true)} style={{ background: "#fff", border: `2px dashed ${T.border}`, borderRadius: 12, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", color: T.blue, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ מקום פנוי להפניה נוספת</div>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.slate, marginBottom: 12 }}>היסטוריית הפניות קודמות</div>
              <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: T.blueBg }}>
                    <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: T.slate }}>מוסד</th>
                    <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: T.slate }}>מסלול</th>
                    <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: T.slate }}>תאריך</th>
                    <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: T.slate }}>סטטוס</th>
                  </tr></thead>
                  <tbody>
                    {pastReferrals.map((r: any) => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                        <td style={{ padding: "10px 16px", fontWeight: 600 }}>{r.organization_name}</td>
                        <td style={{ padding: "10px 16px", color: T.slate }}>{r.program_name || "—"}</td>
                        <td style={{ padding: "10px 16px", color: T.slate }}>{fdt(r.status_date)}</td>
                        <td style={{ padding: "10px 16px" }}><span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: T.breachBg, color: T.breach }}>{r.status}</span></td>
                      </tr>
                    ))}
                    {!pastReferrals.length && <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין עדיין הפניות שנסגרו</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <div style={{ padding: "24px 32px" }}>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: T.blueBg }}>
                  {["כותרת", "סוג", "יעד", "סטטוס", "דחיפות"].map(h => <th key={h} style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 600, color: T.slate }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {caseTasks.map((t: any) => (
                    <tr key={t.id} style={{ borderTop: `1px solid ${T.bg}` }}>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>{t.title}</td>
                      <td style={{ padding: "10px 16px", color: T.slate }}>{t.type}</td>
                      <td style={{ padding: "10px 16px", color: T.slate }}>{t.due_date ? String(t.due_date).slice(0, 10) : "—"}</td>
                      <td style={{ padding: "10px 16px" }}>{t.status}</td>
                      <td style={{ padding: "10px 16px" }}>{t.priority}</td>
                    </tr>
                  ))}
                  {!caseTasks.length && <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: T.slate }}>אין עדיין משימות לתיק זה</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: T.slate, marginTop: 10 }}>זהו סינון של מסך המשימות הכללי לפי תיק זה — לא מודול נפרד. לניהול מלא (עריכה/שיוך) יש לעבור למסך המשימות.</div>
          </div>
        )}

        {tab === "documents" && (
          <div style={{ padding: "24px 32px" }}>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", gap: 8 }}>
              <input placeholder="קישור למסמך (Google Drive וכו')" value={docForm.file_url} onChange={e => setDocForm(f => ({ ...f, file_url: e.target.value }))} style={{ flex: 2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <input placeholder="סוג מסמך" value={docForm.doc_type} onChange={e => setDocForm(f => ({ ...f, doc_type: e.target.value }))} style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
              <button onClick={addDocument} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>+ צרף</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {documents.map((doc: any) => (
                <a key={doc.id} href={doc.file_url} target="_blank" rel="noreferrer" style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", textDecoration: "none", color: T.navy }}>
                  <span>📎 {doc.doc_type || "מסמך"}</span>
                  <span style={{ fontSize: 12, color: T.slate }}>{doc.uploaded_by} · {String(doc.uploaded_at).slice(0, 10)}</span>
                </a>
              ))}
              {!documents.length && <div style={{ textAlign: "center", color: T.slate, padding: 20 }}>אין עדיין מסמכים מצורפים. הערה: זה קישור למסמך שכבר מאוחסן (למשל Google Drive) — אין עדיין העלאת קבצים ישירה למערכת.</div>}
            </div>
          </div>
        )}

        {tab === "rav" && (
          <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
            {consultations.map((cons: any) => (
              <div key={cons.id} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>פנייה מ-{String(cons.created_at).slice(0, 10)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: cons.status === "נענה" ? T.ok : T.warn }}>{cons.status}</span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>{cons.description}</div>
                {cons.request && <div style={{ fontSize: 13, color: T.slate, marginBottom: 10 }}>נדרש: {cons.request}</div>}
                {cons.response ? (
                  <div style={{ background: T.bg, borderRadius: 8, padding: 12, fontSize: 13 }}>תגובת הרב: {cons.response}</div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="תגובת הרב..." value={ravResponses[cons.id] || ""} onChange={e => setRavResponses(r => ({ ...r, [cons.id]: e.target.value }))} style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8 }} />
                    <button onClick={() => respondRav(cons.id)} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>שמור תגובה</button>
                  </div>
                )}
              </div>
            ))}
            {!consultations.length && <div style={{ textAlign: "center", color: T.slate, padding: 20 }}>אין עדיין פניות לרב אוברמייסטר — אלה נפתחות אוטומטית כשתיק מסווג &quot;אדום&quot;.</div>}
          </div>
        )}
      </div>

      {/* MODAL: STATUS CHANGE */}
      {modal === "status" && (
        <Modal onClose={() => setModal(null)}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>שינוי סטטוס</div>
          <div style={{ fontSize: 13, color: T.slate, marginBottom: 18 }}>מעבר הבא מתוך &quot;{c.advisor_status}&quot;</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {allowedNext.map(s => (
              <button key={s} onClick={() => s === "לא פעיל" ? setInactiveReason("__pending__") : changeStatus(s)}
                style={{ textAlign: "right", background: s === "לא פעיל" ? T.breachBg : T.blueBg, color: s === "לא פעיל" ? T.breach : T.blue, border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{s}</button>
            ))}
            {!allowedNext.length && <div style={{ fontSize: 13, color: T.slate }}>תיק סגור — הסתיים בהצלחה</div>}
          </div>
          {inactiveReason === "__pending__" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T.slate, marginBottom: 10 }}>בחר סיבה — השמירה חסומה עד לבחירה.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {INACTIVE_REASONS.map(r => (
                  <label key={r} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                    <input type="radio" name="inactive-reason" onChange={() => changeStatus("לא פעיל", r)} />{r}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setModal(null)} style={{ background: "transparent", color: T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>סגור</button>
          </div>
        </Modal>
      )}

      {/* MODAL: REFERRED BLOCKED */}
      {modal === "referred_blocked" && (
        <Modal onClose={() => setModal(null)}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>מעבר לסטטוס &quot;הופנה למסגרת&quot;</div>
          <div style={{ background: "#FDF6E7", border: "1px solid #B7791F33", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: T.warn, margin: "14px 0 20px" }}>לא ניתן לעבור לסטטוס זה — לתיק אין הפנייה פעילה. יש ליצור הפניה למסגרת לפני שינוי הסטטוס.</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setModal(null)} style={{ background: "transparent", color: T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>סגור</button>
            <button onClick={() => { setModal(null); setShowWizard(true) }} style={{ background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>+ יצירת הפניה</button>
          </div>
        </Modal>
      )}

      {/* MODAL: RED TRIAGE -> RAV FORM */}
      {modal === "triage" && (
        <Modal onClose={() => setModal(null)}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>סיווג התיק לאדום</div>
          <div style={{ fontSize: 13, color: T.slate, marginBottom: 18 }}>הסיווג יפתח אוטומטית טופס פנייה לרב אוברמייסטר.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>תיאור המקרה</label>
              <textarea rows={3} value={triageForm.description} onChange={e => setTriageForm(f => ({ ...f, description: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", border: `1px solid ${T.border}`, borderRadius: 8, resize: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>רמת דחיפות</label>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {[["low", "נמוכה"], ["medium", "בינונית"], ["high", "גבוהה"]].map(([v, l]) => (
                  <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "7px 12px", border: `1px solid ${triageForm.urgency === v ? T.breach : T.border}`, background: triageForm.urgency === v ? T.breachBg : "#fff", borderRadius: 8, cursor: "pointer" }}>
                    <input type="radio" name="urgency" checked={triageForm.urgency === v} onChange={() => setTriageForm(f => ({ ...f, urgency: v }))} />{l}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.slate }}>מה נדרש מהרב</label>
              <textarea rows={2} value={triageForm.ask} onChange={e => setTriageForm(f => ({ ...f, ask: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", border: `1px solid ${T.border}`, borderRadius: 8, resize: "none" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button onClick={() => setModal(null)} style={{ background: "transparent", color: T.slate, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>ביטול</button>
            <button onClick={submitTriage} style={{ background: T.breach, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>שלח לרב אוברמייסטר</button>
          </div>
        </Modal>
      )}

      {showWizard && (
        <ReferralWizard caseData={c} onClose={() => setShowWizard(false)} onSent={() => { setShowWizard(false); load() }} />
      )}
    </div>
  )
}
