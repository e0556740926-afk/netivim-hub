import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { channelStatus, computeEligibility, contentProblems, runWorker, snapshotCampaign, syncNewsletter } from "@/lib/messaging/core"

/**
 * Final approval by an authorised user: freezes the content revision and
 * the recipient snapshot (server-side, full audience), then queues or
 * schedules delivery. A second click, a retried request or a stale tab
 * can't approve twice — the update only matches a draft at that revision.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "send"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const d = await req.json().catch(() => ({}))
  const [c] = await db`SELECT * FROM msg_campaigns WHERE id = ${id}`
  if (!c) return bad("הקמפיין לא נמצא", 404)
  if (c.status !== "draft") return bad("הקמפיין כבר אושר", 409)
  if (Number(d.revision) !== Number(c.revision)) return bad("התוכן השתנה מאז שנפתח מסך האישור. בדקו את הגרסה העדכנית ואשרו שוב.", 409)
  const conn = channelStatus(process.env)[c.channel as "email"]
  if (!conn.connected) return bad(`ערוץ ${c.channel === "email" ? "המייל" : c.channel === "sms" ? "SMS" : "WhatsApp"} אינו מחובר — אפשר לשמור טיוטה, אבל לא לשלוח.`, 409, { missing: conn.missing })
  const problems = contentProblems(c.channel, c.content || {})
  if (problems.length) return bad(problems.join(" · "))
  if (!(c.audience_ids || []).length) return bad("לא נבחר קהל")
  let when: Date | null = null
  if (d.mode === "schedule") {
    when = new Date(d.scheduled_at)
    if (isNaN(+when) || +when < Date.now() + 60_000) return bad("יש לבחור מועד עתידי לתזמון")
  }
  await syncNewsletter(db).catch(() => {})
  const elig = await computeEligibility(db, c.channel, c.audience_ids, c.exclude_audience_ids || [])
  if (!elig.eligible) return bad("אין בקהל שנבחר נמענים כשירים לערוץ הזה", 409, { eligibility: elig })
  const [ok] = await db`UPDATE msg_campaigns SET status = ${when ? "scheduled" : "queued"}, approved_revision = revision, approved_content = content,
      approved_by = ${u.name}, approved_at = now(), scheduled_at = ${when ? when.toISOString() : new Date().toISOString()},
      stats = ${JSON.stringify(elig)}::jsonb, last_error = '', updated_at = now()
    WHERE id = ${id} AND status = 'draft' AND revision = ${c.revision} RETURNING *`
  if (!ok) return bad("הקמפיין כבר אושר או השתנה", 409)
  try { await snapshotCampaign(db, ok) }
  catch (e) {
    // Roll back to a draft so nothing half-approved stays in the queue.
    await db`DELETE FROM msg_campaign_recipients WHERE campaign_id = ${id}`
    await db`UPDATE msg_campaigns SET status = 'draft', approved_revision = NULL, approved_content = NULL, approved_at = NULL, approved_by = NULL, snapshot_at = NULL, updated_at = now() WHERE id = ${id}`
    console.error("[messaging] snapshot failed", e)
    return bad("שמירת רשימת הנמענים נכשלה — הקמפיין חזר לטיוטה. נסו שוב.", 500)
  }
  await activity(u.name, when ? "campaign.schedule" : "campaign.approve", "campaign", id, `${ok.name} · גרסה ${ok.approved_revision} · ${elig.eligible} נמענים${when ? " · " + when.toISOString() : ""}`)
  // Start right away for "send now"; the scheduled worker continues from here.
  if (!when) await runWorker(db, process.env, { campaignId: id, budgetMs: 7000 }).catch(e => console.error("[messaging] first worker pass", e))
  const [fresh] = await db`SELECT * FROM msg_campaigns WHERE id = ${id}`
  return NextResponse.json({ campaign: fresh, eligibility: elig })
}
