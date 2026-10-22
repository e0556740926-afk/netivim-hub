import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"

/** Attaches an audience (e.g. one just created by "ייבוא לקמפיין") to a draft. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const d = await req.json().catch(() => ({}))
  const aid = Number(d.audience_id)
  const [a] = await db`SELECT id FROM msg_audiences WHERE id = ${aid} AND NOT archived`
  if (!a) return bad("הקהל לא נמצא")
  const [r] = await db`UPDATE msg_campaigns SET audience_ids = CASE WHEN ${aid} = ANY(audience_ids) THEN audience_ids ELSE array_append(audience_ids, ${aid}) END,
      exclude_audience_ids = array_remove(exclude_audience_ids, ${aid}), revision = revision + 1, updated_at = now()
    WHERE id = ${id} AND status = 'draft' RETURNING id, name, revision, audience_ids`
  if (!r) return bad("אפשר לצרף קהל רק לטיוטה", 409)
  return NextResponse.json({ campaign: r })
}
