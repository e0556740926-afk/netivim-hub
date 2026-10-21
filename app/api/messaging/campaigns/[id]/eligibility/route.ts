import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"
import { computeEligibility, syncNewsletter } from "@/lib/messaging/core"

/** Unique reachable people for the selected audiences, computed over the full lists in the DB. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [c] = await db`SELECT channel, audience_ids, exclude_audience_ids FROM msg_campaigns WHERE id = ${id}`
  if (!c) return bad("הקמפיין לא נמצא", 404)
  await syncNewsletter(db).catch(() => {})
  const e = await computeEligibility(db, c.channel, c.audience_ids || [], c.exclude_audience_ids || [])
  return NextResponse.json(e)
}
