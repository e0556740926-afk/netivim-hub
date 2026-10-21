// Rendering for campaign content — used for the live preview in the
// browser, the test send and the real delivery, so all three show the
// same thing. Pure: no "@/..." imports (see normalize.ts).

export type EmailContent = {
  subject: string
  preheader: string
  from_name: string
  reply_to: string
  mode: "blocks" | "html"
  title: string
  greeting: string
  intro: string
  main: { title: string; text: string; image_url: string; image_alt: string }
  sections: { title: string; text: string }[]
  event: { name: string; date: string; location: string; url: string } | null
  cta: { label: string; url: string } | null
  closing: string
  signature: string
  html: string
  archive: boolean
}
export type SmsContent = { text: string; sender_label: string; optout_text: string }
export type WhatsappContent = { template_name: string; language: string; variables: string[]; body_preview: string }
export type CampaignContent = Partial<EmailContent & SmsContent & WhatsappContent>

export const EMPTY_EMAIL: EmailContent = {
  subject: "", preheader: "", from_name: "נתיבים", reply_to: "", mode: "blocks",
  title: "", greeting: "שלום {{first_name}},", intro: "",
  main: { title: "", text: "", image_url: "", image_alt: "" },
  sections: [], event: null, cta: null,
  closing: "", signature: "צוות נתיבים", html: "", archive: true,
}
export const EMPTY_SMS: SmsContent = { text: "", sender_label: "Netivim", optout_text: "להסרה: {{unsubscribe_url}}" }
export const EMPTY_WHATSAPP: WhatsappContent = { template_name: "", language: "he", variables: ["{{first_name}}"], body_preview: "" }

export type Personal = { first_name?: string; full_name?: string; unsubscribe_url?: string; preferences_url?: string }

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const safeUrl = (u: string) => /^https?:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : ""
const para = (s: string) => esc(s).replace(/\n/g, "<br/>")

/** {{first_name}} etc. with a graceful fallback — never "שלום undefined". */
export function personalizeText(text: string, p: Personal, forHtml = false): string {
  const first = (p.first_name || "").trim()
  const full = (p.full_name || "").trim()
  const enc = (v: string) => forHtml ? esc(v) : v
  return text
    .replace(/\s*\{\{\s*first_name\s*\}\}/gi, first ? " " + enc(first) : "")
    .replace(/\{\{\s*full_name\s*\}\}/gi, enc(full || first))
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, p.unsubscribe_url || "#")
    .replace(/\{\{\s*preferences_url\s*\}\}/gi, p.preferences_url || "#")
}

/** Imported HTML is treated as untrusted: no scripts, frames, forms or inline handlers. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|form|base|meta[^>]*http-equiv)[\s\S]*?(<\/\1>|>)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"')
}

export function footerHtml(orgAddress: string) {
  return `<tr><td style="padding:18px 24px;background:#f4f7f4;text-align:center;font-size:11px;line-height:1.8;color:#6b7c74;">
    נתיבים — מרכז הכוון לצעירים חרדים<br/>${esc(orgAddress)}<br/>
    <a href="{{preferences_url}}" style="color:#6b7c74;">ניהול העדפות</a> ·
    <a href="{{unsubscribe_url}}" style="color:#6b7c74;">הסרה מרשימת התפוצה</a>
  </td></tr>`
}

/** Branded newsletter template (table layout, inline styles — what mail clients handle). */
export function renderEmailHtml(c: EmailContent, opts: { orgAddress: string; logoUrl?: string }): string {
  if (c.mode === "html") {
    const clean = sanitizeHtml(c.html || "")
    if (/\{\{\s*unsubscribe_url\s*\}\}/i.test(clean)) return clean
    const foot = `<table role="presentation" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;" dir="rtl">${footerHtml(opts.orgAddress)}</table>`
    return /<\/body>/i.test(clean) ? clean.replace(/<\/body>/i, foot + "</body>") : clean + foot
  }
  const cta = c.cta && c.cta.label && safeUrl(c.cta.url) ? `
    <tr><td style="padding:6px 28px 26px;" align="right">
      <a href="${esc(safeUrl(c.cta.url))}" style="display:inline-block;background:#21634f;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px;">${esc(c.cta.label)}</a>
    </td></tr>` : ""
  const img = safeUrl(c.main.image_url) ? `<img src="${esc(safeUrl(c.main.image_url))}" alt="${esc(c.main.image_alt)}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border-radius:12px;margin:0 0 16px;border:0;"/>` : ""
  const main = c.main.title || c.main.text || img ? `
    <tr><td style="padding:4px 28px 18px;">
      ${img}
      ${c.main.title ? `<h2 style="margin:0 0 8px;font-size:20px;line-height:1.4;color:#183d32;">${esc(c.main.title)}</h2>` : ""}
      ${c.main.text ? `<p style="margin:0;font-size:15px;line-height:1.8;color:#33473f;">${para(c.main.text)}</p>` : ""}
    </td></tr>` : ""
  const sections = (c.sections || []).filter(s => s.title || s.text).slice(0, 4).map(s => `
    <tr><td style="padding:16px 28px;border-top:1px solid #e1e8e3;">
      ${s.title ? `<h3 style="margin:0 0 6px;font-size:16px;color:#183d32;">${esc(s.title)}</h3>` : ""}
      ${s.text ? `<p style="margin:0;font-size:14px;line-height:1.8;color:#33473f;">${para(s.text)}</p>` : ""}
    </td></tr>`).join("")
  const ev = c.event && c.event.name ? `
    <tr><td style="padding:16px 28px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;background:#edf4ee;border-radius:12px;"><tr><td style="padding:16px 18px;">
        <div style="font-size:12px;color:#21634f;font-weight:700;margin-bottom:4px;">אירוע קרוב</div>
        <div style="font-size:16px;font-weight:700;color:#183d32;">${esc(c.event.name)}</div>
        <div style="font-size:13px;color:#4f6259;margin-top:4px;">${esc([c.event.date, c.event.location].filter(Boolean).join(" · "))}</div>
        ${safeUrl(c.event.url) ? `<a href="${esc(safeUrl(c.event.url))}" style="display:inline-block;margin-top:10px;color:#21634f;font-weight:700;font-size:13px;">לפרטים והרשמה ←</a>` : ""}
      </td></tr></table>
    </td></tr>` : ""
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#e9efea;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" style="border-collapse:collapse;background:#e9efea;" dir="rtl"><tr><td style="padding:24px 10px;">
<table role="presentation" style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border-collapse:collapse;font-family:Arial,'Segoe UI',sans-serif;" dir="rtl">
  <tr><td style="background:#102d43;padding:22px 28px;">
    ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="נתיבים" height="34" style="display:block;height:34px;border:0;"/>` : `<div style="color:#fff;font-size:20px;font-weight:800;">נתיבים</div>`}
  </td></tr>
  ${c.title ? `<tr><td style="padding:26px 28px 6px;"><h1 style="margin:0;font-size:24px;line-height:1.35;color:#183d32;">${esc(c.title)}</h1></td></tr>` : ""}
  ${c.greeting || c.intro ? `<tr><td style="padding:12px 28px 14px;">
    ${c.greeting ? `<p style="margin:0 0 8px;font-size:15px;color:#33473f;">${esc(c.greeting)}</p>` : ""}
    ${c.intro ? `<p style="margin:0;font-size:15px;line-height:1.8;color:#33473f;">${para(c.intro)}</p>` : ""}
  </td></tr>` : ""}
  ${main}${sections}${ev}${cta}
  ${c.closing || c.signature ? `<tr><td style="padding:12px 28px 26px;border-top:1px solid #e1e8e3;">
    ${c.closing ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.8;color:#33473f;">${para(c.closing)}</p>` : ""}
    ${c.signature ? `<p style="margin:0;font-size:14px;font-weight:700;color:#183d32;">${esc(c.signature)}</p>` : ""}
  </td></tr>` : ""}
  ${footerHtml(opts.orgAddress)}
</table></td></tr></table></body></html>`
}

/** Final per-recipient HTML (personalisation applied after rendering). */
export function personalizeHtml(html: string, p: Personal) {
  // Greeting text was HTML-escaped at render time; the token itself survives escaping.
  return personalizeText(html, p, true)
}

export function plainTextFromEmail(c: EmailContent): string {
  if (c.mode === "html") return ""
  return [c.title, c.greeting, c.intro, c.main.title, c.main.text,
    ...(c.sections || []).flatMap(s => [s.title, s.text]),
    c.event?.name ? `אירוע קרוב: ${c.event.name} ${[c.event.date, c.event.location].filter(Boolean).join(" · ")}` : "",
    c.cta?.label && c.cta.url ? `${c.cta.label}: ${c.cta.url}` : "",
    c.closing, c.signature, "להסרה: {{unsubscribe_url}}"].filter(Boolean).join("\n\n")
}

export function renderSms(c: SmsContent, p: Personal): string {
  return personalizeText([c.text, c.optout_text].filter(Boolean).join("\n"), p).trim()
}

/** What a campaign must contain before it can be approved — channel-specific. */
export function contentProblems(channel: string, c: CampaignContent): string[] {
  const out: string[] = []
  if (channel === "email") {
    if (!String(c.subject || "").trim()) out.push("חסרה שורת נושא")
    if (c.mode === "html" ? !String(c.html || "").trim() : !(c.title || c.intro || c.main?.text || c.closing || (c.sections || []).some(x => x.title || x.text))) out.push("גוף המייל ריק — בשלב \"תוכן\" יש למלא כותרת, פתיחה או טקסט")
    if (c.cta && c.cta.label && !safeUrl(c.cta.url || "")) out.push("כתובת הכפתור אינה קישור http/https תקין")
    if (c.main?.image_url && !safeUrl(c.main.image_url)) out.push("כתובת התמונה אינה קישור ציבורי תקין")
    if (c.reply_to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.reply_to)) out.push("כתובת Reply-To אינה תקינה")
  } else if (channel === "sms") {
    if (!String(c.text || "").trim()) out.push("חסר טקסט להודעה")
    if (!/\{\{\s*unsubscribe_url\s*\}\}/.test(String(c.optout_text || "") + String(c.text || ""))) out.push("חסרה דרך הסרה שעובדת בפועל")
  } else if (channel === "whatsapp") {
    if (!String(c.template_name || "").trim()) out.push("יש לבחור תבנית WhatsApp מאושרת")
  }
  return out
}
