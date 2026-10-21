import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { applyImportBatch } from "@/lib/messaging/core"

/**
 * Step 5: apply the confirmed rows, one bounded batch per call (the page
 * calls again until nothing remains, showing progress). Safe to call
 * twice or resume after a network drop: applied rows are skipped. Only
 * one import may be applying at a time.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [job] = await db`SELECT status, audience_id, file_name FROM msg_import_jobs WHERE id = ${id}`
  if (!job) return bad("עבודת הייבוא לא נמצאה", 404)
  if (job.status === "done") return NextResponse.json({ applied: 0, remaining: 0, done: true })
  if (!["validated", "importing"].includes(job.status)) return bad("יש לבדוק את הקובץ לפני האישור", 409)
  if (!job.audience_id) return bad("יש לבחור קהל יעד", 400)
  if (job.status === "validated") {
    const busy = await db`SELECT id FROM msg_import_jobs WHERE status = 'importing' AND id <> ${id} AND created_at > now() - interval '1 hour'`
    if (busy.length) return bad("ייבוא אחר נמצא כרגע בתהליך. נסו שוב בעוד רגע.", 409)
    const claimed = await db`UPDATE msg_import_jobs SET status = 'importing' WHERE id = ${id} AND status = 'validated' RETURNING id`
    if (claimed.length) await activity(u.name, "import.confirm", "import", id, job.file_name)
  }
  const r = await applyImportBatch(db, id, u.name)
  return NextResponse.json({ ...r, done: r.remaining === 0 })
}
