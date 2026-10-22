// Messaging center — data logic shared by the API routes and the Netlify
// background worker. Only relative imports here (the worker is bundled
// on its own and can't resolve "@/..." aliases). The DB client is passed
// in, so this file never opens a connection by itself.
import { normalizeRow, type Channel, type NormalizedRow } from "./normalize"
import { renderEmailHtml, personalizeHtml, personalizeText, plainTextFromEmail, renderSms, type EmailContent, EMPTY_EMAIL, EMPTY_SMS, contentProblems } from "./render"
import { send019, sms019Missing, toLocalIL, errLabel } from "./sms019"

export type Db = {
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
  query: (text: string, params?: any[]) => Promise<any[]>
  transaction?: (queries: any[]) => Promise<any[]>
}
export type Env = Record<string, string | undefined>

export const ENDPOINT_KIND: Record<Channel, "email" | "phone"> = { email: "email", sms: "phone", whatsapp: "phone" }

// ── connections ───────────────────────────────────────────────────
export type ChannelStatus = { channel: Channel; connected: boolean; provider: string; missing: string[]; note: string }

/**
 * A channel is "connected" only when everything needed for a real send is
 * configured AND an admin has switched it on explicitly. Until then drafts
 * can be prepared but nothing can be approved for sending.
 */
export function channelStatus(env: Env): Record<Channel, ChannelStatus> {
  const key = env.MESSAGING_RESEND_API_KEY || env.RESEND_NEWSLETTER_API_KEY
  const from = env.MESSAGING_EMAIL_FROM
  const emailMissing: string[] = []
  if (!key) emailMissing.push("מפתח API של Resend עם הרשאת שליחה (MESSAGING_RESEND_API_KEY)")
  if (!from) emailMissing.push("כתובת שולח מדומיין מאומת (MESSAGING_EMAIL_FROM)")
  if (env.MESSAGING_EMAIL_ENABLED !== "true") emailMissing.push("הפעלה מפורשת אחרי אימות הדומיין (MESSAGING_EMAIL_ENABLED=true)")
  const smsMissing = sms019Missing(env)
  if (env.MESSAGING_SMS_ENABLED !== "true") smsMissing.push("הפעלה מפורשת של ערוץ ה-SMS (MESSAGING_SMS_ENABLED=true)")
  return {
    email: { channel: "email", provider: "Resend", connected: emailMissing.length === 0, missing: emailMissing, note: "מתאם קיים בקוד. דורש דומיין מאומת ב-Resend וזהות שולח." },
    sms: { channel: "sms", provider: "019", connected: smsMissing.length === 0, missing: smsMissing, note: "נשלח מהמספר הווירטואלי — הנמען יכול להשיב (תפריט תשובות, \"השב הסר\"). תשובות ודוחות מסירה נכנסים דרך Push API של 019." },
    whatsapp: { channel: "whatsapp", provider: "טרם נבחר", connected: false, missing: ["חשבון WhatsApp Business Platform רשמי (ישיר או דרך ספק)", "תבניות הודעה מאושרות", "מתאם שליחה וסטטוסים"], note: "Green API הקיים משמש להודעות מערכת בלבד ואינו מחובר לקמפיינים." },
  }
}

// ── newsletter → messaging sync ───────────────────────────────────
/**
 * Mirrors the existing newsletter list into the shared recipient pool:
 * links/creates recipients, adds them to the system audience, turns
 * unsubscribes/bounces into suppressions and records the newsletter
 * signup as email consent. Set-based and idempotent; the newsletter
 * tables themselves are never modified here.
 */
export async function syncNewsletter(db: Db) {
  const [has] = await db`SELECT to_regclass('newsletter_subscribers') IS NOT NULL AS ok`
  if (!has?.ok) return
  const [aud] = await db`SELECT id FROM msg_audiences WHERE system_key='newsletter' LIMIT 1`
  if (!aud) return
  // 1. link a subscriber to a recipient that already owns the same email
  await db`UPDATE msg_recipients r SET newsletter_subscriber_id = s.id, updated_at = now()
    FROM msg_endpoints e, newsletter_subscribers s
    WHERE e.recipient_id = r.id AND e.kind = 'email' AND e.value_norm = lower(btrim(s.email))
      AND r.newsletter_subscriber_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM msg_recipients r2 WHERE r2.newsletter_subscriber_id = s.id)`
  // 2. create recipients for the rest
  await db`INSERT INTO msg_recipients (full_name, newsletter_subscriber_id, city, created_by)
    SELECT COALESCE(s.name, ''), s.id, COALESCE(s.area, ''), 'ניוזלטר'
    FROM newsletter_subscribers s
    WHERE NOT EXISTS (SELECT 1 FROM msg_recipients r WHERE r.newsletter_subscriber_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM msg_endpoints e WHERE e.kind='email' AND e.value_norm = lower(btrim(s.email)))
    ON CONFLICT DO NOTHING`
  await db`INSERT INTO msg_endpoints (recipient_id, kind, value_raw, value_norm, is_valid, source)
    SELECT r.id, 'email', s.email, lower(btrim(s.email)), true, 'ניוזלטר'
    FROM newsletter_subscribers s JOIN msg_recipients r ON r.newsletter_subscriber_id = s.id
    WHERE COALESCE(btrim(s.email), '') <> ''
    ON CONFLICT (kind, value_norm) DO NOTHING`
  await db`INSERT INTO msg_audience_members (audience_id, recipient_id, added_by)
    SELECT ${aud.id}, r.id, 'ניוזלטר' FROM newsletter_subscribers s JOIN msg_recipients r ON r.newsletter_subscriber_id = s.id
    ON CONFLICT DO NOTHING`
  await db`INSERT INTO msg_suppressions (channel, value_norm, reason, source)
    SELECT 'email', lower(btrim(s.email)), CASE WHEN s.status = 'bounced' THEN 'bounce' ELSE 'unsubscribe' END, 'ניוזלטר'
    FROM newsletter_subscribers s WHERE s.status IN ('unsubscribed', 'bounced')
    ON CONFLICT DO NOTHING`
  await db`INSERT INTO msg_consents (recipient_id, channel, topic, status, source, evidence, created_by)
    SELECT r.id, 'email', 'marketing', CASE WHEN s.status = 'active' THEN 'granted' ELSE 'revoked' END,
      COALESCE(NULLIF(s.consent_source, ''), 'הרשמה לניוזלטר'), 'newsletter_subscriber:' || s.id, 'ניוזלטר'
    FROM newsletter_subscribers s JOIN msg_recipients r ON r.newsletter_subscriber_id = s.id
    WHERE NOT EXISTS (SELECT 1 FROM msg_consents c WHERE c.recipient_id = r.id AND c.channel = 'email' AND c.topic = 'marketing')`
}

// ── eligibility ───────────────────────────────────────────────────
export type Eligibility = {
  selected: number
  eligible: number
  reasons: { no_address: number; invalid: number; suppressed: number; consent_revoked: number; consent_unknown: number }
}

/**
 * The single place that decides who a campaign may reach. Works on the
 * full audiences in the database (never on a page of results the browser
 * happened to load). One address per recipient; one message per address.
 */
function eligibilitySql(onlyEligible: boolean) {
  return `
  WITH members AS (
    SELECT DISTINCT recipient_id FROM msg_audience_members WHERE audience_id = ANY($1::int[])
    EXCEPT SELECT recipient_id FROM msg_audience_members WHERE audience_id = ANY($2::int[])
  ), ep AS (
    SELECT DISTINCT ON (m.recipient_id) m.recipient_id, e.value_norm, e.is_valid
    FROM members m LEFT JOIN msg_endpoints e ON e.recipient_id = m.recipient_id AND e.kind = $3
    ORDER BY m.recipient_id, e.is_valid DESC NULLS LAST, e.id
  ), classified AS (
    SELECT ep.recipient_id, ep.value_norm,
      CASE
        WHEN ep.value_norm IS NULL THEN 'no_address'
        WHEN NOT ep.is_valid THEN 'invalid'
        WHEN EXISTS (SELECT 1 FROM msg_suppressions s WHERE s.value_norm = ep.value_norm AND s.channel IN ($4, 'all'))
          OR EXISTS (SELECT 1 FROM msg_suppressions s JOIN msg_endpoints e2 ON e2.value_norm = s.value_norm
                     WHERE e2.recipient_id = ep.recipient_id AND s.channel = 'all') THEN 'suppressed'
        ELSE COALESCE((SELECT CASE c.status WHEN 'granted' THEN 'eligible' WHEN 'revoked' THEN 'consent_revoked' ELSE 'consent_unknown' END
                       FROM msg_consents c WHERE c.recipient_id = ep.recipient_id AND c.channel = $4 AND c.topic = 'marketing'
                       ORDER BY c.created_at DESC, c.id DESC LIMIT 1), 'consent_unknown')
      END AS state
    FROM ep
  )
  ${onlyEligible
    ? "SELECT recipient_id, value_norm FROM classified WHERE state = 'eligible'"
    : "SELECT state, count(*)::int AS n FROM classified GROUP BY state"}`
}

export async function computeEligibility(db: Db, channel: Channel, audienceIds: number[], excludeIds: number[]): Promise<Eligibility> {
  const rows = await db.query(eligibilitySql(false), [audienceIds, excludeIds, ENDPOINT_KIND[channel], channel])
  const by: Record<string, number> = {}
  for (const r of rows) by[r.state] = Number(r.n)
  const reasons = { no_address: by.no_address || 0, invalid: by.invalid || 0, suppressed: by.suppressed || 0, consent_revoked: by.consent_revoked || 0, consent_unknown: by.consent_unknown || 0 }
  const selected = Object.values(by).reduce((a, b) => a + b, 0)
  return { selected, eligible: by.eligible || 0, reasons }
}

/** Freezes the recipient list at approval. Idempotent: re-running adds nobody twice. */
export async function snapshotCampaign(db: Db, c: { id: number; channel: Channel; audience_ids: number[]; exclude_audience_ids: number[] }) {
  await db.query(`INSERT INTO msg_campaign_recipients (campaign_id, recipient_id, address)
    SELECT $5, recipient_id, value_norm FROM (${eligibilitySql(true)}) q
    ON CONFLICT (campaign_id, address) DO NOTHING`, [c.audience_ids, c.exclude_audience_ids, ENDPOINT_KIND[c.channel], c.channel, c.id])
  await db`UPDATE msg_campaigns SET snapshot_at = COALESCE(snapshot_at, now()) WHERE id = ${c.id}`
}

// ── imports ───────────────────────────────────────────────────────
export type RowClass = { row_no: number; outcome: "new" | "existing" | "duplicate" | "invalid" | "suppressed" | "conflict"; reason: string; norm: NormalizedRow; recipient_id: number | null }

/**
 * Classifies every row of an import job once, with one primary outcome per
 * row (they always add up to the rows read). Nothing is written to the
 * recipient pool here — that happens only after the user confirms.
 */
export async function classifyImport(db: Db, jobId: number, defaultCountry: string) {
  const rows = await db`SELECT row_no, data FROM msg_import_rows WHERE job_id = ${jobId} ORDER BY row_no`
  const normed = rows.map(r => ({ row_no: Number(r.row_no), raw: r.data?.raw || {}, link: r.data?.link || null, norm: normalizeRow(r.data?.raw || {}, defaultCountry) }))
  const emails = [...new Set(normed.map(r => r.norm.email_valid ? r.norm.email : null).filter(Boolean) as string[])]
  const phones = [...new Set(normed.map(r => r.norm.phone_valid ? r.norm.phone : null).filter(Boolean) as string[])]
  const existing = await db`SELECT kind, value_norm, recipient_id FROM msg_endpoints WHERE (kind='email' AND value_norm = ANY(${emails}::text[])) OR (kind='phone' AND value_norm = ANY(${phones}::text[]))`
  const owner = new Map(existing.map(e => [e.kind + ":" + e.value_norm, Number(e.recipient_id)]))
  const supp = await db`SELECT DISTINCT value_norm FROM msg_suppressions WHERE value_norm = ANY(${[...emails, ...phones]}::text[])`
  const suppressed = new Set(supp.map(s => s.value_norm))
  const seen = new Map<string, number>()
  const out: RowClass[] = []
  for (const r of normed) {
    const n = r.norm
    const em = n.email && n.email_valid ? n.email : null
    const ph = n.phone && n.phone_valid ? n.phone : null
    const notes: string[] = []
    if (n.email && !n.email_valid) notes.push("כתובת המייל אינה תקינה")
    if (n.phone && !n.phone_valid) notes.push("מספר הטלפון אינו תקין")
    let outcome: RowClass["outcome"]
    let recipient: number | null = null
    if (!em && !ph) { outcome = "invalid"; notes.unshift(!n.email && !n.phone ? "אין מייל או טלפון" : "אין פרט קשר תקין") }
    else {
      const keys = [em && "email:" + em, ph && "phone:" + ph].filter(Boolean) as string[]
      const dupOf = keys.map(k => seen.get(k)).find(v => v !== undefined)
      const a = em ? owner.get("email:" + em) : undefined
      const b = ph ? owner.get("phone:" + ph) : undefined
      if (dupOf !== undefined) { outcome = "duplicate"; notes.unshift(`כפול בקובץ (כמו שורה ${dupOf})`) }
      else if (a && b && a !== b) { outcome = "conflict"; notes.unshift("המייל והטלפון שייכים לשני נמענים שונים — לבירור, לא אוחדו") }
      else {
        recipient = a || b || null
        if ((em && suppressed.has(em)) || (ph && suppressed.has(ph))) { outcome = "suppressed"; notes.unshift("הוסר / חסום — ייכנס לקהל אבל לא יקבל הודעות") }
        else outcome = recipient ? "existing" : "new"
      }
      keys.forEach(k => { if (!seen.has(k)) seen.set(k, r.row_no) })
    }
    out.push({ row_no: r.row_no, outcome, reason: notes.join(" · "), norm: n, recipient_id: recipient })
  }
  // write outcomes back in chunks (one statement per chunk)
  for (let i = 0; i < out.length; i += 1000) {
    const part = out.slice(i, i + 1000)
    await db.query(`UPDATE msg_import_rows r SET outcome = v.outcome, reason = v.reason, recipient_id = v.rid,
        data = jsonb_set(r.data, '{norm}', v.norm::jsonb)
      FROM unnest($2::int[], $3::text[], $4::text[], $5::int[], $6::text[]) AS v(row_no, outcome, reason, rid, norm)
      WHERE r.job_id = $1 AND r.row_no = v.row_no`,
      [jobId, part.map(p => p.row_no), part.map(p => p.outcome), part.map(p => p.reason), part.map(p => p.recipient_id), part.map(p => JSON.stringify(p.norm))])
  }
  const counts: Record<string, number> = { new: 0, existing: 0, duplicate: 0, invalid: 0, suppressed: 0, conflict: 0 }
  out.forEach(o => counts[o.outcome]++)
  const channels = {
    email: out.filter(o => ["new", "existing"].includes(o.outcome) && o.norm.email_valid).length,
    phone: out.filter(o => ["new", "existing"].includes(o.outcome) && o.norm.phone_valid).length,
  }
  await db`UPDATE msg_import_jobs SET status = 'validated', total_rows = ${out.length}, counts = ${JSON.stringify({ ...counts, channels })}::jsonb WHERE id = ${jobId}`
  return { total: out.length, counts, channels }
}

/**
 * Applies up to `limit` confirmed rows. Each call is one DB transaction, so
 * a failure leaves the batch untouched and safe to retry; rows already
 * applied are never applied twice. Imports only ever add: they fill empty
 * fields, add memberships and record consent declared in the file — they
 * never remove a suppression, revive a revoked consent or touch CRM data.
 */
export async function applyImportBatch(db: Db, jobId: number, actor: string, limit = 150): Promise<{ applied: number; remaining: number }> {
  const [job] = await db`SELECT * FROM msg_import_jobs WHERE id = ${jobId}`
  if (!job || !job.audience_id) throw new Error("לא נבחר קהל יעד")
  const rows = await db`SELECT row_no, outcome, data, recipient_id FROM msg_import_rows
    WHERE job_id = ${jobId} AND NOT applied AND outcome IN ('new','existing','suppressed') ORDER BY row_no LIMIT ${limit}`
  const basis = job.options?.consent_basis as { channels: Channel[]; source: string } | undefined
  const stmts: any[] = []
  for (const r of rows) {
    const n: NormalizedRow = r.data?.norm
    const link = r.data?.link || {}
    if (!n) continue
    const consents: { channel: Channel; status: string; source: string; evidence: string }[] = []
    if (n.consent && n.consent.status !== "unknown") {
      const chans: Channel[] = n.consent.channel === "all" ? ["email", "sms", "whatsapp"] : [n.consent.channel]
      chans.forEach(ch => consents.push({ channel: ch, status: n.consent!.status, source: n.consent!.source || "עמודת הרשאה בקובץ", evidence: `import:${jobId}:row:${r.row_no}${n.consent!.date ? ":" + n.consent!.date : ""}` }))
    } else if (basis?.channels?.length && basis.source) {
      basis.channels.forEach(ch => consents.push({ channel: ch, status: "granted", source: basis.source, evidence: `import:${jobId}` }))
    }
    const consentJson = JSON.stringify(consents)
    const email = n.email_valid ? n.email : null
    const phone = n.phone_valid ? n.phone : null
    stmts.push(db.query(`
      WITH existing AS (
        SELECT COALESCE($2::int, (SELECT recipient_id FROM msg_endpoints WHERE (kind='email' AND value_norm=$5) OR (kind='phone' AND value_norm=$7) ORDER BY kind LIMIT 1)) AS id
      ), created AS (
        INSERT INTO msg_recipients (full_name, country, city, org, tags, created_by, lead_id, contact_id)
        SELECT $9, $10, $11, $12, $13::text[], $14, $16, $17 WHERE (SELECT id FROM existing) IS NULL
        RETURNING id
      ), target AS (
        SELECT id FROM created UNION ALL SELECT id FROM existing WHERE id IS NOT NULL
      ), filled AS (
        UPDATE msg_recipients r SET
          full_name = CASE WHEN r.full_name = '' THEN $9 ELSE r.full_name END,
          city = CASE WHEN r.city = '' THEN $11 ELSE r.city END,
          org = CASE WHEN r.org = '' THEN $12 ELSE r.org END,
          tags = ARRAY(SELECT DISTINCT unnest(r.tags || $13::text[])),
          lead_id = COALESCE(r.lead_id, $16), contact_id = COALESCE(r.contact_id, $17),
          updated_at = now()
        WHERE r.id = (SELECT id FROM existing) RETURNING r.id
      ), e1 AS (
        INSERT INTO msg_endpoints (recipient_id, kind, value_raw, value_norm, is_valid, source)
        SELECT (SELECT id FROM target LIMIT 1), 'email', $4, $5, true, $15 WHERE $5::text IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM msg_endpoints WHERE recipient_id = (SELECT id FROM target LIMIT 1) AND kind = 'email')
        ON CONFLICT (kind, value_norm) DO NOTHING
      ), e2 AS (
        INSERT INTO msg_endpoints (recipient_id, kind, value_raw, value_norm, is_valid, source)
        SELECT (SELECT id FROM target LIMIT 1), 'phone', $6, $7, true, $15 WHERE $7::text IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM msg_endpoints WHERE recipient_id = (SELECT id FROM target LIMIT 1) AND kind = 'phone')
        ON CONFLICT (kind, value_norm) DO NOTHING
      ), mem AS (
        INSERT INTO msg_audience_members (audience_id, recipient_id, import_job_id, added_by)
        SELECT $3, id, $1, $14 FROM target ON CONFLICT DO NOTHING
      ), cons AS (
        INSERT INTO msg_consents (recipient_id, channel, topic, status, source, evidence, created_by)
        SELECT t.id, c.channel, 'marketing', c.status, c.source, c.evidence, $14
        FROM target t, jsonb_to_recordset($18::jsonb) AS c(channel text, status text, source text, evidence text)
        WHERE NOT EXISTS (SELECT 1 FROM (SELECT status FROM msg_consents x WHERE x.recipient_id = t.id AND x.channel = c.channel AND x.topic = 'marketing'
                                         ORDER BY x.created_at DESC, x.id DESC LIMIT 1) last WHERE last.status = 'revoked')
      )
      UPDATE msg_import_rows SET applied = true, recipient_id = (SELECT id FROM target LIMIT 1) WHERE job_id = $1 AND row_no = $8`,
      [jobId, r.recipient_id, job.audience_id, n.email_raw, email, n.phone_raw, phone, r.row_no,
        n.full_name, n.country, n.city, n.org, n.tags, actor, job.file_name ? `ייבוא: ${job.file_name}` : "ייבוא",
        link.lead_id || null, link.contact_id || null, consentJson]))
  }
  if (stmts.length) {
    if (db.transaction) await db.transaction(stmts)
    else for (const s of stmts) await s
  }
  const [rem] = await db`SELECT count(*)::int AS n FROM msg_import_rows WHERE job_id = ${jobId} AND NOT applied AND outcome IN ('new','existing','suppressed')`
  if (rem.n === 0) {
    const [res] = await db`SELECT count(*) FILTER (WHERE applied)::int AS applied FROM msg_import_rows WHERE job_id = ${jobId}`
    await db`UPDATE msg_import_jobs SET status = 'done', finished_at = COALESCE(finished_at, now()),
      counts = counts || jsonb_build_object('applied', ${res.applied}::int) WHERE id = ${jobId}`
  }
  return { applied: rows.length, remaining: rem.n }
}

// ── delivery worker ───────────────────────────────────────────────
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504])

function fromHeader(env: Env, fromName?: string) {
  const from = env.MESSAGING_EMAIL_FROM || ""
  const addr = from.includes("<") ? from.replace(/^.*<|>.*$/g, "") : from
  return fromName ? `${fromName.replace(/[<>"]/g, "")} <${addr}>` : from
}

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40)
}

/**
 * One worker pass: releases due scheduled campaigns, claims a bounded
 * batch of queued deliveries (FOR UPDATE SKIP LOCKED, so two workers never
 * take the same row), re-checks opt-outs right before handing anything to
 * the provider, sends, and records the outcome per address. A request that
 * times out is marked "unknown" — never resent automatically.
 */
export async function runWorker(db: Db, env: Env, opts: { budgetMs?: number; batch?: number; campaignId?: number } = {}) {
  const started = Date.now()
  const budget = opts.budgetMs ?? 20000
  const batch = Math.min(opts.batch ?? 100, 100)
  const status = channelStatus(env)
  const log = { released: 0, claimed: 0, accepted: 0, failed: 0, skipped: 0, unknown: 0, retried: 0, finished: 0 }

  // A campaign is only picked up once its recipient snapshot exists (written
  // right after approval), so a worker pass can never "finish" it empty.
  log.released = (await db`UPDATE msg_campaigns SET status = 'queued', updated_at = now()
    WHERE status = 'scheduled' AND scheduled_at <= now() AND snapshot_at IS NOT NULL RETURNING id`).length
  log.unknown += (await db`UPDATE msg_campaign_recipients SET status = 'unknown', last_error = 'הבקשה לספק לא הסתיימה — לא נשלח שוב אוטומטית', updated_at = now()
    WHERE status = 'sending' AND locked_until < now() RETURNING id`).length

  // An unsubscribe through the old newsletter links must stop campaign mail too.
  const [nl] = await db`SELECT to_regclass('newsletter_subscribers') IS NOT NULL AS ok`
  const hasNewsletter = !!nl?.ok
  const campaigns = opts.campaignId
    ? await db`SELECT * FROM msg_campaigns WHERE id = ${opts.campaignId} AND status IN ('queued','sending') AND snapshot_at IS NOT NULL`
    : await db`SELECT * FROM msg_campaigns WHERE status IN ('queued','sending') AND snapshot_at IS NOT NULL ORDER BY approved_at NULLS LAST, id LIMIT 5`

  for (const c of campaigns) {
    const ch = c.channel as Channel
    if (!status[ch].connected) {
      await db`UPDATE msg_campaigns SET last_error = ${"הערוץ אינו מחובר — המסירה ממתינה"}, updated_at = now() WHERE id = ${c.id}`
      continue
    }
    while (Date.now() - started < budget) {
      const claimed = await db`UPDATE msg_campaign_recipients SET status = 'sending', locked_until = now() + interval '5 minutes',
          attempts = attempts + 1, updated_at = now()
        WHERE id IN (SELECT id FROM msg_campaign_recipients WHERE campaign_id = ${c.id} AND status = 'queued' AND next_attempt_at <= now()
                     ORDER BY id LIMIT ${batch} FOR UPDATE SKIP LOCKED)
        RETURNING id, recipient_id, address, attempts`
      if (!claimed.length) break
      log.claimed += claimed.length
      if (c.status !== "sending") { await db`UPDATE msg_campaigns SET status = 'sending', updated_at = now() WHERE id = ${c.id} AND status = 'queued'`; c.status = "sending" }

      // Re-check opt-outs and consent at the last moment.
      const ids = claimed.map(r => Number(r.id))
      const blocked = await db.query(`
        SELECT cr.id FROM msg_campaign_recipients cr
        WHERE cr.id = ANY($1::int[]) AND (
          EXISTS (SELECT 1 FROM msg_suppressions s WHERE s.value_norm = cr.address AND s.channel IN ($2, 'all'))
          OR EXISTS (SELECT 1 FROM msg_suppressions s JOIN msg_endpoints e ON e.value_norm = s.value_norm WHERE e.recipient_id = cr.recipient_id AND s.channel = 'all')
          OR COALESCE((SELECT c2.status FROM msg_consents c2 WHERE c2.recipient_id = cr.recipient_id AND c2.channel = $2 AND c2.topic = 'marketing'
                       ORDER BY c2.created_at DESC, c2.id DESC LIMIT 1), 'unknown') <> 'granted'
          ${hasNewsletter && ch === "email" ? `OR EXISTS (SELECT 1 FROM msg_recipients r JOIN newsletter_subscribers s ON s.id = r.newsletter_subscriber_id
                     WHERE r.id = cr.recipient_id AND s.status <> 'active' AND lower(btrim(s.email)) = cr.address)` : ""})`, [ids, ch])
      const blockedSet = new Set(blocked.map(b => Number(b.id)))
      if (blockedSet.size) {
        await db`UPDATE msg_campaign_recipients SET status = 'skipped', last_error = 'הוסר או שההרשאה בוטלה לפני השליחה', locked_until = NULL, updated_at = now() WHERE id = ANY(${[...blockedSet]}::int[])`
        log.skipped += blockedSet.size
      }
      const toSend = claimed.filter(r => !blockedSet.has(Number(r.id)))
      if (!toSend.length) continue

      if (ch === "email") await deliverEmailBatch(db, env, c, toSend, log)
      else if (ch === "sms") await deliverSmsBatch(db, env, c, toSend, log)
      else {
        // The WhatsApp adapter is deliberately not implemented until an official account is connected.
        await db`UPDATE msg_campaign_recipients SET status = 'queued', locked_until = NULL, attempts = attempts - 1 WHERE id = ANY(${toSend.map(r => Number(r.id))}::int[])`
        break
      }
    }
    await finishIfDone(db, c, env)
    log.finished++
  }
  return log
}

async function deliverEmailBatch(db: Db, env: Env, c: any, rows: any[], log: Record<string, number>) {
  const content: EmailContent = { ...EMPTY_EMAIL, ...(c.approved_content || c.content || {}) }
  const appUrl = (env.NEXTAUTH_URL || "").replace(/\/$/, "")
  const baseHtml = renderEmailHtml(content, { orgAddress: env.NEWSLETTER_ORG_ADDRESS || "", logoUrl: appUrl ? `${appUrl}/netivim-logo-white.png` : undefined })
  const text = plainTextFromEmail(content)
  const people = await db`SELECT id, full_name, manage_token FROM msg_recipients WHERE id = ANY(${rows.map(r => Number(r.recipient_id))}::int[])`
  const byId = new Map(people.map(p => [Number(p.id), p]))
  const payload = rows.map(r => {
    const p = byId.get(Number(r.recipient_id)) || {}
    const unsub = `${appUrl}/api/messaging/unsubscribe?t=${p.manage_token}&c=${c.id}`
    const personal = { first_name: String(p.full_name || "").trim().split(/\s+/)[0] || "", full_name: p.full_name || "", unsubscribe_url: unsub, preferences_url: `${appUrl}/newsletter/preferences`,
      callback_url: `${appUrl}/api/messaging/callback?t=${p.manage_token}&c=${c.id}` }
    return {
      from: fromHeader(env, content.from_name),
      to: [r.address],
      subject: personalizeText(content.subject, personal),
      html: personalizeHtml(baseHtml, personal),
      ...(text ? { text: personalizeText(text, personal) } : {}),
      ...(content.reply_to ? { reply_to: content.reply_to } : {}),
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      tags: [{ name: "campaign", value: String(c.id) }],
    }
  })
  const ids = rows.map(r => Number(r.id))
  const key = `msg-${c.id}-${await sha(ids.join(","))}`
  const base = env.RESEND_API_BASE || "https://api.resend.com"
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  let res: Response
  try {
    res = await fetch(`${base}/emails/batch`, {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${env.MESSAGING_RESEND_API_KEY || env.RESEND_NEWSLETTER_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(payload),
    })
  } catch (e: any) {
    clearTimeout(timer)
    await db`UPDATE msg_campaign_recipients SET status = 'unknown', locked_until = NULL, last_error = ${"אין תשובה מהספק: " + String(e?.name || e).slice(0, 120)}, updated_at = now() WHERE id = ANY(${ids}::int[])`
    log.unknown += ids.length
    return
  }
  clearTimeout(timer)
  let body: any = null
  try { body = await res.json() } catch {}
  if (res.ok && Array.isArray(body?.data)) {
    const pids = ids.map((_, i) => body.data[i]?.id || null)
    await db.query(`UPDATE msg_campaign_recipients cr SET status = 'accepted', provider_id = v.pid, sent_at = now(), locked_until = NULL, last_error = '', updated_at = now()
      FROM unnest($1::int[], $2::text[]) AS v(id, pid) WHERE cr.id = v.id`, [ids, pids])
    log.accepted += ids.length
  } else if (RETRYABLE.has(res.status)) {
    const msg = `הספק החזיר ${res.status}: ${String(body?.message || "").slice(0, 160)}`
    const r = await db`UPDATE msg_campaign_recipients SET
        status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
        next_attempt_at = now() + (interval '2 minutes' * attempts), locked_until = NULL, last_error = ${msg}, updated_at = now()
      WHERE id = ANY(${ids}::int[]) RETURNING status`
    log.retried += r.filter(x => x.status === "queued").length
    log.failed += r.filter(x => x.status === "failed").length
  } else {
    const msg = `הספק דחה את הבקשה (${res.status}): ${String(body?.message || body?.name || "").slice(0, 160)}`
    await db`UPDATE msg_campaign_recipients SET status = 'failed', locked_until = NULL, last_error = ${msg}, updated_at = now() WHERE id = ANY(${ids}::int[])`
    log.failed += ids.length
  }
}

/**
 * SMS through 019. One request per claimed batch; our delivery-row id is the
 * external id, so 019's delivery reports map straight back to the row.
 */
async function deliverSmsBatch(db: Db, env: Env, c: any, rows: any[], log: Record<string, number>) {
  const content = { ...EMPTY_SMS, ...(c.approved_content || c.content || {}) }
  const appUrl = (env.NEXTAUTH_URL || "").replace(/\/$/, "")
  const people = await db`SELECT id, full_name, manage_token FROM msg_recipients WHERE id = ANY(${rows.map(r => Number(r.recipient_id))}::int[])`
  const byId = new Map(people.map(p => [Number(p.id), p]))
  const items: { id: string; phone: string; text: string }[] = []
  const notLocal: number[] = []
  for (const r of rows) {
    const phone = toLocalIL(r.address)
    if (!phone) { notLocal.push(Number(r.id)); continue }
    const p = byId.get(Number(r.recipient_id)) || {}
    const text = renderSms(content, { first_name: String(p.full_name || "").trim().split(/\s+/)[0] || "", full_name: p.full_name || "",
      unsubscribe_url: `${appUrl}/api/messaging/unsubscribe?t=${p.manage_token}&c=${c.id}` })
    items.push({ id: String(r.id), phone, text })
  }
  if (notLocal.length) {
    await db`UPDATE msg_campaign_recipients SET status = 'failed', locked_until = NULL, last_error = 'מספר שאינו ישראלי — לא נתמך כרגע', updated_at = now() WHERE id = ANY(${notLocal}::int[])`
    log.failed += notLocal.length
  }
  if (!items.length) return
  const ids = items.map(i => Number(i.id))
  const res = await send019(env, items, c.name || `campaign ${c.id}`)
  if (res.ok) {
    await db`UPDATE msg_campaign_recipients SET status = 'accepted', provider_id = ${res.shipment_id}, sent_at = now(), locked_until = NULL, last_error = '', updated_at = now() WHERE id = ANY(${ids}::int[])`
    log.accepted += ids.length
  } else if (res.timeout) {
    await db`UPDATE msg_campaign_recipients SET status = 'unknown', locked_until = NULL, last_error = ${errLabel(res)}, updated_at = now() WHERE id = ANY(${ids}::int[])`
    log.unknown += ids.length
  } else if (res.http != null && RETRYABLE.has(res.http)) {
    const r = await db`UPDATE msg_campaign_recipients SET
        status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
        next_attempt_at = now() + (interval '2 minutes' * attempts), locked_until = NULL, last_error = ${errLabel(res)}, updated_at = now()
      WHERE id = ANY(${ids}::int[]) RETURNING status`
    log.retried += r.filter(x => x.status === "queued").length
    log.failed += r.filter(x => x.status === "failed").length
  } else {
    await db`UPDATE msg_campaign_recipients SET status = 'failed', locked_until = NULL, last_error = ${errLabel(res)}, updated_at = now() WHERE id = ANY(${ids}::int[])`
    log.failed += ids.length
  }
}

async function finishIfDone(db: Db, c: any, env: Env) {
  const [left] = await db`SELECT count(*) FILTER (WHERE status IN ('queued','sending'))::int AS open,
      count(*) FILTER (WHERE status IN ('failed','unknown'))::int AS bad, count(*)::int AS total
    FROM msg_campaign_recipients WHERE campaign_id = ${c.id}`
  if (left.open > 0) return
  const done = await db`UPDATE msg_campaigns SET status = ${left.bad > 0 ? "partial" : "sent"}, completed_at = now(), last_error = '', updated_at = now()
    WHERE id = ${c.id} AND status IN ('queued','sending') RETURNING *`
  if (!done.length) return
  // Public archive (existing newsletter archive): a generic copy only —
  // no names, tokens or personal unsubscribe links.
  const camp = done[0]
  const content: EmailContent = { ...EMPTY_EMAIL, ...(camp.approved_content || {}) }
  if (camp.channel === "email" && content.archive && !camp.archive_issue_id && left.total > 0) {
    const [t] = await db`SELECT to_regclass('newsletter_issues') IS NOT NULL AS ok`
    if (!t?.ok) return
    const appUrl = (env.NEXTAUTH_URL || "").replace(/\/$/, "")
    const html = personalizeHtml(renderEmailHtml(content, { orgAddress: env.NEWSLETTER_ORG_ADDRESS || "", logoUrl: appUrl ? `${appUrl}/netivim-logo-white.png` : undefined }), { unsubscribe_url: `${appUrl}/newsletter/preferences`, preferences_url: `${appUrl}/newsletter/preferences` })
    const [issue] = await db`INSERT INTO newsletter_issues (subject, intro, blocks, closing, html, status, sent_at, recipients, created_by)
      VALUES (${content.subject}, ${content.mode === "html" ? "[HTML מותאם אישית]" : content.intro}, ${JSON.stringify([])}, ${content.closing}, ${html}, 'sent', now(), ${left.total}, ${"מרכז דיוורים #" + camp.id})
      RETURNING id`
    await db`UPDATE msg_campaigns SET archive_issue_id = ${issue.id} WHERE id = ${camp.id}`
  }
}

export { contentProblems, renderSms }
