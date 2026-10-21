import { NextRequest, NextResponse } from "next/server"
import { db, guard } from "@/lib/messaging/server"
import { runWorker } from "@/lib/messaging/core"

/** Manual nudge of the delivery worker (the scheduled function runs it every few minutes anyway). */
export async function POST(req: NextRequest) {
  const u = await guard(req, "send"); if (u instanceof NextResponse) return u
  const log = await runWorker(db, process.env, { budgetMs: 8000 })
  return NextResponse.json(log)
}
