"use client"
import { useEffect, useState } from "react"
import { chatIdFromPhone, MAX_SCHEDULED_LENGTH, REPEAT_LABEL, type Repeat } from "@/lib/whatsapp-bot/group-utils"

/** "⏰ הודעות מתוזמנות" — schedule a WhatsApp message to a group (or one number), once or repeating. */

const C = { navy: "#193d33", green: "#28634e", slate: "#63756b", border: "#d0dbd0", bg: "#f4f6f2", warn: "#946014", bad: "#a74450" }
type Group = { id: string; name: string }
type Item = { id: number; chat_id: string; target_type: string; target_name: string; body: string; send_at: string; repeat: Repeat; status: string; sent_count: number; last_sent_at: string | null; last_error: string | null; created_by_name: string }

const fmt = (s: string) => new Date(s).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
const STATUS: Record<string, { label: string; color: string }> = {
  sent: { label: "נשלח", color: C.green }, failed: { label: "נכשל", color: C.bad }, cancelled: { label: "בוטל", color: C.slate },
  scheduled: { label: "מתוזמן", color: C.navy }, sending: { label: "נשלח עכשיו…", color: C.warn },
}

/** datetime-local value for "in about an hour", on a round 5 minutes, in the browser's (Israel) time. */
function defaultWhen(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function WaScheduled() {
  const [groups, setGroups] = useState<Group[]>([])
  const [groupsErr, setGroupsErr] = useState("")
  const [items, setItems] = useState<{ upcoming: Item[]; history: Item[] }>({ upcoming: [], history: [] })
  const [target, setTarget] = useState("")       // group id, or "phone"
  const [phone, setPhone] = useState("")
  const [body, setBody] = useState("")
  const [when, setWhen] = useState(defaultWhen())
  const [repeat, setRepeat] = useState<Repeat>("none")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [showHistory, setShowHistory] = useState(false)

  async function loadGroups() {
    setGroupsErr("")
    try {
      const r = await fetch("/api/admin/whatsapp-bot/groups")
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "שגיאה")
      setGroups(d.groups || [])
    } catch (e: any) { setGroupsErr(e.message) }
  }
  async function loadItems() {
    const r = await fetch("/api/admin/whatsapp-bot/scheduled")
    if (r.ok) setItems(await r.json())
  }
  useEffect(() => { loadGroups(); loadItems() }, [])

  const chatId = target === "phone" ? chatIdFromPhone(phone) : target
  const targetName = target === "phone" ? phone : groups.find(g => g.id === target)?.name || ""

  async function create() {
    setMsg("")
    if (!chatId) { setMsg(target === "phone" ? "מספר הטלפון לא תקין" : "בחרו קבוצה"); return }
    setBusy(true)
    try {
      const r = await fetch("/api/admin/whatsapp-bot/scheduled", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, targetName, body, sendAt: new Date(when).toISOString(), repeat }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "שגיאה")
      setMsg(`✓ תוזמן ל${fmt(d.item.send_at)}`)
      setBody(""); setWhen(defaultWhen()); setRepeat("none")
      loadItems()
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  async function act(id: number, action: "cancel" | "send_now") {
    if (action === "cancel" && !confirm("לבטל את ההודעה המתוזמנת?")) return
    const r = await fetch("/api/admin/whatsapp-bot/scheduled", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setMsg(d.error || "הפעולה נכשלה")
    else setMsg(action === "send_now" ? "✓ נשלח" : "✓ בוטל")
    loadItems()
  }

  const input = { border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" } as const
  const small = (color = C.navy) => ({ border: `1px solid ${C.border}`, background: "#fff", color, borderRadius: 7, padding: "4px 10px", fontSize: 12, cursor: "pointer" }) as const

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 18px 4px", fontSize: 15, fontWeight: 700 }}>⏰ הודעות מתוזמנות</div>
      <div style={{ padding: "0 18px 12px", fontSize: 12, color: C.slate }}>הבוט שולח את ההודעה בזמן שנקבע (עד 5 דקות אחרי). לקבוצה — הבוט צריך להיות חבר בה.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, padding: "0 18px 14px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 12, color: C.slate }}>למי
            <select value={target} onChange={e => setTarget(e.target.value)} style={{ ...input, width: "100%", marginTop: 3 }}>
              <option value="">בחרו קבוצה…</option>
              {groups.map(g => <option key={g.id} value={g.id}>👥 {g.name}</option>)}
              <option value="phone">📱 מספר טלפון…</option>
            </select>
          </label>
          {groupsErr && <div style={{ fontSize: 12, color: C.bad }}>{groupsErr} <button type="button" onClick={loadGroups} style={small()}>נסו שוב</button></div>}
          {!groupsErr && groups.length === 0 && <div style={{ fontSize: 12, color: C.warn }}>הבוט לא חבר באף קבוצה. הוסיפו את 055-9388266 לקבוצה ורעננו.</div>}
          {target === "phone" && <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="05X-XXXXXXX" inputMode="tel" style={{ ...input, direction: "ltr", textAlign: "right" }} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: C.slate, flex: "1 1 160px" }}>מתי
              <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={{ ...input, width: "100%", marginTop: 3 }} />
            </label>
            <label style={{ fontSize: 12, color: C.slate, flex: "1 1 110px" }}>חזרה
              <select value={repeat} onChange={e => setRepeat(e.target.value as Repeat)} style={{ ...input, width: "100%", marginTop: 3 }}>
                {(Object.keys(REPEAT_LABEL) as Repeat[]).map(k => <option key={k} value={k}>{REPEAT_LABEL[k]}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: C.slate }}>ההודעה</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder="*תזכורת* — מחר בשעה 20:00 ערב הורים באלעד…"
            style={{ ...input, width: "100%", resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={create} disabled={busy || !body.trim() || !target || body.length > MAX_SCHEDULED_LENGTH}
              style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: busy || !body.trim() || !target ? .5 : 1 }}>
              {busy ? "שומר…" : "תזמן הודעה"}
            </button>
            <span style={{ fontSize: 11, color: C.slate }}>{body.length}/{MAX_SCHEDULED_LENGTH}</span>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith("✓") ? C.green : C.bad }}>{msg}</span>}
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.bg}` }}>
        <div style={{ padding: "10px 18px 4px", fontSize: 13, fontWeight: 700 }}>ממתינות לשליחה ({items.upcoming.length})</div>
        {items.upcoming.length === 0 && <div style={{ padding: "4px 18px 12px", fontSize: 13, color: C.slate }}>אין הודעות מתוזמנות.</div>}
        {items.upcoming.map(it => <Row key={it.id} it={it} onCancel={() => act(it.id, "cancel")} onSend={() => act(it.id, "send_now")} />)}
        <div style={{ padding: "6px 18px 12px" }}>
          <button type="button" onClick={() => setShowHistory(v => !v)} style={small(C.slate)}>{showHistory ? "הסתר היסטוריה" : `היסטוריה (${items.history.length})`}</button>
        </div>
        {showHistory && items.history.map(it => <Row key={it.id} it={it} onSend={it.status === "failed" ? () => act(it.id, "send_now") : undefined} />)}
      </div>
    </div>
  )
}

function Row({ it, onCancel, onSend }: { it: Item; onCancel?: () => void; onSend?: () => void }) {
  const st = STATUS[it.status] || { label: it.status, color: C.slate }
  const btn = (color: string) => ({ border: `1px solid ${C.border}`, background: "#fff", color, borderRadius: 7, padding: "3px 9px", fontSize: 12, cursor: "pointer" }) as const
  return (
    <div style={{ display: "flex", gap: 10, padding: "9px 18px", borderTop: `1px solid ${C.bg}`, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>
          <b>{it.target_type === "group" ? "👥 " : "📱 "}{it.target_name || it.chat_id}</b>
          <span style={{ color: C.slate }}> · {it.status === "scheduled" || it.status === "sending" ? fmt(it.send_at) : it.last_sent_at ? fmt(it.last_sent_at) : fmt(it.send_at)}</span>
          {it.repeat !== "none" && <span style={{ color: C.green }}> · 🔁 {REPEAT_LABEL[it.repeat]}{it.sent_count ? ` (נשלח ${it.sent_count})` : ""}</span>}
        </div>
        <div style={{ fontSize: 12, color: C.slate, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2, maxHeight: 54, overflow: "hidden" }}>{it.body}</div>
        {it.last_error && it.status === "failed" && <div style={{ fontSize: 11, color: C.bad, marginTop: 2 }}>{it.last_error}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: st.color }}>{st.label}</span>
        {onSend && <button type="button" onClick={onSend} style={btn(C.green)}>{it.status === "failed" ? "נסה שוב" : "שלח עכשיו"}</button>}
        {onCancel && <button type="button" onClick={onCancel} style={btn(C.bad)}>בטל</button>}
      </div>
    </div>
  )
}
