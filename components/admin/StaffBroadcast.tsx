"use client"
import { useMemo, useRef, useState } from "react"
import { DEFAULT_BROADCAST, MAX_BROADCAST_LENGTH, PLACEHOLDERS, renderBroadcast } from "@/lib/whatsapp-bot/broadcast"

/**
 * "📣 הודעה לצוות" — a personal WhatsApp announcement to system users
 * ("שלום {שם}, יש פיצ'ר חדש במערכת…"). Sends one message per person through
 * /api/admin/whatsapp-bot/broadcast with a pause between sends (gentler on the
 * unofficial WhatsApp connection) and shows progress as it goes.
 */

type Person = { id: number; name: string; role: string; phone: string | null }
const C = { navy: "#193d33", green: "#28634e", slate: "#63756b", border: "#d0dbd0", bg: "#f4f6f2", warn: "#946014", bad: "#a74450" }
const ROLE: Record<string, string> = { admin: "מנהל", coordinator: "רכז", ceo: "מנכ\"ל", field_manager: "מנהל שטח", secretary: "מזכירות", viewer: "צופה" }
const GAP_MS = 1500
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function StaffBroadcast({ staff, onSent }: { staff: Person[]; onSent?: () => void }) {
  const people = useMemo(() => staff.filter(p => p.phone), [staff])
  const [msg, setMsg] = useState(DEFAULT_BROADCAST)
  const [selected, setSelected] = useState<Set<number>>(() => new Set(people.map(p => p.id)))
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<Record<number, "pending" | "ok" | string>>({})
  const [summary, setSummary] = useState("")
  const ta = useRef<HTMLTextAreaElement>(null)

  const chosen = people.filter(p => selected.has(p.id))
  const preview = chosen[0] || people[0]
  const body = msg.trim()
  const tooLong = msg.length > MAX_BROADCAST_LENGTH

  function setGroup(kind: "all" | "coordinator" | "managers" | "none") {
    setSelected(new Set(people.filter(p => kind === "all" || (kind === "coordinator" ? p.role === "coordinator" : kind === "managers" ? p.role !== "coordinator" : false)).map(p => p.id)))
    setConfirming(false)
  }
  function toggle(id: number) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    setConfirming(false)
  }
  function insert(token: string) {
    const el = ta.current
    if (!el) { setMsg(m => m + token); return }
    const start = el.selectionStart ?? msg.length, end = el.selectionEnd ?? msg.length
    const next = msg.slice(0, start) + token + msg.slice(end)
    setMsg(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length) })
  }

  async function send() {
    setConfirming(false); setSending(true); setSummary("")
    const init: Record<number, "pending"> = {}
    chosen.forEach(p => { init[p.id] = "pending" })
    setResults(init)
    let sent = 0, failed = 0
    for (let i = 0; i < chosen.length; i++) {
      const p = chosen[i]
      try {
        const r = await fetch("/api/admin/whatsapp-bot/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: p.id, message: msg }) })
        const d = await r.json().catch(() => ({}))
        if (d.ok) sent++; else failed++
        setResults(x => ({ ...x, [p.id]: d.ok ? "ok" : (d.error || "נכשל") }))
      } catch {
        failed++
        setResults(x => ({ ...x, [p.id]: "אין חיבור" }))
      }
      if (i < chosen.length - 1) await sleep(GAP_MS)
    }
    await fetch("/api/admin/whatsapp-bot/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: true, message: msg, sent, failed }) }).catch(() => {})
    setSending(false)
    setSummary(failed ? `נשלח ל-${sent}, נכשל אצל ${failed}` : `✓ נשלח ל-${sent} אנשים`)
    onSent?.()
  }

  const btn = (active = false) => ({ border: `1px solid ${active ? C.navy : C.border}`, background: active ? C.navy : "#fff", color: active ? "#fff" : C.navy, borderRadius: 16, padding: "4px 12px", fontSize: 12, cursor: "pointer" }) as const

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 18px 4px", fontSize: 15, fontWeight: 700 }}>📣 הודעה לצוות</div>
      <div style={{ padding: "0 18px 12px", fontSize: 12, color: C.slate }}>הודעה אישית בוואטסאפ לכל משתמש — למשל על פיצ'ר חדש. <b>{"{שם}"}</b> מתחלף בשם של כל אחד.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, padding: "0 18px 16px" }}>
        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {PLACEHOLDERS.map(p => <button key={p.key} type="button" onClick={() => insert(p.key)} disabled={sending} style={btn()}>+ {p.label}</button>)}
          </div>
          <textarea ref={ta} value={msg} onChange={e => { setMsg(e.target.value); setConfirming(false) }} disabled={sending} rows={8}
            placeholder="שלום {שם} 👋 …"
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${tooLong ? C.bad : C.border}`, borderRadius: 8, padding: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ fontSize: 11, color: tooLong ? C.bad : C.slate, marginTop: 2 }}>{msg.length}/{MAX_BROADCAST_LENGTH} · *מודגש* · _נטוי_</div>

          {preview && body && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: C.slate, marginBottom: 4 }}>כך זה ייראה אצל {preview.name}:</div>
              <div style={{ background: "#e7f3ec", border: "1px solid #cde6d7", borderRadius: 10, padding: "8px 10px", fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{renderBroadcast(msg, preview)}</div>
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            <button type="button" style={btn(chosen.length === people.length)} onClick={() => setGroup("all")} disabled={sending}>כולם</button>
            <button type="button" style={btn()} onClick={() => setGroup("coordinator")} disabled={sending}>רכזים</button>
            <button type="button" style={btn()} onClick={() => setGroup("managers")} disabled={sending}>מנהלים</button>
            <button type="button" style={btn()} onClick={() => setGroup("none")} disabled={sending}>נקה</button>
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 240, overflowY: "auto" }}>
            {people.length === 0 && <div style={{ padding: 12, fontSize: 13, color: C.slate }}>אין משתמשים עם טלפון.</div>}
            {people.map(p => {
              const r = results[p.id]
              return (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: `1px solid ${C.bg}`, fontSize: 13, cursor: sending ? "default" : "pointer" }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} disabled={sending} />
                  <span style={{ flex: 1 }}><b>{p.name}</b> <span style={{ color: C.slate }}>· {ROLE[p.role] || p.role}</span></span>
                  {r === "pending" && <span style={{ color: C.slate, fontSize: 12 }}>⏳</span>}
                  {r === "ok" && <span style={{ color: C.green, fontSize: 12 }}>✓ נשלח</span>}
                  {r && r !== "ok" && r !== "pending" && <span style={{ color: C.bad, fontSize: 12 }} title={r}>✗ נכשל</span>}
                </label>
              )
            })}
          </div>
          {staff.length > people.length && <div style={{ fontSize: 11, color: C.warn, marginTop: 4 }}>{staff.length - people.length} משתמשים בלי טלפון לא יקבלו.</div>}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {!confirming ? (
              <button type="button" onClick={() => setConfirming(true)} disabled={sending || !body || tooLong || chosen.length === 0}
                style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: sending || !body || tooLong || chosen.length === 0 ? .5 : 1 }}>
                {sending ? `שולח… ${Object.values(results).filter(v => v !== "pending").length}/${chosen.length}` : `שלח ל-${chosen.length}`}
              </button>
            ) : (
              <>
                <span style={{ fontSize: 13 }}>לשלוח עכשיו ל-<b>{chosen.length}</b> אנשים?</span>
                <button type="button" onClick={send} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>כן, שלח</button>
                <button type="button" onClick={() => setConfirming(false)} style={{ background: "#fff", color: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>ביטול</button>
              </>
            )}
            {summary && <span style={{ fontSize: 13, fontWeight: 600, color: summary.startsWith("✓") ? C.green : C.warn }}>{summary}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
