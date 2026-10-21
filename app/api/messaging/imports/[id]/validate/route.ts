import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"
import { classifyImport } from "@/lib/messaging/core"

/** Step 4: check every row — new / existing / duplicate / invalid / suppressed / conflict. Writes nothing to the pool. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [job] = await db`SELECT status, default_country FROM msg_import_jobs WHERE id = ${id}`
  if (!job) return bad("עבודת הייבוא לא נמצאה", 404)
  if (!["uploaded", "validated"].includes(job.status)) return bad("הייבוא כבר אושר", 409)
  const result = await classifyImport(db, id, job.default_country || "IL")
  return NextResponse.json(result)
}
