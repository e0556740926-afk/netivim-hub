import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";
import { syncAssignedAndParticipantsForIds } from "@/lib/task-assignment";

/**
 * Bulk operations for a manager-selected set of tasks (admin-only,
 * gated in middleware.ts). Mirrors the pattern in /api/leads/bulk.
 *   { ids: number[], action: "status", status: string }
 *   { ids: number[], action: "reassign", assignees: string[] }   // replaces assignees
 *   { ids: number[], action: "add_assignee", name: string }      // adds one, keeps existing
 *   { ids: number[], action: "priority", priority: string }
 *   { ids: number[], action: "delete" }
 */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const ids: number[] = Array.isArray(d.ids) ? d.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "no ids" }, { status: 400 });

  const me = await currentUser(req);
  const who = me?.name || "מנהל";

  if (d.action === "status") {
    if (!d.status) return NextResponse.json({ error: "missing status" }, { status: 400 });
    await sql`UPDATE tasks SET status=${d.status} WHERE id = ANY(${ids})`;
    for (const id of ids) logAudit({ entityType: "task", entityId: id, action: "update", actorName: who, actorEmail: me?.email, summary: `סטטוס קבוצתי → ${d.status}` });
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "reassign") {
    const assignees: string[] = Array.isArray(d.assignees) ? d.assignees : [];
    await sql`UPDATE tasks SET assignees=${assignees} WHERE id = ANY(${ids})`;
    await syncAssignedAndParticipantsForIds(ids);
    for (const id of ids) logAudit({ entityType: "task", entityId: id, action: "update", actorName: who, actorEmail: me?.email, summary: `שיוך קבוצתי → ${assignees.join(", ")}` });
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "add_assignee") {
    if (!d.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
    await sql`UPDATE tasks SET assignees = array_append(assignees, ${d.name}) WHERE id = ANY(${ids}) AND NOT (${d.name} = ANY(assignees))`;
    await syncAssignedAndParticipantsForIds(ids);
    for (const id of ids) logAudit({ entityType: "task", entityId: id, action: "update", actorName: who, actorEmail: me?.email, summary: `נוסף לשיוך: ${d.name}` });
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "priority") {
    if (!d.priority) return NextResponse.json({ error: "missing priority" }, { status: 400 });
    await sql`UPDATE tasks SET priority=${d.priority} WHERE id = ANY(${ids})`;
    for (const id of ids) logAudit({ entityType: "task", entityId: id, action: "update", actorName: who, actorEmail: me?.email, summary: `דחיפות קבוצתית → ${d.priority}` });
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "delete") {
    await sql`DELETE FROM tasks WHERE id = ANY(${ids})`;
    for (const id of ids) logAudit({ entityType: "task", entityId: id, action: "delete", actorName: who, actorEmail: me?.email, summary: "מחיקה קבוצתית" });
    return NextResponse.json({ ok: true, count: ids.length });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
