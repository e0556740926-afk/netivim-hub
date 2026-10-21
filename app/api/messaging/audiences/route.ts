import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { syncNewsletter } from "@/lib/messaging/core"

/** Audiences with unique people and per-channel eligibility (channels overlap, never summed). */
export async function GET(req: NextRequest) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  await syncNewsletter(db).catch(e => console.error("[messaging] newsletter sync", e))
  const rows = await db`
    WITH latest AS (
      SELECT DISTINCT ON (recipient_id, channel) recipient_id, channel, status FROM msg_consents WHERE topic = 'marketing'
      ORDER BY recipient_id, channel, created_at DESC, id DESC
    ), per AS (
      SELECT m.audience_id, m.recipient_id,
        EXISTS (SELECT 1 FROM msg_endpoints e WHERE e.recipient_id = m.recipient_id AND e.kind = 'email' AND e.is_valid
                AND NOT EXISTS (SELECT 1 FROM msg_suppressions s WHERE s.value_norm = e.value_norm AND s.channel IN ('email','all'))
                AND EXISTS (SELECT 1 FROM latest l WHERE l.recipient_id = m.recipient_id AND l.channel = 'email' AND l.status = 'granted')) AS email_ok,
        EXISTS (SELECT 1 FROM msg_endpoints e WHERE e.recipient_id = m.recipient_id AND e.kind = 'phone' AND e.is_valid
                AND NOT EXISTS (SELECT 1 FROM msg_suppressions s WHERE s.value_norm = e.value_norm AND s.channel IN ('sms','all'))
                AND EXISTS (SELECT 1 FROM latest l WHERE l.recipient_id = m.recipient_id AND l.channel = 'sms' AND l.status = 'granted')) AS sms_ok,
        EXISTS (SELECT 1 FROM msg_endpoints e WHERE e.recipient_id = m.recipient_id AND e.kind = 'phone' AND e.is_valid
                AND NOT EXISTS (SELECT 1 FROM msg_suppressions s WHERE s.value_norm = e.value_norm AND s.channel IN ('whatsapp','all'))
                AND EXISTS (SELECT 1 FROM latest l WHERE l.recipient_id = m.recipient_id AND l.channel = 'whatsapp' AND l.status = 'granted')) AS wa_ok
      FROM msg_audience_members m
    )
    SELECT a.id, a.name, a.description, a.owner, a.source, a.system_key, a.created_at, a.created_by,
      count(p.recipient_id)::int AS people,
      count(*) FILTER (WHERE p.email_ok)::int AS email_ok,
      count(*) FILTER (WHERE p.sms_ok)::int AS sms_ok,
      count(*) FILTER (WHERE p.wa_ok)::int AS wa_ok
    FROM msg_audiences a LEFT JOIN per p ON p.audience_id = a.id
    WHERE NOT a.archived GROUP BY a.id ORDER BY a.system_key NULLS LAST, a.name`
  return NextResponse.json({ audiences: rows, can: u.can })
}

export async function POST(req: NextRequest) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const d = await req.json().catch(() => ({}))
  const name = String(d.name || "").trim().replace(/\s+/g, " ")
  if (!name || name.length > 120) return bad("יש להזין שם לקהל (עד 120 תווים)")
  try {
    const [a] = await db`INSERT INTO msg_audiences (name, description, owner, source, created_by)
      VALUES (${name}, ${String(d.description || "").slice(0, 500)}, ${String(d.owner || u.name).slice(0, 120)}, ${String(d.source || "").slice(0, 200)}, ${u.name}) RETURNING *`
    await activity(u.name, "audience.create", "audience", a.id, name)
    return NextResponse.json({ audience: a }, { status: 201 })
  } catch (e: any) {
    if (e?.code === "23505" || /duplicate key/.test(String(e?.message))) return bad("כבר קיים קהל בשם הזה", 409)
    throw e
  }
}

export async function PATCH(req: NextRequest) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const d = await req.json().catch(() => ({}))
  const id = Number(d.id)
  const [a] = await db`SELECT * FROM msg_audiences WHERE id = ${id}`
  if (!a) return bad("הקהל לא נמצא", 404)
  if (a.system_key && (d.archived || d.name)) return bad("קהל מערכת מתעדכן אוטומטית ואי אפשר לשנות את שמו או להעביר לארכיון", 409)
  const name = d.name !== undefined ? String(d.name).trim().replace(/\s+/g, " ") : a.name
  if (!name) return bad("יש להזין שם לקהל")
  try {
    const [r] = await db`UPDATE msg_audiences SET name = ${name}, description = ${d.description !== undefined ? String(d.description).slice(0, 500) : a.description},
      owner = ${d.owner !== undefined ? String(d.owner).slice(0, 120) : a.owner}, archived = ${d.archived === true} WHERE id = ${id} RETURNING *`
    await activity(u.name, d.archived ? "audience.archive" : "audience.update", "audience", id, name)
    return NextResponse.json({ audience: r })
  } catch (e: any) {
    if (e?.code === "23505" || /duplicate key/.test(String(e?.message))) return bad("כבר קיים קהל בשם הזה", 409)
    throw e
  }
}
