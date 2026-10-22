import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"

/** Status / handler / note on one "לידים מקמפיינים" row. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const d = await req.json().catch(() => ({}))
  const [cur] = await db`SELECT * FROM msg_callbacks WHERE id = ${id}`
  if (!cur) return bad("הרשומה לא נמצאה", 404)
  const status = d.status !== undefined ? String(d.status) : cur.status
  if (!["new", "in_progress", "done", "no_answer"].includes(status)) return bad("סטטוס לא תקין")
  const assignee = d.assignee_id !== undefined ? (Number(d.assignee_id) || null) : cur.assignee_id
  const note = d.note !== undefined ? String(d.note).slice(0, 2000) : cur.note
  const [r] = await db`UPDATE msg_callbacks SET status = ${status}, assignee_id = ${assignee}, note = ${note}, updated_by = ${u.name}, updated_at = now()
    WHERE id = ${id} RETURNING *`
  return NextResponse.json({ callback: r })
}
