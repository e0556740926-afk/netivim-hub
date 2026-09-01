import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";

/** Sub-tasks / checklist items inside one task, e.g. "call 5 leads"
 * broken into individually-checkable rows. Open to both roles. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await sql`SELECT * FROM task_checklist_items WHERE task_id=${Number(id)} ORDER BY sort_order ASC, id ASC`;
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await req.json();
  if (!d.text?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  const [{ next }] = await sql`SELECT COALESCE(MAX(sort_order),0)+1 as next FROM task_checklist_items WHERE task_id=${Number(id)}` as any[];
  const rows = await sql`
    INSERT INTO task_checklist_items (task_id, text, sort_order)
    VALUES (${Number(id)}, ${d.text.trim()}, ${next})
    RETURNING *`;
  return NextResponse.json({ item: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (d.id === undefined) return NextResponse.json({ error: "missing id" }, { status: 400 });
  if (d.done !== undefined) await sql`UPDATE task_checklist_items SET done=${!!d.done} WHERE id=${d.id}`;
  if (d.text !== undefined) await sql`UPDATE task_checklist_items SET text=${d.text} WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM task_checklist_items WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
