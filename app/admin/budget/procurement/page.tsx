"use client"
// No screen in the design package covers vendors/purchase-requests (the
// 27-screen brief only ships F1 Budget Dashboard and F2 Funding Sources).
// Kept in the app's existing plain component style rather than improvising
// a "matching" visual design with nothing to match against.
import { useEffect, useState } from "react"
import Link from "next/link"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

const TABS = ["vendors", "requests"] as const
const TAB_LABEL: Record<string, string> = { vendors: "ספקים", requests: "דרישות רכש" }

export default function ProcurementPage() {
  const [tab, setTab] = useState<typeof TABS[number]>("requests")
  const [vendors, setVendors] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [vendorForm, setVendorForm] = useState({ name: "", contact: "", category: "" })
  const [reqForm, setReqForm] = useState({ requested_by: "", item: "", reason: "" })

  async function load() {
    setLoading(true); setError(false)
    try {
      const [v, r] = await Promise.all([fetch("/api/budget/vendors"), fetch("/api/budget/purchase-requests")])
      setVendors((await v.json()).vendors || [])
      setRequests((await r.json()).purchase_requests || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function addVendor() {
    if (!vendorForm.name) return
    await fetch("/api/budget/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vendorForm) })
    setVendorForm({ name: "", contact: "", category: "" }); await load()
  }
  async function addRequest() {
    if (!reqForm.requested_by || !reqForm.item) return
    await fetch("/api/budget/purchase-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqForm) })
    setReqForm({ requested_by: "", item: "", reason: "" }); await load()
  }
  async function approve(id: number) {
    await fetch("/api/budget/purchase-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", id }) })
    await load()
  }

  if (error) return <ErrorState retry={load} />

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="text-sm text-gray-500 mb-2">
        <Link href="/admin/budget">תקציב</Link> › רכש וספקים
      </div>
      <h1 className="text-xl font-bold mb-4">רכש וספקים</h1>
      <div className="flex gap-2 mb-4 border-b">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-semibold border-b-2 ${tab === t ? "border-[#00488D] text-[#00488D]" : "border-transparent text-gray-500"}`}>{TAB_LABEL[t]}</button>
        ))}
      </div>
      {loading ? <SkeletonCard /> : <>
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
