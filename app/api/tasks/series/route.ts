import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/**
 * Recurring-series management for managers (admin-only, gated in
 * middleware.ts). A "series" is one master task row with
 * recurrence IS NOT NULL — netlify/functions/recurring-tasks.mts
 * spawns a fresh plain occurrence from it each time next_run
 * arrives, and only ever advances the master's own next_run.
 * Every spawned occurrence carries recurrence_series_id = master.id
 * but never sets recurrence itself, so "recurrence IS NOT NULL" is
 * exactly the set of series masters — no separate table needed.
 */
export async function GET() {
  const masters = await sql`SELECT * FROM tasks WHERE recurrence IS NOT NULL ORDER BY created_at DESC`;
  const withCounts = await Promise.all((masters as any[]).map(async (m) => {
    const [{ count }] = await sql`SELECT count(*)::int as count FROM tasks WHERE recurrence_series_id=${m.id}` as any[];
    const [{ open }] = await sql`SELECT count(*)::int as open FROM tasks WHERE recurrence_series_id=${m.id} AND status != 'done'` as any[];
    return { ...m, spawned_count: count, open_count: open };
  }));
  return NextResponse.json({ series: withCounts });
}

/**
 *   { id, action: "pause" }   — stops future spawns (next_run -> NULL), history untouched
 *   { id, action: "resume" }  — next_run -> today, so tomorrow's run spawns the next one
 *   { id, action: "update", title?, type?, priority?, assignees? } — affects FUTURE occurrences only,
 *       since each occurrence copies these fields from the master at spawn time
 */
export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const me = await currentUser(req);

  if (d.action === "pause") {
    await sql`UPDATE tasks SET next_run=NULL WHERE id=${d.id}`;
    logAudit({ entityType: "task", entityId: d.id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "סדרה חוזרת הושהתה" });
    return NextResponse.json({ ok: true });
  }
  if (d.action === "resume") {
    await sql`UPDATE tasks SET next_run=CURRENT_DATE WHERE id=${d.id}`;
    logAudit({ entityType: "task", entityId: d.id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "סדרה חוזרת חודשה" });
    return NextResponse.json({ ok: true });
  }
  if (d.action === "update") {
    if (d.title !== undefined) await sql`UPDATE tasks SET title=${d.title} WHERE id=${d.id}`;
    if (d.type !== undefined) await sql`UPDATE tasks SET type=${d.type} WHERE id=${d.id}`;
    if (d.priority !== undefined) await sql`UPDATE tasks SET priority=${d.priority} WHERE id=${d.id}`;
    if (d.assignees !== undefined) await sql`UPDATE tasks SET assignees=${d.assignees} WHERE id=${d.id}`;
    logAudit({ entityType: "task", entityId: d.id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "עריכת סדרה חוזרת" });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
