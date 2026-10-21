import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"

/** Stops what hasn't been handed to the provider yet. Messages already sent can't be recalled. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "send"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const r = await db`UPDATE msg_campaigns SET status = 'stopped', completed_at = now(), updated_at = now()
    WHERE id = ${id} AND status IN ('scheduled','queued','sending') RETURNING name`
  if (!r.length) return bad("הקמפיין אינו בתהליך שליחה", 409)
  const cancelled = await db`UPDATE msg_campaign_recipients SET status = 'cancelled', updated_at = now() WHERE campaign_id = ${id} AND status = 'queued' RETURNING id`
  await activity(u.name, "campaign.stop", "campaign", id, `${r[0].name} · ${cancelled.length} בוטלו לפני שליחה`)
  return NextResponse.json({ cancelled: cancelled.length })
}
