import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { renderEmailHtml, personalizeHtml, personalizeText, EMPTY_EMAIL, EMPTY_SMS, contentProblems, renderSms } from "@/lib/messaging/render"
import { channelStatus } from "@/lib/messaging/core"
import { send019, toE164IL, toLocalIL, errLabel } from "@/lib/messaging/sms019"
import { sendEmail } from "@/lib/email"

/**
 * Test send to explicit addresses only. Not a campaign: nothing is queued,
 * no stats change, no recipient is picked from a list.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [c] = await db`SELECT * FROM msg_campaigns WHERE id = ${id}`
  if (!c) return bad("הקמפיין לא נמצא", 404)
  const d = await req.json().catch(() => ({}))
  if (c.channel === "sms") return smsTest(u, c, d)
  if (c.channel !== "email") return bad("שליחת בדיקה ל-WhatsApp תיפתח אחרי חיבור חשבון רשמי", 409)
  const to = (Array.isArray(d.emails) ? d.emails : [d.emails || u.email]).map((e: unknown) => String(e || "").trim().toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 5)
  if (!to.length) return bad("יש להזין כתובת מייל תקינה לבדיקה")
  const content = { ...EMPTY_EMAIL, ...(c.content || {}) }
  const problems = contentProblems("email", content)
  if (problems.length) return bad(problems.join(" · "))
  const app = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "")
  const html = personalizeHtml(renderEmailHtml(content, { orgAddress: process.env.NEWSLETTER_ORG_ADDRESS || "", logoUrl: app ? `${app}/netivim-logo-white.png` : undefined }),
    { first_name: String(d.sample_name || u.name || "").split(" ")[0], full_name: d.sample_name || u.name, unsubscribe_url: `${app}/newsletter/preferences`, preferences_url: `${app}/newsletter/preferences` })
  const results = []
  for (const addr of to) {
    const r: any = await sendEmail({ to: addr, subject: `[בדיקה] ${personalizeText(content.subject, { first_name: "" })}`, html })
    results.push({ to: addr, ok: !!r?.ok, reason: r?.reason || null })
  }
  await activity(u.name, "campaign.test", "campaign", id, to.join(", "))
  const failed = results.filter(r => !r.ok)
  if (failed.length === results.length) return bad(`שליחת הבדיקה נכשלה: ${failed[0].reason || "הספק לא אישר"}`, 502, { results })
  return NextResponse.json({ results })
}

/** SMS test: up to 3 explicit numbers, sent from the 019 virtual number. Replies to it are handled like real ones. */
async function smsTest(u: { name: string }, c: any, d: any) {
  if (!channelStatus(process.env).sms.connected) return bad("ערוץ ה-SMS אינו מחובר — " + channelStatus(process.env).sms.missing.join(", "), 409)
  const content = { ...EMPTY_SMS, ...(c.content || {}) }
  const problems = contentProblems("sms", content)
  if (problems.length) return bad(problems.join(" · "))
  const phones = (Array.isArray(d.phones) ? d.phones : String(d.phones || "").split(/[,\s]+/)).map((p: unknown) => toLocalIL(toE164IL(String(p || "")) || "")).filter(Boolean).slice(0, 3) as string[]
  if (!phones.length) return bad("יש להזין מספר טלפון ישראלי תקין לבדיקה")
  const app = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "")
  const text = renderSms(content, { first_name: String(d.sample_name || u.name || "").split(" ")[0], full_name: d.sample_name || u.name, unsubscribe_url: `${app}/newsletter/preferences` })
  const r = await send019(process.env, phones.map((p, i) => ({ id: `test-${c.id}-${Date.now()}-${i}`, phone: p, text })), `בדיקה: ${c.name}`)
  await activity(u.name, "campaign.test", "campaign", c.id, `SMS → ${phones.join(", ")}${r.ok ? "" : " (נכשל)"}`)
  if (!r.ok) return bad(`שליחת הבדיקה נכשלה — ${errLabel(r)}`, 502)
  // Remember the test for 2 days so a reply to it runs through this draft's menu (end-to-end test).
  for (const p of phones) {
    const e164 = toE164IL(p)
    if (e164) await db`INSERT INTO msg_provider_events (provider, provider_event_id, event_type, payload)
      VALUES ('019-test', ${`test:${c.id}:${e164}:${Date.now()}`}, 'sms.test', ${JSON.stringify({ campaign_id: c.id, phone: e164 })}::jsonb) ON CONFLICT DO NOTHING`.catch(() => {})
  }
  return NextResponse.json({ results: phones.map(p => ({ to: p, ok: true })) })
}
