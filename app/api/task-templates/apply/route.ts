import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/**
 * Applies a saved template to a chosen set of assignees, starting
 * from a chosen date — one explicit manager click from the admin
 * tasks screen. Each template item becomes its own plain (non-
 * recurring) task with due_date = start_date + offset_days.
 *
 * Deliberately NOT wired to any lead/contact/event lifecycle event —
 * opening or converting a lead never calls this route. It only runs
 * when a manager picks a template and presses "החל" in the UI.
 */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const templateId = Number(d.template_id);
  const assignees: string[] = Array.isArray(d.assignees) ? d.assignees : [];
  const startDate: string = d.start_date || new Date().toISOString().slice(0, 10);
  if (!templateId) return NextResponse.json({ error: "missing template_id" }, { status: 400 });
  if (!assignees.length) return NextResponse.json({ error: "missing assignees" }, { status: 400 });

  const items = await sql`SELECT * FROM task_template_items WHERE template_id=${templateId} ORDER BY sort_order ASC, id ASC`;
  if (!(items as any[]).length) return NextResponse.json({ error: "template has no items" }, { status: 400 });

  const me = await currentUser(req);
  const created: any[] = [];
  for (const it of items as any[]) {
    const due = new Date(startDate + "T00:00:00");
    due.setDate(due.getDate() + (it.offset_days || 0));
    const dueStr = due.toISOString().slice(0, 10);
    const rows = await sql`
      INSERT INTO tasks (title, type, priority, assignees, due_date, status)
      VALUES (${it.title}, ${it.type}, ${it.priority}, ${assignees}, ${dueStr}, 'todo')
      RETURNING *`;
    created.push(rows[0]);
    logAudit({ entityType: "task", entityId: rows[0].id, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `נוצרה מתבנית` });
  }
  return NextResponse.json({ ok: true, created: created.length, tasks: created });
}
