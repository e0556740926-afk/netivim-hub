// Incoming replies and delivery reports from 019 (Push API), plus the
// shared "לידים מקמפיינים" writer. Relative imports only; DB passed in.
import type { Db, Env } from "./core"
import { EMPTY_SMS } from "./render"
import { isStop, matchReply, normReply } from "./replies"
import { send019, toE164IL, toLocalIL, dlrState, dlrLabel, errLabel } from "./sms019"

/** How long after a campaign SMS a reply is still attributed to it. */
const REPLY_WINDOW_DAYS = 30

export type CallbackInput = {
  campaign_id: number | null
  campaign_recipient_id: number | null
  recipient_id: number | null
  channel: "sms" | "whatsapp" | "email"
  phone?: string
  email?: string
  request_text: string
}

/**
 * Adds a person to "לידים מקמפיינים". One row per person per campaign: a
 * repeat request refreshes it, and a row already closed is reopened.
 */
export async function upsertCallback(db: Db, x: CallbackInput): Promise<number | null> {
  const [p] = x.recipient_id ? await db`SELECT r.full_name, r.city,
      (SELECT value_norm FROM msg_endpoints WHERE recipient_id = r.id AND kind = 'phone' ORDER BY is_valid DESC, id LIMIT 1) AS phone,
      (SELECT value_norm FROM msg_endpoints WHERE recipient_id = r.id AND kind = 'email' ORDER BY is_valid DESC, id LIMIT 1) AS email
    FROM msg_recipients r WHERE r.id = ${x.recipient_id}` : [null]
  const phone = x.phone || p?.phone || ""
  const email = x.email || p?.email || ""
  if (x.campaign_id && x.recipient_id) {
    const [row] = await db`INSERT INTO msg_callbacks (campaign_id, campaign_recipient_id, recipient_id, channel, full_name, phone, email, city, request_text)
      VALUES (${x.campaign_id}, ${x.campaign_recipient_id}, ${x.recipient_id}, ${x.channel}, ${p?.full_name || ""}, ${phone}, ${email}, ${p?.city || ""}, ${x.request_text})
      ON CONFLICT (campaign_id, recipient_id) WHERE campaign_id IS NOT NULL AND recipient_id IS NOT NULL DO UPDATE SET
        request_text = EXCLUDED.request_text, channel = EXCLUDED.channel,
        status = CASE WHEN msg_callbacks.status IN ('done','no_answer') THEN 'new' ELSE msg_callbacks.status END,
        updated_at = now()
      RETURNING id`
    return row ? Number(row.id) : null
  }
  // Unknown sender or no campaign: avoid piling up duplicates for the same number.
  const [open] = await db`SELECT id FROM msg_callbacks WHERE phone = ${phone} AND phone <> '' AND status IN ('new','in_progress')
    AND COALESCE(campaign_id, 0) = COALESCE(${x.campaign_id}::int, 0) LIMIT 1`
  if (open) { await db`UPDATE msg_callbacks SET request_text = ${x.request_text}, updated_at = now() WHERE id = ${open.id}`; return Number(open.id) }
  const [row] = await db`INSERT INTO msg_callbacks (campaign_id, campaign_recipient_id, recipient_id, channel, full_name, phone, email, city, request_text)
    VALUES (${x.campaign_id}, ${x.campaign_recipient_id}, ${x.recipient_id}, ${x.channel}, ${p?.full_name || ""}, ${phone}, ${email}, ${p?.city || ""}, ${x.request_text}) RETURNING id`
  return row ? Number(row.id) : null
}

/** Revokes SMS marketing for a number (reply "הסר" or 019's blacklist push). */
export async function stopSms(db: Db, phoneE164: string, recipientId: number | null, source: string) {
  await db`INSERT INTO msg_suppressions (channel, value_norm, reason, source) VALUES ('sms', ${phoneE164}, 'stop', ${source}) ON CONFLICT DO NOTHING`
  const rid = recipientId ?? (await db`SELECT recipient_id FROM msg_endpoints WHERE kind = 'phone' AND value_norm = ${phoneE164} LIMIT 1`)[0]?.recipient_id
  if (rid) await db`INSERT INTO msg_consents (recipient_id, channel, status, source, evidence, created_by) VALUES (${rid}, 'sms', 'revoked', 'הנמען השיב "הסר"', ${source}, 'נמען')`
}

export type IncomingSms = { phone: string; body: string; dest?: string; date?: string }

/**
 * One incoming SMS: stored once (de-duplicated), attributed to the latest
 * campaign SMS sent to that number, then acted on per the campaign's reply
 * menu. Anything not understood waits in "תשובות לטיפול".
 */
export async function handleIncomingSms(db: Db, env: Env, m: IncomingSms) {
  const from = toE164IL(m.phone) || String(m.phone || "").trim()
  const body = String(m.body || "").slice(0, 1000)
  const eventId = `in:${from}:${m.date || ""}:${body}`.slice(0, 400)
  const [ins] = await db`INSERT INTO msg_inbound (channel, provider, provider_event_id, from_norm, to_number, body)
    VALUES ('sms', '019', ${eventId}, ${from}, ${String(m.dest || "")}, ${body}) ON CONFLICT DO NOTHING RETURNING id`
  if (!ins) return { duplicate: true }
  const inboundId = Number(ins.id)

  const [cr] = await db.query(`SELECT cr.id, cr.campaign_id, cr.recipient_id, c.approved_content, c.content
    FROM msg_campaign_recipients cr JOIN msg_campaigns c ON c.id = cr.campaign_id
    WHERE cr.address = $1 AND c.channel = 'sms' AND cr.sent_at > now() - ($2 || ' days')::interval
    ORDER BY cr.sent_at DESC LIMIT 1`, [from, String(REPLY_WINDOW_DAYS)])
  // No real delivery? A test SMS from the editor (last 2 days) still runs through that draft's menu.
  const [test] = cr ? [null] : await db`SELECT c.id AS campaign_id, c.content, c.approved_content FROM msg_provider_events pe JOIN msg_campaigns c ON c.id = (pe.payload->>'campaign_id')::int
    WHERE pe.provider = '019-test' AND pe.payload->>'phone' = ${from} AND pe.received_at > now() - interval '2 days' ORDER BY pe.received_at DESC LIMIT 1`
  const recipientId: number | null = cr?.recipient_id ? Number(cr.recipient_id)
    : ((await db`SELECT recipient_id FROM msg_endpoints WHERE kind = 'phone' AND value_norm = ${from} LIMIT 1`)[0]?.recipient_id ?? null)
  const campaignId: number | null = cr ? Number(cr.campaign_id) : test ? Number(test.campaign_id) : null
  const src = cr || test
  const content = { ...EMPTY_SMS, ...((src?.approved_content || src?.content) || {}) }

  let action = "none", key: string | null = null, handled = false, autoStatus = ""
  if (isStop(body)) {
    await stopSms(db, from, recipientId, campaignId ? `campaign:${campaignId}` : "תשובת SMS")
    action = "unsubscribe"; key = "הסר"; handled = true
  } else {
    const opt = matchReply(body, content.replies)
    if (opt) {
      key = opt.key; handled = true
      const acts: string[] = []
      if (opt.callback) {
        await upsertCallback(db, { campaign_id: campaignId, campaign_recipient_id: cr ? Number(cr.id) : null, recipient_id: recipientId, channel: "sms", phone: from, request_text: `השיב ${opt.key}${opt.label ? ` — ${opt.label}` : ""}` })
        acts.push("callback")
      }
      const text = String(opt.reply_text || "").trim()
      const local = toLocalIL(from)
      if (text && local) {
        const r = await send019(env, [{ id: `in-${inboundId}`, phone: local, text }], "תשובה אוטומטית")
        autoStatus = r.ok ? "sent" : errLabel(r)
        acts.push("reply")
      }
      action = acts.join("+") || "none"
    }
  }
  if (cr && key) await db`UPDATE msg_campaign_recipients SET replied_at = COALESCE(replied_at, now()), reply_key = COALESCE(reply_key, ${key}) WHERE id = ${cr.id}`
  else if (cr) await db`UPDATE msg_campaign_recipients SET replied_at = COALESCE(replied_at, now()) WHERE id = ${cr.id}`
  await db`UPDATE msg_inbound SET campaign_id = ${campaignId}, campaign_recipient_id = ${cr ? Number(cr.id) : null}, recipient_id = ${recipientId},
      matched_key = ${key}, action = ${action}, auto_reply_status = ${autoStatus}, handled = ${handled}
    WHERE id = ${inboundId}`
  return { id: inboundId, campaign_id: campaignId, action, key, normalized: normReply(body) }
}

export type Dlr = { external_id: string; status: string; phone?: string; date?: string }

/** Delivery report for a campaign SMS (external id = msg_campaign_recipients.id). */
export async function handleSmsDlr(db: Db, d: Dlr) {
  const id = /^\d+$/.test(String(d.external_id || "")) ? Number(d.external_id) : null
  if (!id) return { ignored: true }   // auto-replies ("in-…") and foreign ids
  const state = dlrState(d.status)
  const [ev] = await db`INSERT INTO msg_provider_events (provider, provider_event_id, campaign_recipient_id, event_type, payload)
    VALUES ('019', ${`dlr:${id}:${d.status}`}, ${id}, ${"dlr." + state}, ${JSON.stringify(d)}::jsonb) ON CONFLICT DO NOTHING RETURNING id`
  if (!ev) return { duplicate: true }
  if (state === "delivered") await db`UPDATE msg_campaign_recipients SET status = 'delivered', last_error = '', updated_at = now() WHERE id = ${id} AND status IN ('accepted','unknown','failed')`
  else if (state === "failed") await db`UPDATE msg_campaign_recipients SET status = 'failed', last_error = ${"019: " + dlrLabel(d.status)}, updated_at = now() WHERE id = ${id} AND status IN ('accepted','unknown')`
  return { id, state }
}
