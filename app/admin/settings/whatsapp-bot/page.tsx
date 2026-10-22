"use client"
import { useEffect, useState } from "react"

/** Bot settings screen: connection, toggles, who can use the bot, weekly numbers and the conversation log. */

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B45309", bad: "#B42318" }

type Settings = { enabled: boolean; buttons_enabled: boolean; reminders_enabled: boolean; reminder_hour: number; support_phone: string; auto_disabled_at: string | null; last_state_at: string | null }
type LogRow = { id: number; phone: string; direction: "in" | "out"; body: string; sender_name: string; status: string; kind: string; created_at: string }

const ROLE: Record<string, string> = { admin: "מנהל", coordinator: "רכז", ceo: "מנכ\"ל", field_manager: "מנהל שטח", secretary: "מזכירות", viewer: "צופה" }
const CONN: Record<string, { label: string; color: string }> = {
  authorized: { label: "מחובר", color: T.ok },
  notAuthorized: { label: "מנותק — צריך לסרוק QR מחדש", color: T.bad },
  blocked: { label: "המספר נחסם", color: T.bad },
  starting: { label: "מתחבר…", color: T.warn },
  sleepMode: { label: "במצב שינה — לפתוח וואטסאפ בטלפון", color: T.warn },
  not_configured: { label: "Green API לא מוגדר", color: T.bad },
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 46, height: 26, borderRadius: 13, border: "none", background: on ? T.ok : T.border, position: "relative", cursor: disabled ? "default" : "pointer", flex: "0 0 auto", opacity: disabled ? .5 : 1 }}>
      <span style={{ position: "absolute", top: 3, width: 20, height: 20, borderRadius: 10, background: "#fff", transition: "right .15s", right: on ? 3 : 23 }} />
    </button>
  )
}

function Row({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${T.bg}` }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{children}</div>
    </div>
  )
}

const card = { background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 } as const
const h2 = { fontSize: 15, fontWeight: 700, padding: "14px 18px 6px" } as const
const fmtTime = (s: string) => new Date(s).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
const localPhone = (p?: string | null) => (p ? String(p).replace(/^972/, "0") : "")

export default function WhatsAppBotSettings() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState<{ phone?: string; misses?: boolean }>({})
  const [support, setSupport] = useState("")
  const [test, setTest] = useState("")

  async function load(f = filter) {
    setError("")
    try {
      const q = f.phone ? `?phone=${encodeURIComponent(f.phone)}` : f.misses ? "?misses=1" : ""
      const r = await fetch(`/api/admin/whatsapp-bot${q}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "שגיאה")
      setData(d)
      setSupport(d.settings.support_phone || "")
    } catch (e: any) { setError(e.message || "שגיאה בטעינה") }
  }
  useEffect(() => { load() }, [])

  async function save(patch: Partial<Settings>) {
    setData((d: any) => ({ ...d, settings: { ...d.settings, ...patch } }))
    const r = await fetch("/api/admin/whatsapp-bot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
    if (r.ok) { const d = await r.json(); setData((x: any) => ({ ...x, settings: d.settings })); setSaved(true); setTimeout(() => setSaved(false), 1500) }
    else setError("השמירה נכשלה")
  }

  async function sendTest() {
    setTest("שולח…")
    const r = await fetch("/api/admin/whatsapp-bot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) })
    const d = await r.json()
    setTest(d.ok ? "✓ נשלחה" : `נכשל: ${d.error || ""}`)
  }

  function applyFilter(f: { phone?: string; misses?: boolean }) { setFilter(f); load(f) }

  if (error && !data) return <div dir="rtl" style={{ padding: 32, color: T.bad }}>{error}</div>
  if (!data) return <div dir="rtl" style={{ padding: 32 }}>טוען…</div>

  const s: Settings = data.settings
  const conn = CONN[data.connection] || { label: data.connection, color: T.warn }
  const st = data.stats || {}
  const staff: any[] = data.staff || []
  const missing = staff.filter(u => !u.phone)
  const nameByPhone = new Map(staff.filter(u => u.phone).map(u => [String(u.phone).replace(/\D/g, "").replace(/^0/, "972"), u.name]))
  const log: LogRow[] = data.log || []

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", color: T.navy, padding: "20px 16px 60px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}><a href="/admin/settings" style={{ color: T.slate }}>הגדרות</a> › <span style={{ color: T.navy, fontWeight: 600 }}>בוט וואטסאפ</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>בוט וואטסאפ</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saved && <span style={{ fontSize: 12, color: T.ok, fontWeight: 600 }}>✓ נשמר</span>}
          <span style={{ fontSize: 13, fontWeight: 700, color: conn.color, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 20, padding: "4px 12px" }}>● {conn.label}</span>
        </div>
      </div>
      {error && <div style={{ color: T.bad, fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div style={card}>
        <Row title="הבוט פעיל" sub="כבוי = הבוט לא עונה (ההודעות עדיין נרשמות).">
          <Toggle on={s.enabled} onChange={v => save({ enabled: v })} />
        </Row>
        <Row title="כפתורים" sub={s.auto_disabled_at && !s.buttons_enabled
          ? <span style={{ color: T.warn }}>כובו אוטומטית ב-{fmtTime(s.auto_disabled_at)} אחרי 3 כשלים ברצף. הבוט עובד עם טקסט ממוספר.</span>
          : "כבוי = אותן הודעות עם אפשרויות ממוספרות במקום כפתורים."}>
          <Toggle on={s.buttons_enabled} onChange={v => save({ buttons_enabled: v })} />
        </Row>
        <Row title="תזכורות משימות בוואטסאפ" sub="פעם ביום, חוץ משבת: משימות להיום ובאיחור, עם כפתורי בוצע / מחר.">
          <select value={s.reminder_hour} onChange={e => save({ reminder_hour: Number(e.target.value) })} disabled={!s.reminders_enabled}
            style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 13 }}>
            {Array.from({ length: 13 }, (_, i) => i + 7).map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
          <Toggle on={s.reminders_enabled} onChange={v => save({ reminders_enabled: v })} />
        </Row>
        <Row title="מספר לבקשות תמיכה" sub="כפתור תמיכה בבוט שולח לכאן הודעה. ריק = המספר המחובר לבוט.">
          <input value={support} onChange={e => setSupport(e.target.value)} onBlur={() => support !== (s.support_phone || "") && save({ support_phone: support })}
            placeholder="05X-XXXXXXX" inputMode="tel" style={{ width: 140, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 13, direction: "ltr", textAlign: "right" }} />
        </Row>
        <Row title="הודעת בדיקה" sub="שולחת הודעה לטלפון שלך דרך הבוט.">
          {test && <span style={{ fontSize: 12, color: test.startsWith("✓") ? T.ok : T.slate }}>{test}</span>}
          <button onClick={sendTest} style={{ border: `1px solid ${T.blue}`, color: T.blue, background: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>שלח</button>
        </Row>
      </div>

      <div style={card}>
        <div style={h2}>7 הימים האחרונים</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 1, background: T.bg, borderTop: `1px solid ${T.bg}` }}>
          {[
            ["לידים מהבוט", st.leads],
            ["משימות מהבוט", st.tasks],
            ["הודעות נכנסות", st.incoming],
            ["\"לא הבנתי\"", st.incoming ? `${st.misses} (${Math.round((st.misses / st.incoming) * 100)}%)` : st.misses],
            ["עם כפתורים", st.outgoing ? `${Math.round((st.with_buttons / st.outgoing) * 100)}%` : "—"],
            ["כשלי שליחה", st.failed],
          ].map(([l, v]) => (
            <div key={String(l)} style={{ background: "#fff", padding: "12px 16px" }}>
              <div style={{ fontSize: 12, color: T.slate }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{v ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={h2}>מי יכול לדבר עם הבוט</div>
        <div style={{ fontSize: 12, color: T.slate, padding: "0 18px 10px" }}>
          הבוט מזהה אנשים לפי מספר הטלפון במשתמש (או בכרטיס הרכז).
          {missing.length > 0 && <> <b style={{ color: T.warn }}>{missing.length} בלי טלפון</b> — אפשר להוסיף ב<a href="/admin/settings" style={{ color: T.blue }}>משתמשים והרשאות</a>.</>}
        </div>
        {staff.map(u => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 18px", borderTop: `1px solid ${T.bg}`, fontSize: 13 }}>
            <span><b>{u.name}</b> <span style={{ color: T.slate }}>· {ROLE[u.role] || u.role}</span></span>
            {u.phone
              ? <button onClick={() => applyFilter({ phone: String(u.phone).replace(/\D/g, "").replace(/^0/, "972") })} style={{ border: "none", background: "none", color: T.blue, cursor: "pointer", fontSize: 13, direction: "ltr" }}>{localPhone(u.phone)}</button>
              : <span style={{ color: T.warn }}>אין טלפון</span>}
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "14px 18px 8px" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>יומן שיחות{filter.phone ? ` · ${nameByPhone.get(filter.phone) || localPhone(filter.phone)}` : filter.misses ? " · הודעות שהבוט לא הבין" : ""}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["הכול", {}], ["לא הובנו", { misses: true }]].map(([l, f]: any) => {
              const active = (!filter.phone && !filter.misses && !f.misses) || (filter.misses && f.misses)
              return <button key={l} onClick={() => applyFilter(f)} style={{ border: `1px solid ${active ? T.navy : T.border}`, background: active ? T.navy : "#fff", color: active ? "#fff" : T.navy, borderRadius: 16, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>{l}</button>
            })}
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.slate, padding: "0 18px 8px" }}>מספרי ת.ז מוסתרים ביומן. ההיסטוריה נשמרת 90 יום.</div>
        {log.length === 0 && <div style={{ padding: "16px 18px", fontSize: 13, color: T.slate }}>אין הודעות.</div>}
        {log.map(m => (
          <div key={m.id} style={{ display: "flex", flexDirection: m.direction === "in" ? "row" : "row-reverse", padding: "6px 14px" }}>
            <div style={{ maxWidth: "85%", background: m.direction === "in" ? "#fff" : "#E7F3EC", border: `1px solid ${m.direction === "in" ? T.border : "#CDE6D7"}`, borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: T.slate, marginBottom: 3, display: "flex", gap: 8 }}>
                <span>{m.direction === "in" ? (m.sender_name || nameByPhone.get(m.phone) || localPhone(m.phone)) : (m.sender_name || "בוט")}{m.direction === "out" && !filter.phone ? ` → ${nameByPhone.get(m.phone) || localPhone(m.phone)}` : ""}</span>
                <span>{fmtTime(m.created_at)}</span>
                {m.kind === "button" && <span>🔘</span>}
                {m.status === "failed" && <span style={{ color: T.bad, fontWeight: 700 }}>נכשל</span>}
              </div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
