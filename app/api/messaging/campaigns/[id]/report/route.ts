import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"

/** Funnel: selected → eligible → queued → accepted by provider → delivered → action. Missing data is "not available", never 0. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [c] = await db`SELECT id, channel, name, status, stats, approved_revision, approved_by, approved_at, scheduled_at, completed_at, last_error, archive_issue_id FROM msg_campaigns WHERE id = ${id}`
  if (!c) return bad("הקמפיין לא נמצא", 404)
  const [s] = await db`SELECT count(*)::int AS queued_total,
      count(*) FILTER (WHERE status = 'queued')::int AS waiting,
      count(*) FILTER (WHERE status = 'sending')::int AS sending,
      count(*) FILTER (WHERE status IN ('accepted','delivered'))::int AS accepted,
      count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(*) FILTER (WHERE status = 'unknown')::int AS unknown,
      count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      count(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
      count(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked,
      count(*) FILTER (WHERE provider_id IS NOT NULL)::int AS with_provider_id
    FROM msg_campaign_recipients WHERE campaign_id = ${id}`
  const reasons = await db`SELECT last_error AS reason, status, count(*)::int AS n FROM msg_campaign_recipients
    WHERE campaign_id = ${id} AND status IN ('failed','unknown','skipped') GROUP BY last_error, status ORDER BY n DESC LIMIT 10`
  const [unsub] = await db`SELECT count(*)::int AS n FROM msg_suppressions WHERE source = ${"campaign:" + id}`
  const [events] = await db`SELECT count(*)::int AS n FROM msg_provider_events pe JOIN msg_campaign_recipients cr ON cr.id = pe.campaign_recipient_id WHERE cr.campaign_id = ${id}`
  const replies = await db`SELECT COALESCE(reply_key, '') AS key, count(*)::int AS n FROM msg_campaign_recipients
    WHERE campaign_id = ${id} AND replied_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`
  const [cb] = await db`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'new')::int AS open FROM msg_callbacks WHERE campaign_id = ${id}`
  const [inb] = await db`SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT handled)::int AS open FROM msg_inbound WHERE campaign_id = ${id}`
  return NextResponse.json({ campaign: c, funnel: s, reasons, unsubscribes: unsub.n, tracking: events.n > 0,
    replies: { by_key: replies, replied: replies.reduce((a: number, r: any) => a + r.n, 0), callbacks: cb.total, callbacks_open: cb.open, inbound: inb.total, inbound_open: inb.open } })
}
