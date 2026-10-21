import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"
import { hasColumn } from "@/lib/schema"
import { unsubscribeResendContact } from "@/lib/newsletter"

/**
 * Public one-click unsubscribe for campaign messages (RFC 8058 POST from
 * mail clients, GET from the link). Identified by the recipient's private
 * token only. Unsubscribes from marketing email and, if the person is on
 * the newsletter list, from the newsletter too — never deletes CRM data.
 */
async function run(token: string | null, campaign: string | null) {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token) || !(await hasColumn("msg_recipients", "manage_token"))) return false
  const [r] = await sql`SELECT id, newsletter_subscriber_id FROM msg_recipients WHERE manage_token = ${token}::uuid`
  if (!r) return false
  const src = campaign && /^\d+$/.test(campaign) ? `campaign:${campaign}` : "קישור הסרה"
  await sql`INSERT INTO msg_suppressions (channel, value_norm, reason, source)
    SELECT 'email', value_norm, 'unsubscribe', ${src} FROM msg_endpoints WHERE recipient_id = ${r.id} AND kind = 'email' ON CONFLICT DO NOTHING`
  await sql`INSERT INTO msg_consents (recipient_id, channel, status, source, evidence, created_by) VALUES (${r.id}, 'email', 'revoked', 'בקשת הסרה מהנמען', ${src}, 'נמען')`
  if (r.newsletter_subscriber_id) {
    const rows = await sql`UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = now() WHERE id = ${r.newsletter_subscriber_id} AND status = 'active' RETURNING resend_contact_id`
    if (rows[0]) await unsubscribeResendContact(rows[0].resend_contact_id || null).catch(() => {})
  }
  return true
}

export async function POST(req: NextRequest) {
  const ok = await run(req.nextUrl.searchParams.get("t"), req.nextUrl.searchParams.get("c")).catch(() => false)
  return NextResponse.json({ ok })
}

export async function GET(req: NextRequest) {
  const ok = await run(req.nextUrl.searchParams.get("t"), req.nextUrl.searchParams.get("c")).catch(() => false)
  return NextResponse.redirect(new URL(ok ? "/newsletter/unsubscribed" : "/newsletter/preferences", req.url))
}
