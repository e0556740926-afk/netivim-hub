import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { runWorker } from "@/lib/messaging/core"

/**
 * Re-queues only deliveries that failed. "unknown" (the provider may have
 * received it) is retried only when explicitly asked, after checking.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "send"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const d = await req.json().catch(() => ({}))
  const [c] = await db`SELECT status FROM msg_campaigns WHERE id = ${id}`
  if (!c) return bad("הקמפיין לא נמצא", 404)
  if (!["partial", "sent", "sending", "queued"].includes(c.status)) return bad("אין מה לנסות שוב בקמפיין הזה", 409)
  const states = d.include_unknown ? ["failed", "unknown"] : ["failed"]
  const r = await db`UPDATE msg_campaign_recipients SET status = 'queued', attempts = 0, next_attempt_at = now(), last_error = '', updated_at = now()
    WHERE campaign_id = ${id} AND status = ANY(${states}::text[]) RETURNING id`
  if (!r.length) return bad("אין מסירות שנכשלו", 409)
  await db`UPDATE msg_campaigns SET status = 'queued', completed_at = NULL, updated_at = now() WHERE id = ${id}`
  await activity(u.name, "campaign.retry", "campaign", id, `${r.length} מסירות הוחזרו לתור`)
  await runWorker(db, process.env, { campaignId: id, budgetMs: 7000 }).catch(() => {})
  return NextResponse.json({ requeued: r.length })
}
