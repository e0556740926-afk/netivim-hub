import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { channelStatus, contentProblems } from "@/lib/messaging/core"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [c] = await db`SELECT * FROM msg_campaigns WHERE id = ${id}`
  if (!c) return bad("הקמפיין לא נמצא", 404)
  const audiences = await db`SELECT id, name, system_key FROM msg_audiences WHERE NOT archived ORDER BY system_key NULLS LAST, name`
  const status = channelStatus(process.env)[c.channel as "email"]
  return NextResponse.json({ campaign: c, audiences, connection: status, problems: contentProblems(c.channel, c.content || {}), can: u.can, me: u.email })
}

/** Drafts only. Every saved change bumps the revision, so an approval always names the exact version it approves. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [c] = await db`SELECT * FROM msg_campaigns WHERE id = ${id}`
  if (!c) return bad("הקמפיין לא נמצא", 404)
  if (c.status !== "draft") return bad("אפשר לערוך רק טיוטה. קמפיין מתוזמן אפשר להחזיר לטיוטה דרך ״ביטול תזמון״.", 409)
  const d = await req.json().catch(() => ({}))
  if (d.revision !== undefined && Number(d.revision) !== Number(c.revision)) return bad("הקמפיין נערך בינתיים במקום אחר. רעננו את העמוד כדי לא לדרוס שינויים.", 409, { revision: c.revision })
  const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n > 0)
  const aud = d.audience_ids !== undefined ? ids(d.audience_ids) : c.audience_ids
  const exc = d.exclude_audience_ids !== undefined ? ids(d.exclude_audience_ids).filter(x => !aud.includes(x)) : c.exclude_audience_ids
  if (aud.length) {
    const found = await db`SELECT count(*)::int AS n FROM msg_audiences WHERE id = ANY(${[...aud, ...exc]}::int[]) AND NOT archived`
    if (found[0].n !== new Set([...aud, ...exc]).size) return bad("אחד הקהלים שנבחרו אינו קיים")
  }
  const content = d.content !== undefined && d.content && typeof d.content === "object" ? d.content : c.content
  const json = JSON.stringify(content)
  if (json.length > 400_000) return bad("התוכן גדול מדי")
  const [r] = await db`UPDATE msg_campaigns SET name = ${d.name !== undefined ? String(d.name).trim().slice(0, 160) || c.name : c.name},
      goal = ${d.goal !== undefined ? String(d.goal).slice(0, 300) : c.goal}, audience_ids = ${aud}::int[], exclude_audience_ids = ${exc}::int[],
      content = ${json}::jsonb, revision = revision + 1, updated_at = now()
    WHERE id = ${id} AND status = 'draft' AND revision = ${c.revision} RETURNING *`
  if (!r) return bad("הקמפיין השתנה בינתיים. רעננו ונסו שוב.", 409)
  return NextResponse.json({ campaign: r, problems: contentProblems(r.channel, r.content || {}) })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const r = await db`DELETE FROM msg_campaigns WHERE id = ${id} AND status = 'draft' AND NOT EXISTS (SELECT 1 FROM msg_campaign_recipients WHERE campaign_id = ${id}) RETURNING name`
  if (!r.length) return bad("אפשר למחוק רק טיוטה שלא נשלחה", 409)
  await activity(u.name, "campaign.delete", "campaign", id, r[0].name)
  return NextResponse.json({ ok: true })
}
