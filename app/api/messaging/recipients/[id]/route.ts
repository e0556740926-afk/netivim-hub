import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"

const CH = ["email", "sms", "whatsapp"]

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [r] = await db`SELECT * FROM msg_recipients WHERE id = ${id}`
  if (!r) return bad("הנמען לא נמצא", 404)
  const [endpoints, consents, suppressions, audiences, deliveries] = await Promise.all([
    db`SELECT kind, value_raw, value_norm, is_valid, source, created_at FROM msg_endpoints WHERE recipient_id = ${id} ORDER BY kind`,
    db`SELECT channel, status, source, evidence, created_by, created_at FROM msg_consents WHERE recipient_id = ${id} ORDER BY created_at DESC, id DESC LIMIT 50`,
    db`SELECT s.channel, s.value_norm, s.reason, s.source, s.created_at FROM msg_suppressions s JOIN msg_endpoints e ON e.value_norm = s.value_norm WHERE e.recipient_id = ${id} ORDER BY s.created_at DESC`,
    db`SELECT a.id, a.name FROM msg_audience_members m JOIN msg_audiences a ON a.id = m.audience_id WHERE m.recipient_id = ${id} ORDER BY a.name`,
    db`SELECT cr.campaign_id, c.name, c.channel, cr.status, cr.sent_at FROM msg_campaign_recipients cr JOIN msg_campaigns c ON c.id = cr.campaign_id WHERE cr.recipient_id = ${id} ORDER BY cr.id DESC LIMIT 20`,
  ])
  return NextResponse.json({ recipient: { ...r, manage_token: undefined }, endpoints, consents, suppressions, audiences, deliveries, can: u.can })
}

/**
 * Manual permission changes, always appended to history:
 *   { consent: { channel, status: granted|revoked, source } }
 *   { suppress: { channel: email|sms|whatsapp|all } }
 *   { resubscribe: { channel, source } } — the explicit, logged way back
 *     after an unsubscribe. Bounces and complaints can't be lifted here.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [r] = await db`SELECT id, full_name FROM msg_recipients WHERE id = ${id}`
  if (!r) return bad("הנמען לא נמצא", 404)
  const d = await req.json().catch(() => ({}))
  if (d.consent) {
    const { channel, status } = d.consent
    const source = String(d.consent.source || "").trim()
    if (!CH.includes(channel) || !["granted", "revoked"].includes(status)) return bad("ערוץ או מצב לא תקינים")
    if (status === "granted" && !source) return bad("יש לתעד את מקור ההסכמה")
    if (status === "granted") {
      const [last] = await db`SELECT status FROM msg_consents WHERE recipient_id = ${id} AND channel = ${channel} AND topic = 'marketing' ORDER BY created_at DESC, id DESC LIMIT 1`
      if (last?.status === "revoked") return bad("הנמען ביקש הסרה בערוץ הזה — חידוש אפשרי רק דרך ״חידוש הרשמה״", 409)
    }
    await db`INSERT INTO msg_consents (recipient_id, channel, status, source, evidence, created_by) VALUES (${id}, ${channel}, ${status}, ${source || "עדכון ידני"}, 'manual', ${u.name})`
    await activity(u.name, "recipient.consent", "recipient", id, `${channel}: ${status}`)
  } else if (d.suppress) {
    const channel = d.suppress.channel
    if (![...CH, "all"].includes(channel)) return bad("ערוץ לא תקין")
    const kinds = channel === "email" ? ["email"] : channel === "all" ? ["email", "phone"] : ["phone"]
    await db`INSERT INTO msg_suppressions (channel, value_norm, reason, source)
      SELECT ${channel}, value_norm, 'manual', ${"ידני: " + u.name} FROM msg_endpoints WHERE recipient_id = ${id} AND kind = ANY(${kinds}::text[])
      ON CONFLICT DO NOTHING`
    const chans = channel === "all" ? CH : [channel]
    for (const ch of chans) await db`INSERT INTO msg_consents (recipient_id, channel, status, source, evidence, created_by) VALUES (${id}, ${ch}, 'revoked', 'הסרה ידנית', 'manual', ${u.name})`
    await activity(u.name, "recipient.suppress", "recipient", id, channel)
  } else if (d.resubscribe) {
    const channel = d.resubscribe.channel
    const source = String(d.resubscribe.source || "").trim()
    if (!CH.includes(channel)) return bad("ערוץ לא תקין")
    if (!source) return bad("חידוש הרשמה דורש תיעוד של בקשת הנמען")
    const kind = channel === "email" ? "email" : "phone"
    const hard = await db`SELECT s.reason FROM msg_suppressions s JOIN msg_endpoints e ON e.value_norm = s.value_norm
      WHERE e.recipient_id = ${id} AND e.kind = ${kind} AND s.reason IN ('bounce','complaint') LIMIT 1`
    if (hard.length) return bad("הכתובת חסומה בגלל החזרה או תלונה ואי אפשר לחדש אותה כאן", 409)
    await db`DELETE FROM msg_suppressions s USING msg_endpoints e WHERE e.value_norm = s.value_norm AND e.recipient_id = ${id}
      AND e.kind = ${kind} AND s.channel IN (${channel}, 'all') AND s.reason IN ('unsubscribe','manual','stop')`
    await db`INSERT INTO msg_consents (recipient_id, channel, status, source, evidence, created_by) VALUES (${id}, ${channel}, 'granted', ${source}, 'resubscribe', ${u.name})`
    await activity(u.name, "recipient.resubscribe", "recipient", id, `${channel}: ${source}`)
  } else return bad("לא נבחרה פעולה")
  return NextResponse.json({ ok: true })
}
