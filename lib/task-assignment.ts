import sql from "@/lib/db";

/**
 * Keeps the normalized assigned_to/task_participants structure in sync
 * with the legacy `assignees` text[] column, wherever a route writes it.
 * Purely additive: never changes `assignees` itself or notification
 * behavior. assignees[0] (exact match against users.name) becomes the
 * single owner; the rest become participants. Names with no matching
 * user are silently skipped — `assignees` remains the source of truth
 * for anything unresolved.
 */
export async function syncAssignedAndParticipants(taskId: number, assignees: string[]) {
  try {
    const clean = (assignees || []).map(n => n.replace(/\s*👑\s*/g, "").trim()).filter(Boolean);
    const owner = clean[0];
    const extras = clean.slice(1);

    if (owner) {
      await sql`
        UPDATE tasks SET assigned_to = (SELECT id FROM users WHERE name = ${owner} LIMIT 1)
        WHERE id = ${taskId}`;
    } else {
      await sql`UPDATE tasks SET assigned_to = NULL WHERE id = ${taskId}`;
    }

    await sql`DELETE FROM task_participants WHERE task_id = ${taskId}`;
    if (extras.length) {
      await sql`
        INSERT INTO task_participants (task_id, user_id)
        SELECT ${taskId}, u.id FROM users u WHERE u.name = ANY(${extras})
        ON CONFLICT DO NOTHING`;
    }
  } catch (e) {
    console.error("[assigned_to sync] failed:", e);
  }
}

/** Same idea, batched for routes that update many tasks by id at once. */
export async function syncAssignedAndParticipantsForIds(taskIds: number[]) {
  try {
    const rows = await sql`SELECT id, assignees FROM tasks WHERE id = ANY(${taskIds})`;
    for (const r of rows as any[]) {
      await syncAssignedAndParticipants(r.id, r.assignees || []);
    }
  } catch (e) {
    console.error("[assigned_to sync batch] failed:", e);
  }
}
