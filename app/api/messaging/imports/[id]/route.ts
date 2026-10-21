import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"
import { IMPORT_FIELDS } from "@/lib/messaging/normalize"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [job] = await db`SELECT j.*, a.name AS audience_name FROM msg_import_jobs j LEFT JOIN msg_audiences a ON a.id = j.audience_id WHERE j.id = ${id}`
  if (!job) return bad("עבודת הייבוא לא נמצאה", 404)
  const outcome = req.nextUrl.searchParams.get("outcome") || ""
  const sample = await db`SELECT row_no, outcome, reason, applied, data->'norm' AS norm, data->'raw' AS raw FROM msg_import_rows
    WHERE job_id = ${id} AND (${outcome} = '' OR outcome = ${outcome}) ORDER BY row_no LIMIT 100`
  const [prog] = await db`SELECT count(*) FILTER (WHERE applied)::int AS applied,
    count(*) FILTER (WHERE outcome IN ('new','existing','suppressed'))::int AS to_apply FROM msg_import_rows WHERE job_id = ${id}`
  return NextResponse.json({ job, rows: sample, progress: prog })
}

/** Step 2–3: mapping, target audience, default country, consent basis. Locked after validation. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [job] = await db`SELECT * FROM msg_import_jobs WHERE id = ${id}`
  if (!job) return bad("עבודת הייבוא לא נמצאה", 404)
  if (!["uploaded", "validated"].includes(job.status)) return bad("הייבוא כבר אושר ואי אפשר לשנות את הגדרותיו", 409)
  const d = await req.json().catch(() => ({}))
  const valid = new Set(IMPORT_FIELDS.map(f => f.key))
  const mapping: Record<string, string> = {}
  if (d.mapping) for (const [h, f] of Object.entries(d.mapping)) if (f && valid.has(f as any)) mapping[String(h)] = String(f)
  const targets = Object.values(mapping)
  if (d.mapping && new Set(targets).size !== targets.length) return bad("אותו שדה יעד נבחר ליותר מעמודה אחת")
  if (d.mapping && !targets.includes("email") && !targets.includes("phone")) return bad("יש למפות לפחות עמודת מייל או טלפון")
  let audienceId = job.audience_id
  if (d.audience_id !== undefined) {
    const [a] = await db`SELECT id, system_key FROM msg_audiences WHERE id = ${Number(d.audience_id)} AND NOT archived`
    if (!a) return bad("הקהל לא נמצא")
    if (a.system_key) return bad("לא מייבאים לקהל מערכת. בחרו קהל אחר או צרו קהל חדש")
    audienceId = a.id
  }
  const options = { ...(job.options || {}) }
  if (d.consent_basis !== undefined) {
    const cb = d.consent_basis
    if (cb && Array.isArray(cb.channels) && cb.channels.length) {
      if (!String(cb.source || "").trim()) return bad("כדי לסמן הסכמה לכל הקובץ יש לתעד את מקור ההסכמה")
      options.consent_basis = { channels: cb.channels.filter((c: string) => ["email", "sms", "whatsapp"].includes(c)), source: String(cb.source).trim().slice(0, 300) }
    } else delete options.consent_basis
  }
  const [r] = await db`UPDATE msg_import_jobs SET
      mapping = ${JSON.stringify(d.mapping ? mapping : job.mapping)}::jsonb,
      default_country = ${String(d.default_country || job.default_country).slice(0, 2).toUpperCase()},
      audience_id = ${audienceId}, options = ${JSON.stringify(options)}::jsonb,
      status = CASE WHEN ${!!d.mapping} OR ${d.default_country !== undefined} THEN 'uploaded' ELSE status END
    WHERE id = ${id} RETURNING *`
  return NextResponse.json({ job: r })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const r = await db`UPDATE msg_import_jobs SET status = 'cancelled' WHERE id = ${id} AND status IN ('uploaded','validated') RETURNING id`
  if (!r.length) return bad("אפשר לבטל רק ייבוא שטרם אושר", 409)
  await db`DELETE FROM msg_import_rows WHERE job_id = ${id}`
  return NextResponse.json({ ok: true })
}
