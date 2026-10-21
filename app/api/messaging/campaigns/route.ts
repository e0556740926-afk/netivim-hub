import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { EMPTY_EMAIL, EMPTY_SMS, EMPTY_WHATSAPP } from "@/lib/messaging/render"

export async function GET(req: NextRequest) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const ch = req.nextUrl.searchParams.get("channel") || ""
  const st = req.nextUrl.searchParams.get("status") || ""
  const rows = await db`SELECT c.id, c.channel, c.name, c.goal, c.status, c.audience_ids, c.scheduled_at, c.approved_at, c.completed_at, c.created_by, c.created_at, c.updated_at, c.stats,
      (SELECT string_agg(a.name, ', ') FROM msg_audiences a WHERE a.id = ANY(c.audience_ids)) AS audience_names,
      (SELECT count(*)::int FROM msg_campaign_recipients r WHERE r.campaign_id = c.id) AS queued_total,
      (SELECT count(*)::int FROM msg_campaign_recipients r WHERE r.campaign_id = c.id AND r.status IN ('accepted','delivered')) AS accepted,
      (SELECT count(*)::int FROM msg_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'delivered') AS delivered,
      (SELECT count(*)::int FROM msg_campaign_recipients r WHERE r.campaign_id = c.id AND r.status IN ('failed','unknown')) AS failed
    FROM msg_campaigns c WHERE (${ch} = '' OR c.channel = ${ch}) AND (${st} = '' OR c.status = ${st})
    ORDER BY COALESCE(c.scheduled_at, c.updated_at) DESC LIMIT 200`
  return NextResponse.json({ campaigns: rows, can: u.can })
}

export async function POST(req: NextRequest) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const d = await req.json().catch(() => ({}))
  const channel = String(d.channel || "")
  if (!["email", "sms", "whatsapp"].includes(channel)) return bad("יש לבחור ערוץ")
  const name = String(d.name || "").trim().slice(0, 160) || (channel === "email" ? "ניוזלטר חדש" : channel === "sms" ? "SMS חדש" : "WhatsApp חדש")
  let content: any = channel === "email" ? { ...EMPTY_EMAIL } : channel === "sms" ? { ...EMPTY_SMS } : { ...EMPTY_WHATSAPP }
  let audienceIds: number[] = []
  let goal = String(d.goal || "").slice(0, 300)
  if (d.duplicate_of) {
    const [src] = await db`SELECT * FROM msg_campaigns WHERE id = ${Number(d.duplicate_of)}`
    if (src) {
      audienceIds = src.audience_ids || []
      goal = goal || src.goal
      // Same channel → copy content; other channel → keep goal & audience only (no HTML→text conversion).
      if (src.channel === channel) content = { ...content, ...(src.content || {}) }
    }
  }
  const [c] = await db`INSERT INTO msg_campaigns (channel, name, goal, content, audience_ids, created_by)
    VALUES (${channel}, ${name}, ${goal}, ${JSON.stringify(content)}::jsonb, ${audienceIds}::int[], ${u.name}) RETURNING id`
  await activity(u.name, "campaign.create", "campaign", c.id, `${channel}: ${name}`)
  return NextResponse.json({ id: c.id }, { status: 201 })
}
