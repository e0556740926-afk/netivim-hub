import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { computeEligibility } from "@/lib/messaging/core"

/** Members (server-side paging + search) with per-channel state and reasons. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [a] = await db`SELECT * FROM msg_audiences WHERE id = ${id}`
  if (!a) return bad("הקהל לא נמצא", 404)
  const q = (req.nextUrl.searchParams.get("q") || "").trim()
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1)
  const size = 50
  const like = `%${q.toLowerCase()}%`
  const members = await db`
    SELECT r.id, r.full_name, r.city, r.org, r.tags, r.lead_id, r.contact_id, r.newsletter_subscriber_id, m.added_at, m.import_job_id,
      (SELECT json_agg(json_build_object('kind', e.kind, 'value', e.value_norm, 'raw', e.value_raw, 'valid', e.is_valid,
        'suppressed', (SELECT string_agg(DISTINCT s.reason || ':' || s.channel, ',') FROM msg_suppressions s WHERE s.value_norm = e.value_norm)))
       FROM msg_endpoints e WHERE e.recipient_id = r.id) AS endpoints,
      (SELECT json_object_agg(x.channel, x.status) FROM (SELECT DISTINCT ON (channel) channel, status FROM msg_consents c
        WHERE c.recipient_id = r.id AND c.topic = 'marketing' ORDER BY channel, created_at DESC, id DESC) x) AS consents,
      count(*) OVER()::int AS total
    FROM msg_audience_members m JOIN msg_recipients r ON r.id = m.recipient_id
    WHERE m.audience_id = ${id} AND (${q} = '' OR lower(r.full_name) LIKE ${like}
      OR EXISTS (SELECT 1 FROM msg_endpoints e WHERE e.recipient_id = r.id AND (e.value_norm LIKE ${like} OR e.value_raw LIKE ${like})))
    ORDER BY r.full_name, r.id LIMIT ${size} OFFSET ${(page - 1) * size}`
  const [email, sms, whatsapp] = await Promise.all((["email", "sms", "whatsapp"] as const).map(ch => computeEligibility(db, ch, [id], [])))
  const imports = await db`SELECT id, file_name, status, total_rows, counts, created_by, created_at, finished_at FROM msg_import_jobs WHERE audience_id = ${id} ORDER BY id DESC LIMIT 20`
  return NextResponse.json({ audience: a, members, total: members[0]?.total || 0, page, size, eligibility: { email, sms, whatsapp }, imports, can: u.can })
}

/** Removes people from this audience only — never deletes them or their CRM records. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [a] = await db`SELECT system_key FROM msg_audiences WHERE id = ${id}`
  if (!a) return bad("הקהל לא נמצא", 404)
  if (a.system_key) return bad("קהל מערכת מתעדכן אוטומטית; הסרה נעשית דרך רשימת הניוזלטר", 409)
  const d = await req.json().catch(() => ({}))
  const ids = (Array.isArray(d.recipient_ids) ? d.recipient_ids : []).map(Number).filter(Boolean)
  if (!ids.length) return bad("לא נבחרו נמענים")
  const r = await db`DELETE FROM msg_audience_members WHERE audience_id = ${id} AND recipient_id = ANY(${ids}::int[]) RETURNING recipient_id`
  await activity(u.name, "audience.remove_members", "audience", id, `${r.length} הוסרו מהקהל`)
  return NextResponse.json({ removed: r.length })
}
