"use client"
import { useEffect, useState } from "react"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"
import { fd } from "@/lib/utils"

const TABS = ["sources", "vendors", "requests"] as const
const TAB_LABEL: Record<string, string> = { sources: "מקורות מימון", vendors: "ספקים", requests: "דרישות רכש" }

export default function BudgetPage() {
  const [tab, setTab] = useState<typeof TABS[number]>("sources")
  const [sources, setSources] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [srcForm, setSrcForm] = useState({ funder: "", purpose: "", amount: "", period_start: "", period_end: "" })
  const [vendorForm, setVendorForm] = useState({ name: "", contact: "", category: "" })
  const [reqForm, setReqForm] = useState({ requested_by: "", item: "", reason: "" })

  async function load() {
    setLoading(true); setError(false)
    try {
      const [s, v, r] = await Promise.all([
        fetch("/api/budget/funding-sources"), fetch("/api/budget/vendors"), fetch("/api/budget/purchase-requests"),
      ])
      setSources((await s.json()).funding_sources || [])
      setVendors((await v.json()).vendors || [])
      setRequests((await r.json()).purchase_requests || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function addSource() {
    if (!srcForm.funder || !srcForm.amount) return
    await fetch("/api/budget/funding-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...srcForm, amount: Number(srcForm.amount) }) })
    setSrcForm({ funder: "", purpose: "", amount: "", period_start: "", period_end: "" })
    await load()
  }
  async function addVendor() {
    if (!vendorForm.name) return
    await fetch("/api/budget/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vendorForm) })
    setVendorForm({ name: "", contact: "", category: "" })
    await load()
  }
  async function addRequest() {
    if (!reqForm.requested_by || !reqForm.item) return
    await fetch("/api/budget/purchase-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqForm) })
    setReqForm({ requested_by: "", item: "", reason: "" })
    await load()
  }
  async function approve(id: number) {
    await fetch("/api/budget/purchase-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", id }) })
    await load()
  }

  if (error) return <ErrorState retry={load} />

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <h1 className="text-xl font-bold mb-4">תקציב ורכש</h1>
      <div className="flex gap-2 mb-4 border-b">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-semibold border-b-2 ${tab === t ? "border-[#00488D] text-[#00488D]" : "border-transparent text-gray-500"}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? <SkeletonCard /> : <>
        {tab === "sources" && (
          <div>
            <Card className="p-3 mb-3 grid grid-cols-2 gap-2">
              <input className="border rounded p-2" placeholder="מממן" value={srcForm.funder} onChange={e => setSrcForm(f => ({ ...f, funder: e.target.value }))} />
              <input className="border rounded p-2" placeholder="ייעוד" value={srcForm.purpose} onChange={e => setSrcForm(f => ({ ...f, purpose: e.target.value }))} />
              <input className="border rounded p-2" type="number" placeholder="סכום" value={srcForm.amount} onChange={e => setSrcForm(f => ({ ...f, amount: e.target.value }))} />
              <input className="border rounded p-2" type="date" placeholder="תוקף עד" value={srcForm.period_end} onChange={e => setSrcForm(f => ({ ...f, period_end: e.target.value }))} />
              <Button size="sm" onClick={addSource} className="col-span-2">+ הוסף מקור מימון</Button>
            </Card>
            <div className="grid gap-2">
              {sources.map(s => {
                const pct = s.amount ? Math.round((s.used_amount / s.amount) * 100) : 0
                return (
                  <Card key={s.id} className="p-3">
                    <div className="flex justify-between items-center mb-1">
                      <div className="font-medium">{s.funder} <span className="text-xs text-gray-500">{s.purpose}</span></div>
                      <Badge text={`${pct}% נוצל`} bg={pct > 90 ? "#FEE2E2" : "#DCFCE7"} color={pct > 90 ? "#991B1B" : "#166534"} />
                    </div>
                    <div className="text-xs text-gray-500">₪{Number(s.used_amount).toLocaleString()} / ₪{Number(s.amount).toLocaleString()} · תוקף עד {s.period_end ? fd(s.period_end) : "ללא הגבלה"}</div>
                  </Card>
                )
              })}
              {!sources.length && <div className="text-gray-500 text-center py-6">אין עדיין מקורות מימון</div>}
            </div>
          </div>
        )}

        {tab === "vendors" && (
          <div>
            <Card className="p-3 mb-3 grid grid-cols-3 gap-2">
              <input className="border rounded p-2" placeholder="שם ספק" value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} />
              <input className="border rounded p-2" placeholder="איש קשר" value={vendorForm.contact} onChange={e => setVendorForm(f => ({ ...f, contact: e.target.value }))} />
              <input className="border rounded p-2" placeholder="קטגוריה" value={vendorForm.category} onChange={e => setVendorForm(f => ({ ...f, category: e.target.value }))} />
              <Button size="sm" onClick={addVendor} className="col-span-3">+ הוסף ספק</Button>
            </Card>
            <div className="grid gap-2">
              {vendors.map(v => (
                <Card key={v.id} className="p-3 flex justify-between items-center">
                  <div className="font-medium">{v.name}</div>
                  <div className="text-sm text-gray-500">{v.category} · {v.order_count} הזמנות</div>
                </Card>
              ))}
              {!vendors.length && <div className="text-gray-500 text-center py-6">אין עדיין ספקים</div>}
            </div>
          </div>
        )}

        {tab === "requests" && (
          <div>
            <Card className="p-3 mb-3 grid grid-cols-3 gap-2">
              <input className="border rounded p-2" placeholder="מבקש" value={reqForm.requested_by} onChange={e => setReqForm(f => ({ ...f, requested_by: e.target.value }))} />
              <input className="border rounded p-2" placeholder="פריט" value={reqForm.item} onChange={e => setReqForm(f => ({ ...f, item: e.target.value }))} />
              <input className="border rounded p-2" placeholder="סיבה" value={reqForm.reason} onChange={e => setReqForm(f => ({ ...f, reason: e.target.value }))} />
              <Button size="sm" onClick={addRequest} className="col-span-3">+ דרישת רכש חדשה</Button>
            </Card>
            <div className="grid gap-2">
              {requests.map(r => (
                <Card key={r.id} className="p-3 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{r.item}</div>
                    <div className="text-xs text-gray-500">{r.requested_by} · {r.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge text={r.po_number ? `הוזמן (${r.po_number})` : r.status} />
                    {r.status === "pending" && <Button size="sm" onClick={() => approve(r.id)}>אשר והזמן</Button>}
                  </div>
                </Card>
              ))}
              {!requests.length && <div className="text-gray-500 text-center py-6">אין עדיין דרישות רכש</div>}
            </div>
          </div>
        )}
      </>}
    </div>
  )
}
