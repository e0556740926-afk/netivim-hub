import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { classifyImport } from "@/lib/messaging/core"

/**
 * Builds an import job from records already in the system (partners /
 * parents who inquired), instead of a file. Same review-and-confirm flow
 * as a file import; recipients are only *linked* to those records — no
 * lead, contact or owner is changed. Replaces the old ad-hoc mailer that
 * sent straight from a 500-row screen list.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [a] = await db`SELECT id, name, system_key FROM msg_audiences WHERE id = ${id} AND NOT archived`
  if (!a) return bad("הקהל לא נמצא", 404)
  if (a.system_key) return bad("אי אפשר להוסיף ידנית לקהל מערכת", 409)
  const d = await req.json().catch(() => ({}))
  const f = d.filters || {}
  let rows: any[] = []
  let label = ""
  if (d.source === "contacts") {
    label = "מערכת: אנשי קשר ושותפים"
    rows = await db.query(`SELECT id, name, phone, email, org FROM contacts WHERE deleted_at IS NULL
      AND ($1 = '' OR type = $1) AND ($2 = '' OR owner = $2) ORDER BY id LIMIT 10000`, [String(f.type || ""), String(f.owner || "")])
    rows = rows.map(r => ({ raw: { full_name: r.name, email: r.email, phone: r.phone, org: r.org, list_source: "אנשי קשר" }, link: { contact_id: r.id } }))
  } else if (d.source === "parents") {
    label = "מערכת: הורים שפנו"
    rows = await db.query(`SELECT id, name, phone, email, city FROM leads WHERE deleted_at IS NULL AND is_parent = true
      AND ($1 = '' OR city = $1) ORDER BY id LIMIT 10000`, [String(f.city || "")])
    rows = rows.map(r => ({ raw: { full_name: r.name, email: r.email, phone: r.phone, city: r.city, list_source: "הורים שפנו" }, link: { lead_id: r.id } }))
  } else return bad("מקור לא מוכר")
  if (!rows.length) return bad("לא נמצאו רשומות תואמות", 404)
  const options: any = {}
  if (d.consent_basis?.source && Array.isArray(d.consent_basis.channels) && d.consent_basis.channels.length) options.consent_basis = { channels: d.consent_basis.channels.filter((c: string) => ["email", "sms", "whatsapp"].includes(c)), source: String(d.consent_basis.source).slice(0, 300) }
  const [job] = await db`INSERT INTO msg_import_jobs (file_name, audience_id, options, created_by, headers, mapping)
    VALUES (${label}, ${id}, ${JSON.stringify(options)}::jsonb, ${u.name}, '[]'::jsonb, '{}'::jsonb) RETURNING id`
  for (let i = 0; i < rows.length; i += 1000) {
    const part = rows.slice(i, i + 1000)
    await db.query(`INSERT INTO msg_import_rows (job_id, row_no, data, outcome) SELECT $1, n, d, 'invalid' FROM unnest($2::int[], $3::jsonb[]) AS v(n, d)`,
      [job.id, part.map((_, k) => i + k + 2), part.map(r => JSON.stringify(r))])
  }
  const result = await classifyImport(db, job.id, "IL")
  await activity(u.name, "import.crm", "import", job.id, `${label} → ${a.name} (${rows.length})`)
  return NextResponse.json({ job_id: job.id, ...result })
}
