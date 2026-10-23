"use client"
import { useEffect, useState } from "react"
import { displayPhone, toCsv } from "@/lib/whatsapp-bot/group-utils"
import { loadWaGroups, onWaGroups, type WaGroupsResult } from "./wa-groups-client"

/** "👥 ייצוא אנשי קשר מקבוצה" — pulls a WhatsApp group's members (phones) and exports them to CSV. */

const C = { navy: "#193d33", green: "#28634e", slate: "#63756b", border: "#d0dbd0", bg: "#f4f6f2", warn: "#946014", bad: "#a74450" }
type Group = { id: string; name: string }
type Member = { phone: string | null; isAdmin: boolean; name: string }

export default function WaGroupExport() {
  const [groups, setGroups] = useState<Group[]>([])
  const [groupId, setGroupId] = useState("")
  const [data, setData] = useState<{ group: { name: string; size: number }; members: Member[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)

  const [listErr, setListErr] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const apply = (d: WaGroupsResult) => { setGroups(d.groups); setListErr(d.groups.length ? "" : d.error || "") }
  useEffect(() => {
    loadWaGroups().then(apply)
    return onWaGroups(apply)
  }, [])
  async function refresh() { setRefreshing(true); await loadWaGroups(true); setRefreshing(false) }

  async function pull() {
    if (!groupId) return
    setLoading(true); setErr(""); setData(null)
    try {
      const r = await fetch(`/api/admin/whatsapp-bot/groups?id=${encodeURIComponent(groupId)}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "שגיאה")
      setData(d)
    } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
  }

  const visible = data?.members.filter(m => m.phone) || []
  const hidden = (data?.members.length || 0) - visible.length

  function download() {
    if (!data) return
    const rows = [["טלפון", "שם במערכת", "מנהל קבוצה"], ...visible.map(m => [displayPhone(m.phone), m.name, m.isAdmin ? "כן" : ""])]
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `אנשי קשר - ${data.group.name.replace(/[\\/:*?"<>|]/g, "")}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  async function copy() {
    await navigator.clipboard.writeText(visible.map(m => displayPhone(m.phone)).join("\n")).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const btn = (primary = false) => ({ border: primary ? "none" : `1px solid ${C.border}`, background: primary ? C.green : "#fff", color: primary ? "#fff" : C.navy, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }) as const

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 18px 4px", fontSize: 15, fontWeight: 700 }}>👥 ייצוא אנשי קשר מקבוצה</div>
      <div style={{ padding: "0 18px 12px", fontSize: 12, color: C.slate }}>שולף את מספרי הטלפון של חברי קבוצה שהבוט חבר בה, ומסמן מי כבר קיים במערכת.</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 18px 14px", alignItems: "center" }}>
        <select value={groupId} onChange={e => { setGroupId(e.target.value); setData(null); setErr("") }}
          style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, flex: "1 1 220px", maxWidth: 420 }}>
          <option value="">בחרו קבוצה…</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button type="button" onClick={pull} disabled={!groupId || loading} style={{ ...btn(true), opacity: !groupId || loading ? .5 : 1 }}>{loading ? "שולף…" : "שלוף אנשי קשר"}</button>
        <button type="button" onClick={refresh} disabled={refreshing} style={btn()} title="טען מחדש את רשימת הקבוצות">{refreshing ? "…" : "↻ רענן"}</button>
        {err && <span style={{ fontSize: 12, color: C.bad }}>{err}</span>}
      </div>
      {listErr && <div style={{ padding: "0 18px 12px", fontSize: 12, color: C.bad }}>{listErr}</div>}
      {!listErr && groups.length === 0 && <div style={{ padding: "0 18px 12px", fontSize: 12, color: C.warn }}>לא נמצאו קבוצות. ודאו שהבוט (055-9388266) נוסף לקבוצה ולחצו "רענן". קבוצה חדשה מופיעה לפעמים רק אחרי שנשלחה בה הודעה.</div>}

      {data && (
        <div style={{ borderTop: `1px solid ${C.bg}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 18px" }}>
            <div style={{ fontSize: 13 }}>
              <b>{data.group.name}</b> · {data.members.length} משתתפים · <span style={{ color: C.green }}>{visible.length} עם מספר</span>
              {visible.filter(m => m.name).length > 0 && <span style={{ color: C.slate }}> · {visible.filter(m => m.name).length} כבר במערכת</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={copy} disabled={!visible.length} style={btn()}>{copied ? "✓ הועתק" : "העתק מספרים"}</button>
              <button type="button" onClick={download} disabled={!visible.length} style={btn(true)}>הורד CSV</button>
            </div>
          </div>
          {hidden > 0 && <div style={{ padding: "0 18px 8px", fontSize: 12, color: C.warn }}>אצל {hidden} משתתפים וואטסאפ מסתיר את המספר (הגדרות פרטיות) — הם לא ייכללו בייצוא.</div>}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {visible.map((m, i) => (
              <div key={m.phone} style={{ display: "flex", gap: 10, padding: "7px 18px", borderTop: `1px solid ${C.bg}`, fontSize: 13 }}>
                <span style={{ color: C.slate, width: 26 }}>{i + 1}</span>
                <span style={{ direction: "ltr", minWidth: 110 }}>{displayPhone(m.phone)}</span>
                <span style={{ flex: 1, color: m.name ? C.navy : C.slate }}>{m.name || "—"}</span>
                {m.isAdmin && <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>מנהל</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
