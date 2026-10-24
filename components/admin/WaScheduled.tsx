"use client"
import { useEffect, useRef, useState } from "react"
import { loadWaGroups, onWaGroups } from "./wa-groups-client"
import { chatIdFromPhone, MAX_CAPTION_LENGTH, MAX_SCHEDULED_LENGTH, MEDIA_TYPES, REPEAT_LABEL, type Repeat } from "@/lib/whatsapp-bot/group-utils"

/**
 * "⏰ הודעות מתוזמנות" — schedule one or more messages (each with its own
 * date, time, repeat and optional photo/video) to one or more groups/numbers.
 */

const C = { navy: "#193d33", green: "#28634e", slate: "#63756b", border: "#d0dbd0", bg: "#f4f6f2", warn: "#946014", bad: "#a74450" }
type Group = { id: string; name: string }
type Item = {
  id: number; chat_id: string; target_type: string; target_name: string; body: string; send_at: string; repeat: Repeat; status: string;
  sent_count: number; last_sent_at: string | null; last_error: string | null; created_by_name: string; media_id: string | null; media_name: string | null; media_mime: string | null
}
type Media = { id?: string; name: string; mime: string; size: number; progress: number; error?: string; preview: string }
type Draft = { key: number; date: string; time: string; repeat: Repeat; body: string; media: Media | null }

const fmt = (s: string) => new Date(s).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" })
const STATUS: Record<string, { label: string; color: string }> = {
  sent: { label: "נשלח", color: C.green }, failed: { label: "נכשל", color: C.bad }, cancelled: { label: "בוטל", color: C.slate },
  scheduled: { label: "מתוזמן", color: C.navy }, sending: { label: "נשלח עכשיו…", color: C.warn },
}
const pad = (n: number) => String(n).padStart(2, "0")
const ACCEPT = Object.keys(MEDIA_TYPES).map(e => "." + e).join(",")
let seq = 1

/** Date and time strings for "in about an hour" (browser time = Israel), or the day after a given draft. */
function nextSlot(after?: Draft): { date: string; time: string } {
  if (after) {
    const d = new Date(`${after.date}T12:00:00`)
    d.setDate(d.getDate() + 1)
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: after.time }
  }
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
const newDraft = (after?: Draft): Draft => ({ key: seq++, ...nextSlot(after), repeat: "none", body: "", media: null })

export default function WaScheduled() {
  const [groups, setGroups] = useState<Group[]>([])
  const [groupsErr, setGroupsErr] = useState("")
  const [items, setItems] = useState<{ upcoming: Item[]; history: Item[] }>({ upcoming: [], history: [] })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [phones, setPhones] = useState("")
  const [drafts, setDrafts] = useState<Draft[]>(() => [newDraft()])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [showHistory, setShowHistory] = useState(false)

  async function loadGroups(refresh = false) {
    const d = await loadWaGroups(refresh)
    setGroups(d.groups)
    setGroupsErr(d.groups.length ? "" : d.error || "")
  }
  async function loadItems() {
    const r = await fetch("/api/admin/whatsapp-bot/scheduled")
    if (r.ok) setItems(await r.json())
  }
  useEffect(() => {
    loadGroups(); loadItems()
    return onWaGroups(d => { setGroups(d.groups); setGroupsErr(d.groups.length ? "" : d.error || "") })
  }, [])

  const phoneList = phones.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
  const badPhones = phoneList.filter(p => !chatIdFromPhone(p))
  const targets = [
    ...groups.filter(g => picked.has(g.id)).map(g => ({ chatId: g.id, name: g.name })),
    ...phoneList.filter(p => chatIdFromPhone(p)).map(p => ({ chatId: chatIdFromPhone(p)!, name: p })),
  ]
  const uploading = drafts.some(d => d.media && !d.media.id && !d.media.error)
  const total = targets.length * drafts.length

  const update = (key: number, patch: Partial<Draft>) => setDrafts(ds => ds.map(d => d.key === key ? { ...d, ...patch } : d))
  const setMedia = (key: number, patch: Partial<Media> | null) =>
    setDrafts(ds => ds.map(d => d.key !== key ? d : { ...d, media: patch === null ? null : { ...(d.media as Media), ...patch } }))

  async function attach(key: number, file: File) {
    const preview = URL.createObjectURL(file)
    setDrafts(ds => ds.map(d => d.key === key ? { ...d, media: { name: file.name, mime: file.type, size: file.size, progress: 0, preview } } : d))
    try {
      const r = await fetch("/api/admin/whatsapp-bot/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "ההעלאה נכשלה")
      for (let part = 0; part < d.parts; part++) {
        const blob = file.slice(part * d.chunkSize, Math.min(file.size, (part + 1) * d.chunkSize))
        let ok = false
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          const pr = await fetch(`/api/admin/whatsapp-bot/media?id=${d.id}&part=${part}`, { method: "PUT", body: blob })
          ok = pr.ok
          if (!ok && attempt === 2) throw new Error((await pr.json().catch(() => ({}))).error || "ההעלאה נכשלה")
        }
        setMedia(key, { progress: Math.round(((part + 1) / d.parts) * 100) })
      }
      const fr = await fetch("/api/admin/whatsapp-bot/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, finalize: true }) })
      if (!fr.ok) throw new Error((await fr.json().catch(() => ({}))).error || "ההעלאה נכשלה")
      setMedia(key, { id: d.id, progress: 100 })
    } catch (e: any) {
      setMedia(key, { error: e.message || "ההעלאה נכשלה" })
    }
  }

  async function submit() {
    setMsg("")
    if (!targets.length) { setMsg("בחרו לפחות קבוצה אחת או הוסיפו מספר"); return }
    if (badPhones.length) { setMsg(`מספר לא תקין: ${badPhones[0]}`); return }
    setBusy(true)
    try {
      const r = await fetch("/api/admin/whatsapp-bot/scheduled", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets, messages: drafts.map(d => ({ body: d.body, date: d.date, time: d.time, repeat: d.repeat, mediaId: d.media?.id || null })) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "שגיאה")
      setMsg(`✓ תוזמנו ${d.count} הודעות`)
      drafts.forEach(x => x.media?.preview && URL.revokeObjectURL(x.media.preview))
      setDrafts([newDraft()])
      loadItems()
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  async function act(id: number, action: "cancel" | "send_now") {
    if (action === "cancel" && !confirm("לבטל את ההודעה המתוזמנת?")) return
    const r = await fetch("/api/admin/whatsapp-bot/scheduled", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) })
    const d = await r.json().catch(() => ({}))
    setMsg(!r.ok ? d.error || "הפעולה נכשלה" : action === "send_now" ? "✓ נשלח" : "✓ בוטל")
    loadItems()
  }

  const input = { border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" } as const
  const small = (color = C.navy) => ({ border: `1px solid ${C.border}`, background: "#fff", color, borderRadius: 7, padding: "4px 10px", fontSize: 12, cursor: "pointer" }) as const
  const label = { fontSize: 12, color: C.slate } as const

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 18px 4px", fontSize: 15, fontWeight: 700 }}>⏰ הודעות מתוזמנות</div>
      <div style={{ padding: "0 18px 12px", fontSize: 12, color: C.slate }}>
        אפשר לתזמן כמה הודעות בבת אחת, כל אחת עם תאריך ושעה משלה, ולצרף תמונה או סרטון עם טקסט. הבוט שולח עד 5 דקות אחרי המועד. לקבוצה — הבוט צריך להיות חבר בה.
      </div>

      {/* 1. who */}
      <div style={{ padding: "0 18px 12px" }}>
        <div style={{ ...label, fontWeight: 700, color: C.navy, marginBottom: 6 }}>1. למי לשלוח {targets.length > 0 && <span style={{ color: C.green }}>· {targets.length} נבחרו</span>}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 170, overflowY: "auto" }}>
            {groups.map(g => (
              <label key={g.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderBottom: `1px solid ${C.bg}`, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={picked.has(g.id)} onChange={() => setPicked(s => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })} />
                <span>👥 {g.name}</span>
              </label>
            ))}
            {groups.length === 0 && (
              <div style={{ padding: 10, fontSize: 12, color: groupsErr ? C.bad : C.warn }}>
                {groupsErr || "הבוט לא חבר באף קבוצה. הוסיפו את 055-9388266 לקבוצה."} <button type="button" onClick={() => loadGroups(true)} style={small()}>רענן</button>
              </div>
            )}
          </div>
          <label style={label}>📱 מספרי טלפון (אופציונלי — שורה או פסיק בין מספרים)
            <textarea value={phones} onChange={e => setPhones(e.target.value)} rows={3} placeholder={"050-1234567\n052-7654321"}
              style={{ ...input, width: "100%", marginTop: 3, direction: "ltr", textAlign: "right", resize: "vertical" }} />
            {badPhones.length > 0 && <span style={{ color: C.bad }}>מספר לא תקין: {badPhones.join(", ")}</span>}
          </label>
        </div>
      </div>

      {/* 2. what & when */}
      <div style={{ padding: "0 18px 14px" }}>
        <div style={{ ...label, fontWeight: 700, color: C.navy, marginBottom: 6 }}>2. מה ומתי</div>
        {drafts.map((d, i) => {
          const tooLong = d.media ? d.body.length > MAX_CAPTION_LENGTH : d.body.length > MAX_SCHEDULED_LENGTH
          return (
            <div key={d.key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10, background: C.bg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13 }}>הודעה {i + 1}</b>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" style={small()} onClick={() => setDrafts(ds => [...ds.slice(0, i + 1), { ...newDraft(d), body: d.body }, ...ds.slice(i + 1)])}>שכפל ליום הבא</button>
                  {drafts.length > 1 && <button type="button" style={small(C.bad)} onClick={() => setDrafts(ds => ds.filter(x => x.key !== d.key))}>הסר</button>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <label style={{ ...label, flex: "1 1 140px" }}>תאריך
                  <input type="date" value={d.date} onChange={e => update(d.key, { date: e.target.value })} style={{ ...input, width: "100%", marginTop: 3 }} />
                </label>
                <label style={{ ...label, flex: "1 1 100px" }}>שעה
                  <input type="time" value={d.time} step={300} onChange={e => update(d.key, { time: e.target.value })} style={{ ...input, width: "100%", marginTop: 3 }} />
                </label>
                <label style={{ ...label, flex: "1 1 110px" }}>חזרה
                  <select value={d.repeat} onChange={e => update(d.key, { repeat: e.target.value as Repeat })} style={{ ...input, width: "100%", marginTop: 3 }}>
                    {(Object.keys(REPEAT_LABEL) as Repeat[]).map(k => <option key={k} value={k}>{REPEAT_LABEL[k]}</option>)}
                  </select>
                </label>
              </div>
              <textarea value={d.body} onChange={e => update(d.key, { body: e.target.value })} rows={4}
                placeholder={d.media ? "טקסט שיופיע מתחת לתמונה/לסרטון (לא חובה)" : "*תזכורת* — מחר בשעה 20:00 ערב הורים באלעד…"}
                style={{ ...input, width: "100%", resize: "vertical", lineHeight: 1.5, borderColor: tooLong ? C.bad : C.border }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <MediaPicker media={d.media} onPick={f => attach(d.key, f)} onRemove={() => { if (d.media?.preview) URL.revokeObjectURL(d.media.preview); setMedia(d.key, null) }} />
                <span style={{ fontSize: 11, color: tooLong ? C.bad : C.slate }}>{d.body.length}/{d.media ? MAX_CAPTION_LENGTH : MAX_SCHEDULED_LENGTH}</span>
              </div>
            </div>
          )
        })}
        <button type="button" onClick={() => setDrafts(ds => [...ds, newDraft(ds[ds.length - 1])])} style={small(C.green)}>+ הוסף הודעה</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "0 18px 16px" }}>
        <button type="button" onClick={submit} disabled={busy || uploading || !targets.length}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: busy || uploading || !targets.length ? .5 : 1 }}>
          {busy ? "שומר…" : uploading ? "מעלה קובץ…" : total > 1 ? `תזמן ${total} הודעות` : "תזמן הודעה"}
        </button>
        {targets.length > 1 && drafts.length > 0 && <span style={{ fontSize: 12, color: C.slate }}>{drafts.length} הודעות × {targets.length} יעדים</span>}
        {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith("✓") ? C.green : C.bad }}>{msg}</span>}
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

function MediaPicker({ media, onPick, onRemove }: { media: Media | null; onPick: (f: File) => void; onRemove: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const btn = { border: `1px solid ${C.border}`, background: "#fff", color: C.navy, borderRadius: 7, padding: "5px 11px", fontSize: 12, cursor: "pointer" } as const
  if (!media) return (
    <>
      <input ref={ref} type="file" accept={ACCEPT} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = "" }} />
      <button type="button" style={btn} onClick={() => ref.current?.click()}>📎 צרף תמונה / סרטון</button>
    </>
  )
  const isImg = media.mime.startsWith("image/"), isVid = media.mime.startsWith("video/")
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: 6, maxWidth: "100%" }}>
      {isImg && <img src={media.preview} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />}
      {isVid && <video src={media.preview} muted style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 6, background: "#000" }} />}
      {!isImg && !isVid && <span style={{ fontSize: 26 }}>📄</span>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{media.name}</div>
        <div style={{ fontSize: 11, color: media.error ? C.bad : media.id ? C.green : C.slate }}>
          {media.error ? media.error : media.id ? `✓ הועלה · ${(media.size / 1024 / 1024).toFixed(1)}MB` : `מעלה… ${media.progress}%`}
        </div>
        {!media.id && !media.error && <div style={{ height: 3, background: C.bg, borderRadius: 2, marginTop: 3, width: 140 }}><div style={{ height: 3, width: `${media.progress}%`, background: C.green, borderRadius: 2 }} /></div>}
      </div>
      <button type="button" onClick={onRemove} style={{ ...btn, color: C.bad, padding: "3px 8px" }} aria-label="הסר קובץ">✕</button>
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
        {it.media_id && (
          <a href={`/api/wa-media/${it.media_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.green, display: "inline-block", marginTop: 2 }}>
            {it.media_mime?.startsWith("video/") ? "🎬" : it.media_mime?.startsWith("image/") ? "🖼️" : "📄"} {it.media_name}
          </a>
        )}
        {it.body && <div style={{ fontSize: 12, color: C.slate, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2, maxHeight: 54, overflow: "hidden" }}>{it.body}</div>}
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
