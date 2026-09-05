"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"
import { fd } from "@/lib/utils"

const TRANSITIONS: Record<string, string[]> = {
  "פנייה חדשה": ["בתהליך ייעוץ", "לא פעיל"],
  "בתהליך ייעוץ": ["הופנה למסגרת", "לא פעיל"],
  "הופנה למסגרת": ["התקבל למסגרת", "בתהליך ייעוץ", "לא פעיל"],
  "התקבל למסגרת": ["שובץ במסגרת", "לא פעיל"],
  "שובץ במסגרת": ["הסתיים בהצלחה", "לא פעיל"],
  "לא פעיל": ["בתהליך ייעוץ"],
  "הסתיים בהצלחה": [],
}
const TABS = ["extended", "protected", "referrals", "history"] as const
const TAB_LABEL: Record<string, string> = { extended: "מידע מורחב", protected: "מידע מוגן", referrals: "הפניות", history: "היסטוריית סטטוס" }

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<any>(null)
  const [orgs, setOrgs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<typeof TABS[number]>("referrals")
  const [inactiveReason, setInactiveReason] = useState("")
  const [showInactiveModal, setShowInactiveModal] = useState<string | null>(null)
  const [extended, setExtended] = useState({ education_background: "", army_status: "", family_status: "", aspirations: "", skills: "" })
  const [protectedData, setProtectedData] = useState<any>(null)
  const [protectedOpen, setProtectedOpen] = useState(false)
  const [referralForm, setReferralForm] = useState({ organization_id: "", summary_text: "" })

  async function load() {
    setLoading(true); setError(false)
    try {
      const [r, orgR] = await Promise.all([fetch(`/api/cases/${id}`), fetch("/api/organizations")])
      if (!r.ok) throw new Error()
      const d = await r.json()
      setData(d)
      if (d.extended) setExtended(d.extended)
      const { organizations } = await orgR.json()
      setOrgs(organizations || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  async function changeStatus(next: string, reason?: string) {
    const r = await fetch("/api/cases", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(id), advisor_status: next, inactive_reason: reason }),
    })
    if (!r.ok) { const { error } = await r.json(); alert(error); return }
    setShowInactiveModal(null); setInactiveReason("")
    await load()
  }

  async function setTriage(color: string) {
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_triage", triage_color: color }) })
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

  async function sendReferral() {
    if (!referralForm.organization_id) return
    const r = await fetch("/api/referrals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: Number(id), organization_id: Number(referralForm.organization_id), summary_text: referralForm.summary_text }),
    })
    if (!r.ok) { const { error } = await r.json(); alert(error); return }
    setReferralForm({ organization_id: "", summary_text: "" })
    await load()
  }

  async function updateReferralStatus(refId: number, status: string) {
    const r = await fetch("/api/referrals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: refId, status }) })
    const { siblings_to_close } = await r.json()
    if (siblings_to_close?.length) alert(`התקבל! ${siblings_to_close.length} הפניות מקבילות נותרו פתוחות — סגור אותן ידנית עם סיבה.`)
    await load()
  }

  if (loading) return <div className="p-6"><SkeletonCard /></div>
  if (error || !data) return <ErrorState retry={load} />

  const { case: c, referrals, history } = data
  const allowedNext = TRANSITIONS[c.advisor_status] || []

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">{c.name}</h1>
        <div className="flex gap-1">
          {["red", "yellow", "green"].map(color => (
            <button key={color} onClick={() => setTriage(color)}
              className="w-5 h-5 rounded-full border-2"
              style={{ background: color === "red" ? "#EF4444" : color === "yellow" ? "#F59E0B" : "#22C55E", borderColor: c.triage_color === color ? "#0D2744" : "transparent" }}
              title={color === "red" ? "אדום — לרב אוברמייסטר" : color === "yellow" ? "צהוב — דורש בירור" : "ירוק — מעבירים להפניה"} />
          ))}
        </div>
      </div>
      <div className="text-sm text-gray-500 mb-4">{c.city} · גיל {c.age} · {c.phone} · מקור: {c.source}</div>

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <Badge text={c.advisor_status || "פנייה חדשה"} />
          <span className="text-xs text-gray-500">מעבר הבא:</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {allowedNext.map(s => (
            <Button key={s} size="sm" variant={s === "לא פעיל" ? "danger" : "secondary"}
              onClick={() => s === "לא פעיל" ? setShowInactiveModal(s) : changeStatus(s)}>
              {s}
            </Button>
          ))}
          {!allowedNext.length && <span className="text-sm text-gray-400">תיק סגור — הסתיים בהצלחה</span>}
        </div>
        {showInactiveModal && (
          <div className="mt-3 flex gap-2">
            <select className="border rounded p-2 flex-1" value={inactiveReason} onChange={e => setInactiveReason(e.target.value)}>
              <option value="">בחר סיבה...</option>
              <option>אין מענה</option><option>לא מעוניין</option><option>לא רלוונטי</option><option>פעילות קהילתית</option>
            </select>
            <Button size="sm" onClick={() => changeStatus(showInactiveModal, inactiveReason)} disabled={!inactiveReason}>אישור</Button>
          </div>
        )}
      </Card>

      <div className="flex gap-2 mb-4 border-b">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-semibold border-b-2 ${tab === t ? "border-[#00488D] text-[#00488D]" : "border-transparent text-gray-500"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "extended" && (
        <Card className="p-4 space-y-2">
          <textarea className="border rounded p-2 w-full" placeholder="רקע לימודי" value={extended.education_background} onChange={e => setExtended(x => ({ ...x, education_background: e.target.value }))} />
          <textarea className="border rounded p-2 w-full" placeholder="סטטוס צה״ל וקב״ס" value={extended.army_status} onChange={e => setExtended(x => ({ ...x, army_status: e.target.value }))} />
          <textarea className="border rounded p-2 w-full" placeholder="מצב משפחתי" value={extended.family_status} onChange={e => setExtended(x => ({ ...x, family_status: e.target.value }))} />
          <textarea className="border rounded p-2 w-full" placeholder="שאיפות וכישורים" value={extended.aspirations} onChange={e => setExtended(x => ({ ...x, aspirations: e.target.value }))} />
          <Button size="sm" onClick={saveExtended}>שמור</Button>
        </Card>
      )}

      {tab === "protected" && (
        <Card className="p-4">
          {!protectedOpen ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-2">🔒</div>
              <div className="text-sm text-gray-500 mb-3">מידע מוגן — נגיש ליועץ המטפל, למנהל הצוות ולרב בלבד. הפתיחה נרשמת.</div>
              <Button size="sm" onClick={openProtected}>פתח מידע מוגן</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea className="border rounded p-2 w-full" placeholder="מידע רגיש..." value={protectedData?.notes || ""} onChange={e => setProtectedData((p: any) => ({ ...p, notes: e.target.value }))} />
              <Button size="sm" onClick={saveProtected}>שמור</Button>
            </div>
          )}
        </Card>
      )}

      {tab === "referrals" && (
        <div>
          <Card className="p-3 mb-3 flex gap-2 items-end">
            <select className="border rounded p-2 flex-1" value={referralForm.organization_id} onChange={e => setReferralForm(f => ({ ...f, organization_id: e.target.value }))}>
              <option value="">בחר מוסד להפניה...</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input className="border rounded p-2 flex-1" placeholder="פסקת סיכום" value={referralForm.summary_text} onChange={e => setReferralForm(f => ({ ...f, summary_text: e.target.value }))} />
            <Button size="sm" onClick={sendReferral}>שלח הפניה</Button>
          </Card>
          <div className="grid gap-2">
            {referrals.map((r: any) => (
              <Card key={r.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.organization_name}{r.program_name ? ` · ${r.program_name}` : ""}</div>
                  <div className="text-xs text-gray-500">{fd(r.status_date)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge text={r.status} />
                  {r.status === "ממתין" && (
                    <>
                      <Button size="sm" variant="success" onClick={() => updateReferralStatus(r.id, "התקבל")}>התקבל</Button>
                      <Button size="sm" variant="danger" onClick={() => updateReferralStatus(r.id, "לא התקבל")}>לא התקבל</Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
            {!referrals.length && <div className="text-gray-500 text-center py-6">אין עדיין הפניות — עד 3 יכולות להיות פתוחות במקביל</div>}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="grid gap-2">
          {history.map((h: any) => (
            <Card key={h.id} className="p-3 flex items-center justify-between text-sm">
              <div>{h.from_status || "—"} ← {h.to_status}</div>
              <div className="text-gray-500">{h.changed_by} · {fd(h.changed_at)}</div>
            </Card>
          ))}
          {!history.length && <div className="text-gray-500 text-center py-6">אין עדיין שינויי סטטוס</div>}
        </div>
      )}
    </div>
  )
}
