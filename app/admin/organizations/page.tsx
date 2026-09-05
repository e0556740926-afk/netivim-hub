"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

const OWNER_LABEL: Record<string,string> = { coordinator: "רכז אזורי", alexander: "אלכסנדר שירצקי" }

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", category: "", region: "", owner_type: "" })
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState("")

  async function load() {
    setLoading(true); setError(false)
    try {
      const r = await fetch("/api/organizations")
      const { organizations } = await r.json()
      setOrgs(organizations || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function submit() {
    if (!form.name) return
    setSaving(true)
    try {
      await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      setForm({ name: "", category: "", region: "", owner_type: "" })
      setShowForm(false)
      await load()
    } finally { setSaving(false) }
  }

  const filtered = orgs.filter(o => !q || o.name.includes(q))

  if (error) return <ErrorState retry={load} />

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">מוסדות</h1>
        <Button onClick={() => setShowForm(s => !s)}>+ מוסד חדש</Button>
      </div>

      {showForm && (
        <Card className="p-4 mb-4 space-y-3">
          <input className="border rounded p-2 w-full" placeholder="שם המוסד" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded p-2" placeholder="קטגוריה (קרבי/טכנולוגי/הסדר/מכינה/תומכ״ל/תיכוני)" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            <input className="border rounded p-2" placeholder="אזור" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} />
          </div>
          <select className="border rounded p-2 w-full" value={form.owner_type} onChange={e => setForm(f => ({ ...f, owner_type: e.target.value }))}>
            <option value="">בעלים — טרם שויך</option>
            <option value="coordinator">רכז אזורי</option>
            <option value="alexander">אלכסנדר שירצקי</option>
          </select>
          <Button onClick={submit} disabled={saving}>{saving ? "שומר..." : "שמור"}</Button>
        </Card>
      )}

      <input className="border rounded p-2 w-full mb-4" placeholder="חיפוש מוסד..." value={q} onChange={e => setQ(e.target.value)} />

      {loading ? <SkeletonCard /> : (
        <div className="grid gap-3">
          {filtered.map(o => (
            <Link key={o.id} href={`/admin/organizations/${o.id}`}>
              <Card className="p-4 flex items-center justify-between hover:shadow-md transition">
                <div>
                  <div className="font-semibold">{o.name}</div>
                  <div className="text-sm text-gray-500">{o.category || "לא סווג"} · {o.region || "אזור לא ידוע"}</div>
                </div>
                <div className="flex items-center gap-3">
                  {!o.owner_type && <Badge text="דורש סיווג בעלים" bg="#FEF3C7" color="#B45309" />}
                  <Badge text={`${o.contact_count} אנשי קשר`} />
                  <Badge text={`${o.program_count} מסלולים`} />
                  <Badge text={`${o.referral_count} הפניות`} />
                </div>
              </Card>
            </Link>
          ))}
          {!filtered.length && <div className="text-gray-500 text-center py-8">לא נמצאו מוסדות</div>}
        </div>
      )}
    </div>
  )
}
