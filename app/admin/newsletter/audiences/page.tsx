"use client"
import { useEffect, useState } from "react"
import Link from "next/link"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F" }
const AUDIENCE_LABEL: Record<string, string> = { contacts_partners: "אנשי קשר ושותפים", advisees: "נועצים", parents: "הורים שפנו אלינו" }

export default function NewsletterAudiences() {
  const [audience, setAudience] = useState("advisees")
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [count, setCount] = useState<number | null>(null)
  const [recipients, setRecipients] = useState<any[]>([])
  const [channel, setChannel] = useState<"email" | "whatsapp">("email")
  const [subject, setSubject] = useState("")
  const [html, setHtml] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; total: number } | null>(null)

  async function preview() {
    const params = new URLSearchParams({ audience, ...filters })
    const r = await fetch(`/api/newsletter/audiences?${params}`)
    const d = await r.json()
    setCount(d.count); setRecipients(d.recipients || [])
  }
  useEffect(() => { preview() }, [audience, filters])

  async function send() {
    if (!html || !recipients.length) return
    if (channel === "email" && !subject) return
    setSending(true); setResult(null)
    const r = await fetch("/api/newsletter/audiences/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipients, subject, html, channel }) })
    const d = await r.json()
    setResult(d); setSending(false)
  }

  const fields = audience === "contacts_partners"
    ? [["type", "סוג"], ["owner", "בעלים"]]
    : [["city", "עיר"], ["sector", "מגזר"], ["advisor_status", "סטטוס תיק"], ["owner_name", "יועץ מטפל"], ["source", "מקור פנייה"]]

  const eligibleCount = channel === "whatsapp" ? recipients.filter(r => r.phone).length : recipients.filter(r => r.email).length

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: T.bg, minHeight: "100vh", padding: "24px 32px 60px", color: T.navy }}>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10 }}>בית › <Link href="/admin/newsletter" style={{ color: T.slate }}>ניוזלטר</Link> › <span style={{ color: T.navy, fontWeight: 600 }}>דיוורים לקהלים</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>דיוורים לקהלים</div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["advisees", "contacts_partners", "parents"] as const).map(a => (
            <button key={a} onClick={() => { setAudience(a); setFilters({}) }} style={{ background: audience === a ? T.blue : T.bg, color: audience === a ? "#fff" : T.slate, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{AUDIENCE_LABEL[a]}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {fields.map(([key, label]) => (
            <input key={key} placeholder={label} value={filters[key] || ""} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, fontSize: 13 }} />
          ))}
        </div>
        <div style={{ fontSize: 13, color: T.slate, marginTop: 12 }}>{count !== null ? `${count} נמענים תואמים (עד 500 מוצגים)` : "טוען..."}</div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>הודעה</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setChannel("email")} style={{ background: channel === "email" ? T.blue : T.bg, color: channel === "email" ? "#fff" : T.slate, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📧 דוא&quot;ל</button>
            <button onClick={() => setChannel("whatsapp")} style={{ background: channel === "whatsapp" ? "#25D366" : T.bg, color: channel === "whatsapp" ? "#fff" : T.slate, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>💬 WhatsApp</button>
          </div>
        </div>
        {channel === "email" && (
          <input placeholder="נושא" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }} />
        )}
        <textarea placeholder={channel === "whatsapp" ? "תוכן ההודעה (טקסט רגיל — תגי HTML לא רלוונטיים ב-WhatsApp)" : "תוכן (HTML)"} rows={6} value={html} onChange={e => setHtml(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontFamily: "inherit", marginBottom: 12 }} />
        <button onClick={send} disabled={sending || !eligibleCount} style={{ background: channel === "whatsapp" ? "#25D366" : T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
          {sending ? "שולח..." : `שלח ל-${eligibleCount} נמענים ${channel === "whatsapp" ? "עם טלפון" : 'עם דוא"ל'}`}
        </button>
        {result && <div style={{ marginTop: 10, fontSize: 13, color: T.ok }}>נשלח בהצלחה ל-{result.sent} מתוך {result.total}</div>}
        <div style={{ fontSize: 11, color: T.slate, marginTop: 10 }}>שליחה ישירה, ללא אנליטיקס פתיחה/קליק וללא קישור הסרה — לא דרך צינור הניוזלטר הרגיל (זה נשאר לקהילת ההורים הקיימת). הודעות WhatsApp נשלחות דרך אותו חיבור Green API שכבר משמש את המערכת.</div>
      </div>
    </div>
  )
}
