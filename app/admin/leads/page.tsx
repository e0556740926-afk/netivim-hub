"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import SfStatusBadge from "@/components/ui/SfStatusBadge"
import Pagination, { usePagination } from "@/components/ui/Pagination"
import { useSort } from "@/components/ui/SortableTable"
import { useUrlState } from "@/lib/use-url-state"
import { usePathname, useRouter } from "next/navigation"
import { useQuickAction } from "@/lib/quick-action"
import { useAuth } from "@/lib/auth-context"
import { accessLevel, levelAllowsWrite } from "@/lib/permission-matrix"
import { fd } from "@/lib/utils"
import AuditHistory from "@/components/ui/AuditHistory"
import ErrorState from "@/components/ui/ErrorState"
import { useToast } from "@/components/ui/Toast"
import Sheet from "@/components/shell/Sheet"
import { Icon } from "@/components/shell/icons"
import "@/components/leads/leads.css"

// Field-only lead handling: leads are entered here (or via personal /
// source / referral links) and passed on to Salesforce. The record holds
// exactly what was typed in; the details panel shows and edits every one
// of those fields. Statuses are the four existing ones — unchanged.
const STATUS_LABEL: Record<string, string> = { new: "חדש", contacted: "יצרתי קשר", advanced: "עבר לשלב", irrelevant: "לא רלוונטי" }
const STATUSES = Object.keys(STATUS_LABEL)
const SOURCE_LABEL: Record<string, string> = { link: "לינק אישי", event: "אירוע", manual: "הזנה ידנית" }
const INTEREST_LABEL: Record<string, string> = { training: "הכשרה / מסגרת", military: "שירות צבאי", other: "אחר" }

const EMPTY_FORM = { firstName: "", lastName: "", phone: "", email: "", city: "", age: "", idNumber: "", notes: "", coordinator_id: "", owner_name: "", eventId: "", leadSourceId: "", arrivalChannelId: "", isParent: false }
type NewForm = typeof EMPTY_FORM
type EditForm = {
  name: string; phone: string; email: string; city: string; age: string; id_number: string
  interest: string; status: string; source: string; event_id: string; lead_source_id: string
  arrival_channel_id: string; assign: string; is_parent: boolean; notes: string
}

// Table columns. "name" is always shown; the rest can be toggled. Defaults
// follow the plan: who handles it, status, where it came from, event, date.
type ColKey = "owner" | "status" | "source" | "event" | "created" | "city" | "age" | "id_number" | "email"
const COLS: { key: ColKey; label: string; sort: string; def: boolean }[] = [
  { key: "owner", label: "אחראי לטיפול", sort: "owner_display", def: true },
  { key: "status", label: "סטטוס", sort: "status", def: true },
  { key: "source", label: "מקור וערוץ", sort: "lead_source_label", def: true },
  { key: "event", label: "אירוע", sort: "event_name", def: true },
  { key: "created", label: "תאריך יצירה", sort: "created_at", def: true },
  { key: "city", label: "עיר", sort: "city", def: false },
  { key: "age", label: "גיל", sort: "age", def: false },
  { key: "id_number", label: "ת״ז", sort: "id_number", def: false },
  { key: "email", label: "דוא״ל", sort: "email", def: false },
]
const COLS_KEY = "netivim-leads-columns" // column choice only — no personal data
const DEFAULT_COLS = COLS.filter(c => c.def).map(c => c.key)

const monthKey = (d?: string) => (d ? d.slice(0, 7) : "")
const waLink = (phone?: string) => `https://wa.me/972${String(phone || "").replace(/^0/, "").replace(/[^0-9]/g, "")}`
const none = <span className="lw-none">לא צוין</span>

async function api(url: string, method: string, body?: unknown) {
  let res: Response
  try { res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }) }
  catch { throw Object.assign(new Error("אין חיבור לשרת. הפרטים נשמרו כאן — אפשר לנסות שוב."), { network: true }) }
  let d: any = {}
  try { d = await res.json() } catch {}
  if (!res.ok || d.error) throw Object.assign(new Error(d.error || "הפעולה לא הושלמה. אפשר לנסות שוב."), { data: d, status: res.status })
  return d
}

export default function AdminLeads() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { success, error: toastError, undoable } = useToast()
  const level = user ? (user.role === "admin" ? "M" : accessLevel(user, "leads")) : "NONE"
  const canWrite = !!user && user.role !== "viewer" && levelAllowsWrite(level)
  const canBulk = level === "M" || level === "E"
  const canDelete = level === "M"
  const canExport = user?.role === "admin" // /api/export is admin-only on the server

  const [leads, setLeads] = useState<any[]>([])
  const [aggregate, setAggregate] = useState<any[] | null>(null)
  const [coords, setCoords] = useState<any[]>([])
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [leadSources, setLeadSources] = useState<any[]>([])
  const [arrivalChannels, setArrivalChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [staleError, setStaleError] = useState(false)

  // Filters live in the URL (reload/back-safe, shareable).
  const [q, setQ] = useUrlState("q")
  const [filterOwner, setFilterOwner] = useUrlState("coord")
  const [filterStatus, setFilterStatus] = useUrlState("status")
  const [filterSource, setFilterSource] = useUrlState("source")
  const [filterMonth, setFilterMonth] = useUrlState("month")
  const [filterSf, setFilterSf] = useUrlState("sf")

  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS)
  const [colsOpen, setColsOpen] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkTarget, setBulkTarget] = useState("")
  const [bulkStatus, setBulkStatus] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<null | { ids: number[]; names: string[] }>(null)

  // New lead form — the draft stays in memory if the window is closed.
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<NewForm>({ ...EMPTY_FORM })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formAlert, setFormAlert] = useState("")
  const [saving, setSaving] = useState(false)
  const [dupBlock, setDupBlock] = useState<any>(null)
  const [liveDup, setLiveDup] = useState<{ state: "idle" | "pending" | "done" | "failed"; matches: any[] }>({ state: "idle", matches: [] })

  // Details panel
  const [openId, setOpenId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<EditForm | null>(null)
  const [editErr, setEditErr] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const openLead = openId ? leads.find(l => l.id === openId) || null : null

  // ── data ────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else { setLoading(true); setError(false) }
    try {
      const [lr, ua, er, lsr, acr] = await Promise.all([
        fetch("/api/leads"), fetch("/api/users/all"), fetch("/api/events"), fetch("/api/admin/lead-sources"), fetch("/api/arrival-channels"),
      ])
      if (!lr.ok) throw new Error()
      const ld = await lr.json()
      const ud = ua.ok ? await ua.json() : {}
      const ed = er.ok ? await er.json() : {}
      const sd = lsr.ok ? await lsr.json() : {}
      const cd = acr.ok ? await acr.json() : {}
      setLeads(ld.leads || [])
      setAggregate(ld.status_only ? ld.aggregate || [] : null)
      setCoords(ud.coordinators || []); setAdminUsers(ud.admins || [])
      setEvents(ed.events || []); setLeadSources(sd.lead_sources || []); setArrivalChannels(cd.arrival_channels || [])
      setStaleError(false)
    } catch {
      if (silent) setStaleError(true); else setError(true)
    } finally { setLoading(false); setRefreshing(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Column preference (local, no PII)
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(COLS_KEY) || "null"); if (Array.isArray(v)) setCols(v.filter((k: string) => COLS.some(c => c.key === k))) } catch {}
  }, [])
  function toggleCol(k: ColKey) {
    setCols(prev => {
      const next = prev.includes(k) ? prev.filter(x => x !== k) : COLS.map(c => c.key).filter(x => x === k || prev.includes(x))
      try { localStorage.setItem(COLS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }
  useEffect(() => {
    if (!colsOpen) return
    const off = (e: MouseEvent) => { if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setColsOpen(false) }
    document.addEventListener("mousedown", off); document.addEventListener("keydown", key)
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key) }
  }, [colsOpen])

  // Deep link: /admin/leads?open=<id>
  useEffect(() => {
    if (loading || !leads.length) return
    const url = new URL(window.location.href)
    const id = Number(url.searchParams.get("open"))
    if (!id) return
    url.searchParams.delete("open")
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    if (leads.some(l => l.id === id)) openDetail(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // "+ הוספה" (phone shell) → this same form
  useQuickAction(["lead"], () => openForm(), !loading && canWrite)

  // Live duplicate hint while typing — non-blocking; the server still
  // blocks on save. A late answer for a value that has since changed is
  // ignored, and a failed check never claims "no duplicate".
  const dupSeq = useRef(0)
  useEffect(() => {
    const phoneReady = form.phone.replace(/\D/g, "").length >= 9
    const idReady = form.idNumber.length === 9
    if (!formOpen || (!phoneReady && !idReady)) { setLiveDup({ state: "idle", matches: [] }); return }
    const seq = ++dupSeq.current
    setLiveDup(s => ({ ...s, state: "pending" }))
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (phoneReady) params.set("phone", form.phone)
      if (idReady) params.set("id_number", form.idNumber)
      fetch(`/api/leads/check-duplicate?${params}`).then(r => r.ok ? r.json() : Promise.reject())
        .then(d => { if (seq === dupSeq.current) setLiveDup({ state: "done", matches: d.matches || [] }) })
        .catch(() => { if (seq === dupSeq.current) setLiveDup({ state: "failed", matches: [] }) })
    }, 500)
    return () => clearTimeout(t)
  }, [form.phone, form.idNumber, formOpen])

  // ── filtering / counts ──────────────────────────────────────
  const months = useMemo(() => Array.from(new Set(leads.map(l => monthKey(l.created_at)).filter(Boolean))).sort().reverse(), [leads])
  const matchesBase = useCallback((l: any) => {
    const needle = q.trim()
    if (needle && !((l.name || "") + " " + (l.phone || "") + " " + (l.email || "") + " " + (l.city || "")).includes(needle)) return false
    if (filterOwner) {
      if (filterOwner.startsWith("admin_")) { if (l.coordinator_id || l.owner_name !== filterOwner.replace("admin_", "")) return false }
      else if (String(l.coordinator_id) !== filterOwner) return false
    }
    if (filterSource && String(l.lead_source_id) !== filterSource) return false
    if (filterMonth && monthKey(l.created_at) !== filterMonth) return false
    return true
  }, [q, filterOwner, filterSource, filterMonth])
  const base = useMemo(() => leads.filter(matchesBase), [leads, matchesBase])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length }
    for (const s of STATUSES) c[s] = 0
    for (const l of base) if (c[l.status] !== undefined) c[l.status]++
    if (aggregate) { c.all = 0; for (const r of aggregate) { c[r.status] = Number(r.n) || 0; c.all += Number(r.n) || 0 } }
    return c
  }, [base, aggregate])
  // Salesforce delivery filter: "missing" = should be in Salesforce (link/manual) but isn't linked; "failed" = a send that was refused.
  const sfMissing = (l: any) => !l.sf_record_id && (l.source === "link" || l.source === "manual") && l.sf_sync_state !== "exists"
  const filteredRaw = useMemo(() => {
    let r = filterStatus ? base.filter(l => l.status === filterStatus) : base
    if (filterSf === "missing") r = r.filter(sfMissing)
    else if (filterSf === "failed") r = r.filter(l => l.sf_sync_state === "failed")
    return r
  }, [base, filterStatus, filterSf])
  const { sorted: filtered, sortKey, sortDir, toggleSort } = useSort(filteredRaw, "created_at", "desc")
  const pg = usePagination(filtered, 50)
  const hasFilters = !!(q || filterOwner || filterStatus || filterSource || filterMonth || filterSf)
  // One URL replace for all filters (several setters in a row would each rebuild from the same stale query).
  const clearFilters = () => router.replace(pathname, { scroll: false })

  // A changed search/filter clears the selection, so a bulk action never
  // silently hits rows the user can no longer see. Paging keeps it.
  const filterKey = [q, filterOwner, filterStatus, filterSource, filterMonth, filterSf].join("|")
  useEffect(() => { setSelected(new Set()); pg.setPage(1) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterKey])

  const ownerLabel = (v: string) => v.startsWith("admin_") ? v.replace("admin_", "") : coords.find(c => String(c.id) === v)?.name || v
  const chips = [
    q && { k: "q", label: `חיפוש: ${q}`, clear: () => setQ("") },
    filterOwner && { k: "owner", label: `אחראי: ${ownerLabel(filterOwner)}`, clear: () => setFilterOwner("") },
    filterStatus && { k: "status", label: `סטטוס: ${STATUS_LABEL[filterStatus] || filterStatus}`, clear: () => setFilterStatus("") },
    filterSource && { k: "source", label: `מקור: ${leadSources.find(s => String(s.id) === filterSource)?.label || filterSource}`, clear: () => setFilterSource("") },
    filterMonth && { k: "month", label: `חודש: ${filterMonth.slice(5, 7)}/${filterMonth.slice(0, 4)}`, clear: () => setFilterMonth("") },
    filterSf && { k: "sf", label: filterSf === "failed" ? "סילפרוס: נכשלו" : "סילפרוס: לא נכנסו", clear: () => setFilterSf("") },
  ].filter(Boolean) as { k: string; label: string; clear: () => void }[]

  const visibleCols = COLS.filter(c => cols.includes(c.key))
  const sortCol = [{ sort: "name", label: "שם" }, ...COLS].find(c => c.sort === sortKey)
  const sortHidden = sortKey && sortKey !== "name" && sortKey !== "phone" && !visibleCols.some(c => c.sort === sortKey)
  const extraCols = cols.some(k => !DEFAULT_COLS.includes(k))

  // ── actions ─────────────────────────────────────────────────
  function openForm() {
    // Any draft typed earlier is kept and shown again.
    setFormAlert(""); setFormErrors({}); setDupBlock(null)
    setFormOpen(true)
  }
  const formDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_FORM)

  async function addLead() {
    const errs: Record<string, string> = {}
    if (!form.firstName.trim()) errs.firstName = "יש להזין שם פרטי"
    if (!form.phone.trim()) errs.phone = "יש להזין טלפון"
    if (!form.coordinator_id && !form.owner_name) errs.assign = "יש לבחור אחראי לטיפול"
    if (!form.leadSourceId) errs.leadSourceId = "יש לבחור מקור פנייה"
    if (!form.arrivalChannelId) errs.arrivalChannelId = "יש לבחור ערוץ הגעה"
    setFormErrors(errs); setFormAlert(""); setDupBlock(null)
    const first = ["firstName", "phone", "assign", "leadSourceId", "arrivalChannelId"].find(k => errs[k])
    if (first) { document.getElementById(`lf-${first}`)?.focus(); return }
    setSaving(true)
    try {
      await api("/api/leads", "POST", {
        coordinator_id: form.coordinator_id ? +form.coordinator_id : null,
        owner_name: form.owner_name || "",
        name: `${form.firstName} ${form.lastName}`.trim(),
        phone: form.phone, email: form.email, city: form.city,
        age: form.age ? +form.age : null, id_number: form.idNumber, notes: form.notes,
        is_parent: form.isParent, event_id: form.eventId || null,
        lead_source_id: +form.leadSourceId, arrival_channel_id: +form.arrivalChannelId,
        source: form.eventId ? "event" : "manual",
      })
      setForm({ ...EMPTY_FORM }); setFormOpen(false)
      success("הליד נוסף")
      load(true)
    } catch (e: any) {
      if (e?.data?.error === "כפילות") { setDupBlock(e.data.duplicate || {}); document.getElementById("lf-phone")?.focus() }
      else setFormAlert(e.message)
    } finally { setSaving(false) }
  }

  function editFrom(l: any): EditForm {
    return {
      name: l.name || "", phone: l.phone || "", email: l.email || "", city: l.city || "",
      age: l.age ?? "", id_number: l.id_number || "", interest: l.interest || "training",
      status: l.status || "new", source: l.source || "manual",
      event_id: l.event_id ? String(l.event_id) : "",
      lead_source_id: l.lead_source_id ? String(l.lead_source_id) : "",
      arrival_channel_id: l.arrival_channel_id ? String(l.arrival_channel_id) : "",
      assign: l.coordinator_id ? "coord_" + l.coordinator_id : l.owner_name ? "admin_" + l.owner_name : "",
      is_parent: !!l.is_parent, notes: l.notes || "",
    }
  }
  function openDetail(id: number) {
    const l = leads.find(x => x.id === id)
    setOpenId(id); setEditing(false); setEditErr("")
    if (l) setEdit(editFrom(l))
  }

  async function saveEdit() {
    if (!openLead || !edit) return
    if (!edit.name.trim() || !edit.phone.trim()) { setEditErr("שם וטלפון הם שדות חובה"); return }
    setEditErr(""); setEditSaving(true)
    const isCoord = edit.assign.startsWith("coord_")
    try {
      await api("/api/leads", "PATCH", {
        id: openLead.id,
        name: edit.name, phone: edit.phone, email: edit.email, city: edit.city,
        age: edit.age === "" ? null : +edit.age, id_number: edit.id_number,
        interest: edit.interest, status: edit.status, source: edit.source,
        event_id: edit.event_id || null, lead_source_id: edit.lead_source_id || null,
        arrival_channel_id: edit.arrival_channel_id || null,
        coordinator_id: isCoord ? +edit.assign.replace("coord_", "") : null,
        owner_name: edit.assign.startsWith("admin_") ? edit.assign.replace("admin_", "") : "",
        is_parent: edit.is_parent, notes: edit.notes,
      })
      success("הליד עודכן"); setEditing(false)
      await load(true)
    } catch (e: any) {
      setEditErr(e?.data?.error === "כפילות" ? `טלפון / ת״ז כבר קיימים אצל ${e.data.duplicate?.name || "ליד אחר"}` : e.message)
    } finally { setEditSaving(false) }
  }

  async function quickStatus(l: any, status: string) {
    const prev = l.status
    setLeads(ls => ls.map(x => x.id === l.id ? { ...x, status } : x))
    try { await api("/api/leads", "PATCH", { id: l.id, status }) }
    catch (e: any) { setLeads(ls => ls.map(x => x.id === l.id ? { ...x, status: prev } : x)); toastError(e.message) }
  }

  async function deleteLead(l: any) {
    try {
      const d = await api("/api/leads", "DELETE", { id: l.id })
      setOpenId(null)
      setLeads(ls => ls.filter(x => x.id !== l.id))
      if (d.soft) undoable(`${l.name} נמחק`, async () => { await api("/api/leads", "PUT", { id: l.id, restore: true }).catch(() => {}); load(true) })
      else success("הליד נמחק")
    } catch (e: any) { toastError(e.message) }
  }

  async function bulk(body: any, done: string) {
    setBulkBusy(true)
    try {
      const d = await api("/api/leads/bulk", "POST", { ids: [...selected], ...body })
      success(`${done} · ${d.count ?? selected.size} לידים`)
      setSelected(new Set()); setBulkTarget(""); setBulkStatus(""); setConfirmDelete(null)
      await load(true)
    } catch (e: any) { toastError(e.message) } // selection is kept so the user can retry
    finally { setBulkBusy(false) }
  }

  const SF_STATE_LABEL: Record<string, string> = { ok: "נכנסו", pending: "ממתינים", exists: "כבר קיימים בסילפרוס", failed: "נכשלו", skipped: "דולגו (כבר מקושרים)" }
  async function resendToSf(ids: number[]) {
    setBulkBusy(true)
    try {
      const d = await api("/api/leads/salesforce", "POST", { ids })
      const parts = Object.entries(d.summary || {}).map(([k, n]) => `${SF_STATE_LABEL[k] || k}: ${n}`)
      const failed = (d.results || []).find((r: any) => r.state === "failed")
      if (failed) toastError(`שליחה לסילפרוס · ${parts.join(" · ")}${failed.error ? ` — ${failed.error}` : ""}`)
      else success(`שליחה לסילפרוס · ${parts.join(" · ")}`)
      setSelected(new Set())
      await load(true)
    } catch (e: any) { toastError(e.message) }
    finally { setBulkBusy(false) }
  }

  // ── render helpers ──────────────────────────────────────────
  function assignOptions(empty: string) {
    return <>
      <option value="">{empty}</option>
      <optgroup label="רכזים">{coords.map((c: any) => <option key={c.id} value={"coord_" + c.id}>{c.name}</option>)}</optgroup>
      <optgroup label="מנהלים">{adminUsers.map((a: any) => <option key={a.id} value={"admin_" + a.name}>{a.name} · מנהל</option>)}</optgroup>
    </>
  }
  const ownerKind = (l: any) => l.coordinator_id ? "רכז" : l.owner_name ? "מנהל" : ""
  const selectedOffPage = [...selected].filter(id => !pg.paged.some(l => l.id === id)).length
  const pageAllSelected = pg.paged.length > 0 && pg.paged.every(l => selected.has(l.id))
  const pageSomeSelected = pg.paged.some(l => selected.has(l.id))
  const headCheck = useRef<HTMLInputElement>(null)
  useEffect(() => { if (headCheck.current) headCheck.current.indeterminate = pageSomeSelected && !pageAllSelected }, [pageSomeSelected, pageAllSelected])

  const SortTh = ({ label, k }: { label: string; k: string }) => (
    <th scope="col" aria-sort={sortKey === k ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => toggleSort(k)}>
        {label}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  )
  const statusPill = (l: any) => canWrite ? (
    <select className={`lw-pill st-${l.status}`} value={l.status} onChange={e => quickStatus(l, e.target.value)} aria-label={`סטטוס של ${l.name}`}>
      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  ) : <span className={`lw-pill st-${l.status}`}>{STATUS_LABEL[l.status] || l.status}</span>

  if (error) return <div className="leads-ws"><ErrorState retry={() => load()} /></div>

  const field = (id: string, label: string, node: React.ReactNode, opts: { full?: boolean; hint?: string } = {}) => (
    <label className={`lf-field ${opts.full ? "full" : ""}`} data-invalid={!!formErrors[id]} htmlFor={`lf-${id}`}>
      {label}{node}
      {formErrors[id] ? <span className="lf-err" id={`lf-${id}-err`}>{formErrors[id]}</span> : opts.hint ? <span className="lf-hint">{opts.hint}</span> : null}
    </label>
  )
  const setF = (k: keyof NewForm, v: any) => { setForm(f => ({ ...f, [k]: v })); if (formErrors[k]) setFormErrors(e => { const n = { ...e }; delete n[k]; return n }) }

  return (
    <div className="leads-ws">
      {/* Header */}
      <div className="lw-head">
        <div>
          <h1>לידים</h1>
          <p>כל הפניות, השיוכים ומקורות ההגעה{aggregate ? "" : ` · ${leads.length} לידים`}</p>
        </div>
        <div className="lw-head-actions">
          {refreshing && <span className="lw-refresh" role="status">מעדכן…</span>}
          {canExport && <button type="button" className="lw-btn" onClick={() => window.open("/api/export?type=leads", "_blank")} title="קובץ CSV של כל הלידים במערכת — ללא תלות בסינון">ייצוא CSV · כל הלידים</button>}
          {canWrite && <button type="button" className="lw-btn lw-btn-primary" onClick={openForm}><Icon name="plus" size={18} />הוספת ליד</button>}
        </div>
      </div>

      {staleError && <div className="lw-banner" role="alert"><span>העדכון האחרון נכשל — מוצגים הנתונים הקודמים.</span><button type="button" className="lw-link" onClick={() => load(true)}>ניסיון חוזר</button></div>}

      {/* Status bar — the status filter itself */}
      <div className="lw-status" role="group" aria-label="סינון לפי סטטוס">
        <button type="button" aria-pressed={!filterStatus} onClick={() => setFilterStatus("")}><span>הכול</span><b>{loading ? "–" : counts.all}</b></button>
        {STATUSES.map(s => (
          <button key={s} type="button" aria-pressed={filterStatus === s} onClick={() => setFilterStatus(filterStatus === s ? "" : s)} disabled={!!aggregate}>
            <span>{STATUS_LABEL[s]}</span><b>{loading ? "–" : counts[s]}</b>
          </button>
        ))}
      </div>

      {aggregate ? (
        <div className="lw-card"><div className="lw-empty"><b>תצוגה מצרפית</b>לפי ההרשאות שלך מוצגות כמויות לפי סטטוס בלבד, בלי פרטי אנשים.</div></div>
      ) : <>
        {/* Toolbar */}
        <div className="lw-toolbar">
          <label className="lw-search">
            <Icon name="search" size={18} />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם, טלפון, עיר או דוא״ל…" aria-label="חיפוש לידים" />
          </label>
          <select className="lw-select" value={filterOwner} onChange={e => setFilterOwner(e.target.value)} aria-label="אחראי לטיפול">
            <option value="">כל האחראים</option>
            <optgroup label="רכזים">{coords.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</optgroup>
            <optgroup label="מנהלים">{adminUsers.map((a: any) => <option key={a.id} value={"admin_" + a.name}>{a.name}</option>)}</optgroup>
          </select>
          <select className="lw-select" value={filterSource} onChange={e => setFilterSource(e.target.value)} aria-label="מקור פנייה">
            <option value="">כל המקורות</option>
            {leadSources.map((s: any) => <option key={s.id} value={String(s.id)}>{s.label}</option>)}
          </select>
          <select className="lw-select" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} aria-label="חודש">
            <option value="">כל החודשים</option>
            {months.map(m => <option key={m} value={m}>{m.slice(5, 7)}/{m.slice(0, 4)}</option>)}
          </select>
          <select className="lw-select" value={filterSf} onChange={e => setFilterSf(e.target.value)} aria-label="סילפרוס">
            <option value="">סילפרוס: הכול</option>
            <option value="missing">לא נכנסו לסילפרוס</option>
            <option value="failed">נכשלו בשליחה</option>
          </select>
          <div className="lw-cols" ref={colsRef}>
            <button type="button" className="lw-btn" aria-expanded={colsOpen} aria-haspopup="true" onClick={() => setColsOpen(o => !o)}>עמודות</button>
            {colsOpen && (
              <div className="lw-cols-pop" role="group" aria-label="בחירת עמודות">
                {COLS.map(c => (
                  <label key={c.key}><input type="checkbox" checked={cols.includes(c.key)} onChange={() => toggleCol(c.key)} />{c.label}</label>
                ))}
                <p>הבחירה נשמרת בדפדפן הזה בלבד ואינה משנה את הייצוא.</p>
                <button type="button" className="lw-link" onClick={() => { setCols(DEFAULT_COLS); try { localStorage.removeItem(COLS_KEY) } catch {} }}>חזרה לברירת המחדל</button>
              </div>
            )}
          </div>
        </div>
        <div className="lw-meta">
          <div className="lw-chips">
            {chips.map(c => <span key={c.k} className="lw-chip">{c.label}<button type="button" onClick={c.clear} aria-label={`הסרת ${c.label}`}>×</button></span>)}
            {chips.length > 1 && <button type="button" className="lw-link" onClick={clearFilters}>איפוס מסננים</button>}
          </div>
          <span aria-live="polite">{loading ? "טוען…" : `${filtered.length} תוצאות${hasFilters ? ` מתוך ${leads.length}` : ""}`}</span>
        </div>

        {/* List */}
        <div className="lw-card">
          {sortHidden && <div className="lw-sortnote">ממוין לפי {sortCol?.label || sortKey}, עמודה שאינה מוצגת. <button type="button" className="lw-link" onClick={() => toggleSort("created_at")}>מיון לפי תאריך</button></div>}
          <div className={`lw-table-wrap ${extraCols ? "is-wide" : ""}`}>
            <table className="lw-table">
              <thead>
                <tr>
                  {canBulk && <th className="lw-check" scope="col">
                    <input ref={headCheck} type="checkbox" checked={pageAllSelected} aria-label="בחירת כל הלידים בעמוד הזה"
                      onChange={e => { const next = new Set(selected); pg.paged.forEach(l => e.target.checked ? next.add(l.id) : next.delete(l.id)); setSelected(next) }} />
                  </th>}
                  <SortTh label="שם וטלפון" k="name" />
                  {visibleCols.map(c => <SortTh key={c.key} label={c.label} k={c.sort} />)}
                  <th scope="col" aria-label="פעולות" />
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={visibleCols.length + 3} className="lw-skel" /></tr>)}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={visibleCols.length + 3}>
                    {hasFilters
                      ? <div className="lw-empty"><b>לא נמצאו לידים מתאימים</b>אפשר לשנות את החיפוש או המסננים.<br /><button type="button" className="lw-link" onClick={clearFilters}>איפוס מסננים</button></div>
                      : <div className="lw-empty"><b>אין עדיין לידים</b>לידים נכנסים מהלינק האישי של הרכזים, מלינקים של מקורות, מאירועים או בהוספה ידנית.{canWrite && <><br /><button type="button" className="lw-link" onClick={openForm}>+ הוספת ליד ראשון</button></>}</div>}
                  </td></tr>
                )}
                {!loading && pg.paged.map(l => (
                  <tr key={l.id} className={selected.has(l.id) ? "is-selected" : ""}>
                    {canBulk && <td className="lw-check">
                      <input type="checkbox" checked={selected.has(l.id)} aria-label={`בחירת ${l.name}`}
                        onChange={() => { const next = new Set(selected); next.has(l.id) ? next.delete(l.id) : next.add(l.id); setSelected(next) }} />
                    </td>}
                    <td>
                      <button type="button" className="lw-name" onClick={() => openDetail(l.id)} title={l.name}>{l.name}{l.is_parent && <span className="lw-tag">הורה</span>}</button>
                      <span className="lw-sub lw-ltr">{l.phone || "—"}</span>
                    </td>
                    {visibleCols.map(c => <td key={c.key}>{cell(c.key, l)}</td>)}
                    <td>
                      <div className="lw-actions">
                        {l.phone && <a className="lw-iconlink wa" href={waLink(l.phone)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp אל ${l.name}`}>WhatsApp</a>}
                        <button type="button" className="lw-iconlink" onClick={() => openDetail(l.id)}>פרטים</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone list */}
          <div className="lw-mlist">
            {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="lw-skel" />)}
            {!loading && filtered.length === 0 && <div className="lw-empty"><b>{hasFilters ? "לא נמצאו לידים מתאימים" : "אין עדיין לידים"}</b>{hasFilters && <button type="button" className="lw-link" onClick={clearFilters}>איפוס מסננים</button>}</div>}
            {!loading && pg.paged.map(l => (
              <div key={l.id} className="lw-mitem">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button type="button" className="lw-name" onClick={() => openDetail(l.id)}>{l.name}{l.is_parent && <span className="lw-tag">הורה</span>}</button>
                  <span className="lw-sub lw-ltr" style={{ textAlign: "right" }}>{l.phone}</span>
                  <span className="lw-sub" style={{ whiteSpace: "normal" }}>{l.owner_display || "ללא שיוך"} · {l.lead_source_label || "מקור לא צוין"} · {fd(l.created_at?.slice(0, 10))}</span>
                </div>
                <div className="lw-mitem-side">
                  {statusPill(l)}
                  <SfStatusBadge lead={l} />
                  {l.phone && <a className="lw-iconlink wa" href={waLink(l.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                </div>
              </div>
            ))}
          </div>
          <Pagination {...pg} onChange={p => { pg.setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }) }} />
        </div>
      </>}

      {/* Bulk bar — appears only with a selection, floats so the layout doesn't jump */}
      {canBulk && selected.size > 0 && (
        <div className="lw-bulk" role="region" aria-label="פעולות על הלידים שנבחרו">
          <strong>{selected.size} נבחרו</strong>
          {selectedOffPage > 0 && <small>({selectedOffPage} בעמודים אחרים)</small>}
          <select value={bulkTarget} onChange={e => setBulkTarget(e.target.value)} aria-label="שיוך לאחראי">{assignOptions("שיוך ל…")}</select>
          <button type="button" className="lw-btn" disabled={!bulkTarget || bulkBusy}
            onClick={() => { const isCoord = bulkTarget.startsWith("coord_"); bulk({ action: "assign", coordinator_id: isCoord ? +bulkTarget.replace("coord_", "") : undefined, owner_name: isCoord ? undefined : bulkTarget.replace("admin_", "") }, `השיוך עודכן ל${isCoord ? coords.find(c => "coord_" + c.id === bulkTarget)?.name : bulkTarget.replace("admin_", "")}`) }}>
            {bulkBusy ? "מעדכן…" : "החלת שיוך"}
          </button>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} aria-label="סטטוס">
            <option value="">סטטוס…</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button type="button" className="lw-btn" disabled={!bulkStatus || bulkBusy} onClick={() => bulk({ action: "status", status: bulkStatus }, `הסטטוס עודכן ל"${STATUS_LABEL[bulkStatus]}"`)}>החלת סטטוס</button>
          {canDelete && <button type="button" className="lw-btn lw-btn-ghost" disabled={bulkBusy}
            onClick={() => setConfirmDelete({ ids: [...selected], names: leads.filter(l => selected.has(l.id)).slice(0, 3).map(l => l.name) })}>מחיקה…</button>}
          <button type="button" className="lw-btn" disabled={bulkBusy} onClick={() => resendToSf([...selected])}>{bulkBusy ? "שולח…" : "שליחה לסילפרוס"}</button>
          <span className="lw-spacer" />
          <button type="button" className="lw-btn lw-btn-ghost" onClick={() => setSelected(new Set())}>ביטול בחירה</button>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <Sheet open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={`מחיקת ${confirmDelete?.ids.length || 0} לידים`} labelledBy="lw-del-title"
        footer={<>
          <button type="button" className="lw-btn lw-btn-danger-solid" disabled={bulkBusy} onClick={() => bulk({ action: "delete" }, "הלידים נמחקו")}>{bulkBusy ? "מוחק…" : `מחיקת ${confirmDelete?.ids.length || 0} לידים`}</button>
          <button type="button" className="lw-btn" onClick={() => setConfirmDelete(null)}>ביטול</button>
        </>}>
        <p style={{ margin: 0, lineHeight: 1.8, fontSize: 14 }}>
          הלידים יוסרו מהרשימה ומהדוחות.{" "}
          {confirmDelete?.names.length ? <>ביניהם: <b>{confirmDelete.names.join(", ")}</b>{confirmDelete.ids.length > confirmDelete.names.length ? ` ועוד ${confirmDelete.ids.length - confirmDelete.names.length}` : ""}.</> : null}
        </p>
      </Sheet>

      {/* New lead */}
      <Sheet open={formOpen} onClose={() => setFormOpen(false)} wide title="ליד חדש" subtitle="כל השדות המסומנים בכוכבית הם חובה" labelledBy="lw-form-title"
        footer={<>
          <button type="button" className="lw-btn lw-btn-primary" onClick={addLead} disabled={saving}>{saving ? "שומר…" : "שמירת ליד"}</button>
          <button type="button" className="lw-btn" onClick={() => setFormOpen(false)}>סגירה</button>
        </>}>
        <form onSubmit={e => { e.preventDefault(); addLead() }} noValidate>
          {formDirty && !saving && !formAlert && !dupBlock && Object.keys(formErrors).length === 0 && (
            <div className="lf-draft"><span>הטיוטה נשמרת כל עוד הדף פתוח, גם אם סוגרים את החלון.</span><button type="button" className="lw-link" onClick={() => { setForm({ ...EMPTY_FORM }); setFormErrors({}) }}>ניקוי הטופס</button></div>
          )}
          {formAlert && <div className="lf-alert" role="alert">{formAlert}</div>}
          <fieldset className="lf-section">
            <legend>פרטי אדם</legend>
            <div className="lf-grid">
              {field("firstName", "שם פרטי *", <input id="lf-firstName" value={form.firstName} onChange={e => setF("firstName", e.target.value)} aria-invalid={!!formErrors.firstName} aria-describedby={formErrors.firstName ? "lf-firstName-err" : undefined} autoComplete="off" />)}
              {field("lastName", "שם משפחה", <input id="lf-lastName" value={form.lastName} onChange={e => setF("lastName", e.target.value)} autoComplete="off" />)}
              {field("phone", "טלפון *", <input id="lf-phone" className="lw-ltr" style={{ textAlign: "right" }} value={form.phone} onChange={e => setF("phone", e.target.value)} type="tel" inputMode="tel" placeholder="050-0000000" aria-invalid={!!formErrors.phone} />)}
              {field("idNumber", "ת״ז", <input id="lf-idNumber" value={form.idNumber} onChange={e => setF("idNumber", e.target.value)} inputMode="numeric" maxLength={9} placeholder="000000000" />)}
              {field("age", "גיל", <input id="lf-age" value={form.age} onChange={e => setF("age", e.target.value)} type="number" inputMode="numeric" />)}
              {field("city", "עיר", <input id="lf-city" value={form.city} onChange={e => setF("city", e.target.value)} />)}
              {field("email", "דוא״ל", <input id="lf-email" className="lw-ltr" style={{ textAlign: "right" }} value={form.email} onChange={e => setF("email", e.target.value)} type="email" />)}
              <label className="lf-check"><input type="checkbox" checked={form.isParent} onChange={e => setF("isParent", e.target.checked)} />הפונה הוא הורה</label>
            </div>
            {dupBlock && <div className="lf-dup block" role="alert"><b>הליד לא נוצר:</b> הטלפון או הת״ז כבר קיימים{dupBlock.name ? ` אצל ${dupBlock.name}` : ""}. אפשר לתקן את הפרטים ולשמור שוב.</div>}
            {!dupBlock && liveDup.state === "pending" && <div className="lf-dup pending" role="status">בודק אם הפונה כבר קיים…</div>}
            {!dupBlock && liveDup.state === "done" && liveDup.matches.length > 0 && <div className="lf-dup warn" role="status">התאמה אפשרית: {liveDup.matches.map((m: any) => m.name).join(", ")}. כדאי לוודא שזה לא אותו אדם לפני שמירה.</div>}
            {!dupBlock && liveDup.state === "failed" && <div className="lf-dup pending" role="status">לא ניתן היה לבדוק כפילות כרגע. המערכת תבדוק שוב בשמירה.</div>}
          </fieldset>
          <fieldset className="lf-section">
            <legend>אחריות ומקור</legend>
            <div className="lf-grid">
              {field("assign", "אחראי לטיפול *",
                <select id="lf-assign" value={form.coordinator_id ? "coord_" + form.coordinator_id : form.owner_name ? "admin_" + form.owner_name : ""} aria-invalid={!!formErrors.assign}
                  onChange={e => { const v = e.target.value; setForm(f => ({ ...f, coordinator_id: v.startsWith("coord_") ? v.replace("coord_", "") : "", owner_name: v.startsWith("admin_") ? v.replace("admin_", "") : "" })); setFormErrors(er => { const n = { ...er }; delete n.assign; return n }) }}>
                  {assignOptions("— בחירת רכז או מנהל —")}
                </select>, { hint: "מי מטפל בפנייה. זה לא מקור הפנייה." })}
              {field("leadSourceId", "מקור פנייה *",
                <select id="lf-leadSourceId" value={form.leadSourceId} onChange={e => setF("leadSourceId", e.target.value)} aria-invalid={!!formErrors.leadSourceId}>
                  <option value="">— בחירת מקור —</option>
                  {leadSources.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.coordinator_id ? "רכז: " : ""}{s.label}</option>)}
                </select>)}
              {field("arrivalChannelId", "ערוץ הגעה *",
                <select id="lf-arrivalChannelId" value={form.arrivalChannelId} onChange={e => setF("arrivalChannelId", e.target.value)} aria-invalid={!!formErrors.arrivalChannelId}>
                  <option value="">— איך הגיע? —</option>
                  {arrivalChannels.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>)}
              {field("eventId", "נאסף באירוע",
                <select id="lf-eventId" value={form.eventId} onChange={e => setF("eventId", e.target.value)}>
                  <option value="">— לא באירוע —</option>
                  {events.filter((e: any) => ["approved", "marketing", "done"].includes(e.status)).map((ev: any) => <option key={ev.id} value={ev.id}>{ev.name}{ev.date ? ` (${ev.date.slice(8, 10)}.${ev.date.slice(5, 7)})` : ""}</option>)}
                </select>, { hint: "לא חובה" })}
            </div>
          </fieldset>
          <fieldset className="lf-section" style={{ marginBottom: 0 }}>
            <legend>מידע נוסף</legend>
            {field("notes", "הערות", <textarea id="lf-notes" value={form.notes} onChange={e => setF("notes", e.target.value)} rows={3} />, { full: true })}
          </fieldset>
        </form>
      </Sheet>

      {/* Details — side panel; the list stays behind it with the same filters and scroll */}
      <Sheet open={!!openId} onClose={() => { setOpenId(null); setEditing(false) }} variant="side" labelledBy="lw-detail-title"
        title={openLead?.name || "פרטי ליד"}
        subtitle={openLead ? `נוצר ${fd(openLead.created_at?.slice(0, 10))} · ${SOURCE_LABEL[openLead.source] || "דרך כניסה לא ידועה"}` : undefined}
        headerExtra={openLead && !editing ? (
          <div className="ld-top">
            {statusPill(openLead)}
            <SfStatusBadge lead={openLead} />
          </div>
        ) : undefined}
        footer={openLead ? (editing ? <>
          <button type="button" className="lw-btn lw-btn-primary" onClick={saveEdit} disabled={editSaving}>{editSaving ? "שומר…" : "שמירת שינויים"}</button>
          <button type="button" className="lw-btn" onClick={() => { setEditing(false); setEditErr(""); setEdit(editFrom(openLead)) }}>ביטול</button>
        </> : <>
          {openLead.phone && <a className="lw-btn" href={waLink(openLead.phone)} target="_blank" rel="noopener noreferrer" style={{ color: "#1d6a3f" }}>WhatsApp</a>}
          {canBulk && !openLead.sf_record_id && openLead.sf_sync_state !== "exists" && (openLead.source === "link" || openLead.source === "manual") &&
            <button type="button" className="lw-btn" disabled={bulkBusy} onClick={() => resendToSf([openLead.id])}>{bulkBusy ? "שולח…" : "שליחה לסילפרוס"}</button>}
          {canWrite && <button type="button" className="lw-btn lw-btn-primary" onClick={() => { setEdit(editFrom(openLead)); setEditing(true) }}>עריכה</button>}
          {canWrite && <button type="button" className="lw-btn lw-btn-danger" onClick={() => { if (confirm(`למחוק את ${openLead.name}? אפשר לבטל מיד אחרי המחיקה.`)) deleteLead(openLead) }}>מחיקה</button>}
        </>) : undefined}>
        {!openLead && <div className="lw-empty"><b>הליד לא נמצא</b>ייתכן שנמחק או שאין לך הרשאה לראות אותו.</div>}
        {openLead && !editing && <>
          <section className="ld-sec" aria-labelledby="ld-contact">
            <h3 id="ld-contact">פרטי קשר</h3>
            <div className="ld-row"><span>טלפון</span><b className="lw-ltr">{openLead.phone ? <a href={`tel:${openLead.phone}`} style={{ color: "inherit" }}>{openLead.phone}</a> : none}</b></div>
            <div className="ld-row"><span>דוא״ל</span><b className="lw-ltr">{openLead.email || none}</b></div>
            <div className="ld-row"><span>עיר</span><b>{openLead.city || none}</b></div>
            <div className="ld-row"><span>גיל</span><b>{openLead.age || none}</b></div>
            <div className="ld-row"><span>ת״ז</span><b className="lw-ltr">{openLead.id_number || none}</b></div>
            <div className="ld-row"><span>הפונה הוא הורה</span><b>{openLead.is_parent ? "כן" : "לא"}</b></div>
          </section>
          <section className="ld-sec" aria-labelledby="ld-owner">
            <h3 id="ld-owner">אחריות ומקור</h3>
            <div className="ld-row"><span>אחראי לטיפול</span><b>{openLead.owner_display ? `${openLead.owner_display} · ${ownerKind(openLead)}` : <span className="lw-none">ללא שיוך</span>}</b></div>
            <div className="ld-row"><span>מקור פנייה</span><b>{openLead.lead_source_label || none}</b></div>
            <div className="ld-row"><span>ערוץ הגעה</span><b>{openLead.arrival_channel_label || none}</b></div>
            <div className="ld-row"><span>אירוע</span><b>{openLead.event_name || none}</b></div>
            <div className="ld-row"><span>שותף מפנה</span><b>{openLead.partner_name ? `${openLead.partner_name}${openLead.partner_org ? ` · ${openLead.partner_org}` : ""}` : none}</b></div>
            <div className="ld-row"><span>דרך הכניסה למערכת</span><b>{SOURCE_LABEL[openLead.source] || none}</b></div>
            <div className="ld-row"><span>סילפרוס</span><b>{openLead.sf_status || openLead.sf_sync_state ? <SfStatusBadge lead={openLead} detailed /> : none}</b></div>
            <div className="ld-row"><span>תחום עניין</span><b>{INTEREST_LABEL[openLead.interest] || openLead.interest || none}</b></div>
          </section>
          <section className="ld-sec" aria-labelledby="ld-notes">
            <h3 id="ld-notes">הערות</h3>
            {openLead.notes ? <p className="ld-notes">{openLead.notes}</p> : <p className="ld-notes lw-none">אין הערות</p>}
          </section>
          <section className="ld-sec ld-history" aria-label="היסטוריית שינויים"><AuditHistory entityType="lead" entityId={openLead.id} /></section>
        </>}
        {openLead && editing && edit && (
          <form onSubmit={e => { e.preventDefault(); saveEdit() }} noValidate>
            {editErr && <div className="lf-alert" role="alert">{editErr}</div>}
            <div className="lf-grid">
              <label className="lf-field full">שם מלא *<input value={edit.name} onChange={e => setEdit(f => f && ({ ...f, name: e.target.value }))} /></label>
              <label className="lf-field">טלפון *<input className="lw-ltr" style={{ textAlign: "right" }} value={edit.phone} onChange={e => setEdit(f => f && ({ ...f, phone: e.target.value }))} type="tel" /></label>
              <label className="lf-field">ת״ז<input value={edit.id_number} onChange={e => setEdit(f => f && ({ ...f, id_number: e.target.value }))} maxLength={9} inputMode="numeric" /></label>
              <label className="lf-field">דוא״ל<input className="lw-ltr" style={{ textAlign: "right" }} value={edit.email} onChange={e => setEdit(f => f && ({ ...f, email: e.target.value }))} type="email" /></label>
              <label className="lf-field">עיר<input value={edit.city} onChange={e => setEdit(f => f && ({ ...f, city: e.target.value }))} /></label>
              <label className="lf-field">גיל<input value={edit.age} onChange={e => setEdit(f => f && ({ ...f, age: e.target.value }))} type="number" /></label>
              <label className="lf-field">סטטוס<select value={edit.status} onChange={e => setEdit(f => f && ({ ...f, status: e.target.value }))}>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
              <label className="lf-field full">אחראי לטיפול<select value={edit.assign} onChange={e => setEdit(f => f && ({ ...f, assign: e.target.value }))}>{assignOptions("— ללא שיוך —")}</select></label>
              <label className="lf-field">מקור פנייה<select value={edit.lead_source_id} onChange={e => setEdit(f => f && ({ ...f, lead_source_id: e.target.value }))}><option value="">— ללא —</option>{leadSources.map((s: any) => <option key={s.id} value={s.id}>{s.coordinator_id ? "רכז: " : ""}{s.label}</option>)}</select></label>
              <label className="lf-field">ערוץ הגעה<select value={edit.arrival_channel_id} onChange={e => setEdit(f => f && ({ ...f, arrival_channel_id: e.target.value }))}><option value="">— ללא —</option>{arrivalChannels.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
              <label className="lf-field">נאסף באירוע<select value={edit.event_id} onChange={e => setEdit(f => f && ({ ...f, event_id: e.target.value }))}><option value="">— לא באירוע —</option>{events.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.name}{ev.date ? ` (${ev.date.slice(8, 10)}.${ev.date.slice(5, 7)})` : ""}</option>)}</select></label>
              <label className="lf-field">דרך הכניסה למערכת<select value={edit.source} onChange={e => setEdit(f => f && ({ ...f, source: e.target.value }))}>{Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="lf-field">תחום עניין<select value={edit.interest} onChange={e => setEdit(f => f && ({ ...f, interest: e.target.value }))}>{Object.entries(INTEREST_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="lf-check"><input type="checkbox" checked={edit.is_parent} onChange={e => setEdit(f => f && ({ ...f, is_parent: e.target.checked }))} />הפונה הוא הורה</label>
              <label className="lf-field full">הערות<textarea value={edit.notes} onChange={e => setEdit(f => f && ({ ...f, notes: e.target.value }))} rows={4} /></label>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  )

  function cell(k: ColKey, l: any): React.ReactNode {
    switch (k) {
      case "owner": return l.owner_display ? <><span>{l.owner_display}</span><span className="lw-sub">{ownerKind(l)}</span></> : <span className="lw-none">ללא שיוך</span>
      case "status": return <>{statusPill(l)}<div style={{ marginTop: 4 }}><SfStatusBadge lead={l} /></div></>
      case "source": return <><span>{l.lead_source_label || none}</span><span className="lw-sub">{l.arrival_channel_label || "ערוץ לא צוין"}</span></>
      case "event": return l.event_name ? <span>{l.event_name}</span> : none
      case "created": return <span className="lw-ltr" style={{ whiteSpace: "nowrap" }}>{fd(l.created_at?.slice(0, 10))}</span>
      case "city": return l.city || none
      case "age": return l.age || none
      case "id_number": return l.id_number ? <span className="lw-ltr">{l.id_number}</span> : none
      case "email": return l.email ? <span className="lw-ltr">{l.email}</span> : none
    }
  }
}
