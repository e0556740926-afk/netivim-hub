import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"
import { upsertCallback } from "@/lib/messaging/inbound"

/** Close an unmatched reply, or turn it into a callback ("לחזור אליו"). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const d = await req.json().catch(() => ({}))
  const [m] = await db`SELECT * FROM msg_inbound WHERE id = ${id}`
  if (!m) return bad("ההודעה לא נמצאה", 404)
  if (d.to_callback) {
    await upsertCallback(db, { campaign_id: m.campaign_id, campaign_recipient_id: m.campaign_recipient_id, recipient_id: m.recipient_id, channel: m.channel, phone: m.from_norm, request_text: `השיב: ${String(m.body).slice(0, 300)}` })
  }
  const [r] = await db`UPDATE msg_inbound SET handled = true, handled_by = ${u.name}, action = CASE WHEN ${!!d.to_callback} THEN 'callback' ELSE action END WHERE id = ${id} RETURNING *`
  return NextResponse.json({ inbound: r })
}
