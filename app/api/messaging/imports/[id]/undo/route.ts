import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"

/** Removes the audience memberships this import added. Profile updates and consents stay (logged). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [job] = await db`SELECT status FROM msg_import_jobs WHERE id = ${id}`
  if (!job) return bad("עבודת הייבוא לא נמצאה", 404)
  const r = await db`DELETE FROM msg_audience_members WHERE import_job_id = ${id} RETURNING recipient_id`
  await db`UPDATE msg_import_jobs SET counts = counts || jsonb_build_object('undone', ${r.length}::int) WHERE id = ${id}`
  await activity(u.name, "import.undo", "import", id, `${r.length} חברויות בקהל בוטלו`)
  return NextResponse.json({ removed: r.length })
}
