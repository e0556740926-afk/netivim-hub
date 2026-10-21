import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"

/** A scheduled campaign goes back to draft (its frozen snapshot is discarded; nothing was sent). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "send"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const r = await db`UPDATE msg_campaigns SET status = 'draft', approved_revision = NULL, approved_content = NULL, approved_by = NULL, approved_at = NULL,
      scheduled_at = NULL, snapshot_at = NULL, stats = '{}'::jsonb, updated_at = now()
    WHERE id = ${id} AND status = 'scheduled' RETURNING name`
  if (!r.length) return bad("אפשר לבטל תזמון רק לקמפיין שעדיין לא התחיל", 409)
  await db`DELETE FROM msg_campaign_recipients WHERE campaign_id = ${id} AND status = 'queued'`
  await activity(u.name, "campaign.unschedule", "campaign", id, r[0].name)
  return NextResponse.json({ ok: true })
}
