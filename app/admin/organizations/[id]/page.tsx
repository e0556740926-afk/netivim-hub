"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"
import { fd } from "@/lib/utils"

const TABS = ["contacts", "programs", "referrals", "retention"] as const
const TAB_LABEL: Record<string, string> = { contacts: "אנשי קשר", programs: "מסלולים", referrals: "היסטוריית הפניות", retention: "אישורי התמדה" }

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<typeof TABS[number]>("contacts")
  const [showProgramForm, setShowProgramForm] = useState(false)
  const [programForm, setProgramForm] = useState({ name: "", category: "", capacity: "", age_min: "", age_max: "" })

  async function load() {
    setLoading(true); setError(false)
    try {
      const r = await fetch(`/api/organizations/${id}`)
      if (!r.ok) throw new Error()
      setData(await r.json())
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  async function addProgram() {
    if (!programForm.name) return
    await fetch(`/api/organizations/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(programForm) })
    setProgramForm({ name: "", category: "", capacity: "", age_min: "", age_max: "" })
    setShowProgramForm(false)
    await load()
  }

  if (loading) return <div className="p-6"><SkeletonCard /></div>
  if (error || !data) return <ErrorState retry={load} />

  const { organization: org, contacts, programs, referrals, retention } = data

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="mb-4">
        <h1 className="text-xl font-bold">{org.name}</h1>
        <div className="text-sm text-gray-500">
          {org.category || "ללא קטגוריה"} · {org.region || "ללא אזור"} ·{" "}
          {org.owner_type ? (org.owner_type === "coordinator" ? "בעלים: רכז אזורי" : "בעלים: אלכסנדר שירצקי") : "⚠ טרם שויך בעלים"}
        </div>
      </div>

      <div className="flex gap-2 mb-4 border-b">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 ${tab === t ? "border-[#00488D] text-[#00488D]" : "border-transparent text-gray-500"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "contacts" && (
        <div className="grid gap-2">
          {contacts.map((c: any) => (
            <Card key={c.id} className="p-3 flex justify-between items-center">
              <div><span className="font-medium">{c.name}</span> <span className="text-sm text-gray-500">{c.role}</span></div>
              <div className="text-sm text-gray-500">{c.phone} · {c.email}</div>
            </Card>
          ))}
          {!contacts.length && <div className="text-gray-500 text-center py-6">אין עדיין אנשי קשר משויכים</div>}
        </div>
      )}

      {tab === "programs" && (
        <div>
          <Button size="sm" onClick={() => setShowProgramForm(s => !s)} className="mb-3">+ מסלול חדש</Button>
          {showProgramForm && (
            <Card className="p-3 mb-3 space-y-2">
              <input className="border rounded p-2 w-full" placeholder="שם המסלול" value={programForm.name} onChange={e => setProgramForm(f => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-3 gap-2">
                <input className="border rounded p-2" placeholder="קטגוריה" value={programForm.category} onChange={e => setProgramForm(f => ({ ...f, category: e.target.value }))} />
                <input className="border rounded p-2" placeholder="קיבולת" value={programForm.capacity} onChange={e => setProgramForm(f => ({ ...f, capacity: e.target.value }))} />
                <input className="border rounded p-2" placeholder="גילאים (למשל 17-19)" onChange={e => {
                  const [min, max] = e.target.value.split("-"); setProgramForm(f => ({ ...f, age_min: min, age_max: max }))
                }} />
              </div>
              <Button size="sm" onClick={addProgram}>שמור מסלול</Button>
            </Card>
          )}
          <div className="grid gap-2">
            {programs.map((p: any) => (
              <Card key={p.id} className="p-3 flex justify-between items-center">
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-gray-500">{p.category} · {p.current_count}/{p.capacity || "?"} מקומות · גילאי {p.age_min}-{p.age_max}</div>
              </Card>
            ))}
            {!programs.length && <div className="text-gray-500 text-center py-6">אין עדיין מסלולים מוגדרים</div>}
          </div>
        </div>
      )}

      {tab === "referrals" && (
        <div className="grid gap-2">
          {referrals.map((r: any) => (
            <Card key={r.id} className="p-3 flex justify-between items-center">
              <div className="font-medium">{r.case_name || `תיק #${r.case_id}`}</div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Badge text={r.status} />
                {fd(r.status_date)}
              </div>
            </Card>
          ))}
          {!referrals.length && <div className="text-gray-500 text-center py-6">אין עדיין הפניות למוסד זה</div>}
        </div>
      )}

      {tab === "retention" && (
        <div className="grid gap-2">
          {retention.map((r: any) => (
            <Card key={r.id} className="p-3 flex justify-between items-center">
              <div className="font-medium">{r.quarter}</div>
              <Badge text={r.confirmed_at ? "אושר" : "ממתין לאישור"} />
            </Card>
          ))}
          {!retention.length && <div className="text-gray-500 text-center py-6">אין עדיין אישורי התמדה — ייווצרו אוטומטית מדי רבעון</div>}
        </div>
      )}
    </div>
  )
}
