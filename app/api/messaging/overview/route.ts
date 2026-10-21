import { NextRequest, NextResponse } from "next/server"
import { db, guard } from "@/lib/messaging/server"
import { channelStatus, syncNewsletter } from "@/lib/messaging/core"

export async function GET(req: NextRequest) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  await syncNewsletter(db).catch(e => console.error("[messaging] newsletter sync", e))
  const [counts] = await db`SELECT
      (SELECT count(*)::int FROM msg_recipients) AS recipients,
      (SELECT count(*)::int FROM msg_audiences WHERE NOT archived) AS audiences,
      (SELECT count(*)::int FROM msg_campaigns WHERE status = 'draft') AS drafts,
      (SELECT count(*)::int FROM msg_campaigns WHERE status = 'scheduled') AS scheduled,
      (SELECT count(*)::int FROM msg_campaigns WHERE status IN ('queued','sending')) AS sending,
      (SELECT count(DISTINCT value_norm)::int FROM msg_suppressions) AS suppressed`
  const campaigns = await db`SELECT c.id, c.channel, c.name, c.status, c.scheduled_at, c.completed_at, c.updated_at, c.stats,
      (SELECT count(*)::int FROM msg_campaign_recipients r WHERE r.campaign_id = c.id) AS queued_total,
      (SELECT count(*)::int FROM msg_campaign_recipients r WHERE r.campaign_id = c.id AND r.status IN ('accepted','delivered')) AS accepted
    FROM msg_campaigns c ORDER BY c.updated_at DESC LIMIT 8`
  const imports = await db`SELECT id, file_name, status, total_rows, counts, created_by, created_at FROM msg_import_jobs ORDER BY id DESC LIMIT 5`
  let newsletter: any = null
  try {
    const [n] = await db`SELECT (SELECT count(*)::int FROM newsletter_subscribers WHERE status = 'active') AS active,
      (SELECT count(*)::int FROM newsletter_issues WHERE status IN ('draft','scheduled')) AS open_issues,
      (SELECT max(sent_at) FROM newsletter_issues WHERE status = 'sent') AS last_sent`
    newsletter = n
  } catch {}
  return NextResponse.json({ counts, campaigns, imports, newsletter, connections: channelStatus(process.env), can: u.can })
}
