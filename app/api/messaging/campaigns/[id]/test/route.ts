import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { renderEmailHtml, personalizeHtml, personalizeText, EMPTY_EMAIL, contentProblems } from "@/lib/messaging/render"
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
  if (c.channel !== "email") return bad("שליחת בדיקה ל-SMS ול-WhatsApp תיפתח אחרי חיבור ספק", 409)
  const d = await req.json().catch(() => ({}))
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
