import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/** Comment thread on a single task — lets a coordinator and a manager
 * go back and forth in-app instead of over whatsapp/email for every
 * small question. Open to both roles: whoever can see the task can
 * comment on it. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await sql`SELECT * FROM task_comments WHERE task_id=${Number(id)} ORDER BY created_at ASC`;
  return NextResponse.json({ comments: rows });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await req.json();
  if (!d.body?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  const me = await currentUser(req);
  const author = me?.name || d.author_name || "לא ידוע";
  const rows = await sql`
    INSERT INTO task_comments (task_id, author_name, body)
    VALUES (${Number(id)}, ${author}, ${d.body.trim()})
    RETURNING *`;
  logAudit({ entityType: "task", entityId: Number(id), action: "update", actorName: author, actorEmail: me?.email, summary: "תגובה חדשה" });
  return NextResponse.json({ comment: rows[0] });
}
