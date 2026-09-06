import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendEmail, taskAssignedEmail } from "@/lib/email";
import { sendWhatsApp, taskAssignedMsg } from "@/lib/whatsapp";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";
import { sendPush } from "@/lib/push";
import { hasColumn } from "@/lib/schema";
import { syncAssignedAndParticipants } from "@/lib/task-assignment";

// Adds assigned_to_name + participant_names to whatever row set the
// legacy queries below already produced. Read-only, additive — nothing
// that already worked off `assignees` is affected.
async function withAssignmentNames(rows: any[]) {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id);
  const [owners, participants] = await Promise.all([
    sql`SELECT t.id AS task_id, u.name FROM tasks t JOIN users u ON u.id = t.assigned_to WHERE t.id = ANY(${ids})`,
    sql`SELECT tp.task_id, u.name FROM task_participants tp JOIN users u ON u.id = tp.user_id WHERE tp.task_id = ANY(${ids})`,
  ]);
  const ownerMap = new Map((owners as any[]).map(o => [o.task_id, o.name]));
  const partMap = new Map<number, string[]>();
  for (const p of participants as any[]) {
    if (!partMap.has(p.task_id)) partMap.set(p.task_id, []);
    partMap.get(p.task_id)!.push(p.name);
  }
  return rows.map(r => ({
    ...r,
    assigned_to_name: ownerMap.get(r.id) || null,
    participant_names: partMap.get(r.id) || [],
  }));
}

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });

  // Row-level scoping (permissions matrix, "tasks" row): O-level roles
  // (rav/advisor/coordinator/secretary) are hard-scoped server-side to
  // their own name in `assignees` — the client-supplied name/coordinator_id
  // params below are for admin/ceo/T-level use only and are ignored
  // entirely for an O-level caller, same fix as the leads/cases modules.
  const OWN_ONLY_ROLES = ["rav", "advisor", "coordinator", "secretary"];
  if (OWN_ONLY_ROLES.includes(me.role)) {
    const rows = await sql`SELECT * FROM tasks WHERE ${me.name}=ANY(assignees) ORDER BY due_date`;
    return NextResponse.json({ tasks: await withAssignmentNames(rows) });
  }

  const name = req.nextUrl.searchParams.get("name");
  const full = req.nextUrl.searchParams.get("full");
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  if (name && full) {
    // A coordinator's own task list — every status, no limit.
    // Distinct from the plain `name` mode below, which is the small
    // home-page "what's next" widget and intentionally excludes done
    // tasks and caps at 10.
    const rows = await sql`SELECT * FROM tasks WHERE ${name}=ANY(assignees) ORDER BY due_date`;
    return NextResponse.json({ tasks: await withAssignmentNames(rows) });
  }
  if (name) {
    const rows = await sql`SELECT * FROM tasks WHERE ${name}=ANY(assignees) AND status!='done' ORDER BY due_date LIMIT 10`;
    return NextResponse.json({ tasks: await withAssignmentNames(rows) });
  }
  if (cid) {
    const rows = await sql`SELECT * FROM tasks WHERE coordinator_id=${parseInt(cid)} ORDER BY due_date`;
    return NextResponse.json({ tasks: await withAssignmentNames(rows) });
  }
  const rows = await sql`SELECT * FROM tasks ORDER BY due_date`;
  return NextResponse.json({ tasks: await withAssignmentNames(rows) });
}

// Look up emails for a list of assignee names
async function getEmailsFor(names: string[]) {
  if (!names?.length) return [];
  const clean = names.map(n => n.replace(/\s*👑\s*/g, "").trim()).filter(Boolean);
  if (!clean.length) return [];


  const [coordRows, userRows] = await Promise.all([
    sql`SELECT c.name, u.email, COALESCE(c.phone, u.phone) as phone FROM coordinators c
        JOIN users u ON u.id = c.user_id
        WHERE c.name = ANY(${clean})`,
    sql`SELECT name, email, phone, role FROM users
        WHERE name = ANY(${clean}) AND status='active'`,
  ]);

  const map = new Map<string, { email?: string; phone?: string; isCoordinator: boolean }>();
  for (const r of coordRows as any[]) map.set(r.name, { email: r.email, phone: r.phone, isCoordinator: true });
  for (const r of userRows as any[]) {
    if (!map.has(r.name)) map.set(r.name, { email: r.email, phone: r.phone, isCoordinator: r.role === "coordinator" });
  }
  return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
}

/**
 * Fire-and-forget notifications. Also returns a small per-channel
 * delivery log ({channel, to, ok, reason, at}[]) so the caller can
 * persist it to tasks.notify_log — surfaced to managers because the
 * email channel is known-unreliable (no verified Resend domain) and
 * silently-failed mail was invisible before this.
 */
async function notifyAssignees(task: any, newAssignees: string[], assignedBy?: string): Promise<any[]> {
  const log: any[] = [];
  try {
    const recipients = await getEmailsFor(newAssignees);
    const payload = (r: any) => ({
      assigneeName: r.name,
      taskTitle: task.title,
      taskType: task.type,
      dueDate: task.due_date ? String(task.due_date).slice(0, 10) : null,
      details: task.details,
      assignedBy,
      isCoordinator: r.isCoordinator,
    });
    await Promise.all(recipients.flatMap(r => {
      const jobs: Promise<any>[] = [];
      if (r.email) {
        const { subject, html } = taskAssignedEmail(payload(r));
        jobs.push(sendEmail({ to: r.email, subject, html }).then((res: any) => {
          log.push({ channel: "email", to: r.name, ok: !!res?.ok, reason: res?.ok ? undefined : res?.reason, at: new Date().toISOString() });
        }));
        jobs.push(sendPush(r.email, {
          title: "✅ משימה חדשה",
          body: task.title,
          url: r.isCoordinator ? "/coord/tasks" : "/admin/tasks",
        }));
      }
      if (r.phone) {
        jobs.push(sendWhatsApp(r.phone, taskAssignedMsg(payload(r))).then((res: any) => {
          log.push({ channel: "whatsapp", to: r.name, ok: !!res?.ok, reason: res?.ok ? undefined : res?.reason, at: new Date().toISOString() });
        }));
      }
      return jobs;
    }));
  } catch (e) {
    console.error("[notify] failed:", e);
  }
  return log;
}

/** Appends entries to tasks.notify_log, keeping the most recent 20. Never throws. */
async function persistNotifyLog(taskId: number, entries: any[]) {
  if (!entries.length) return;
  try {
    if (!(await hasColumn("tasks", "notify_log"))) return;
    await sql`
      UPDATE tasks SET notify_log = (
        SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
          SELECT x FROM jsonb_array_elements(COALESCE(notify_log,'[]'::jsonb) || ${JSON.stringify(entries)}::jsonb) x
          ORDER BY (x->>'at') DESC LIMIT 20
        ) s
      )
      WHERE id=${taskId}`;
  } catch (e) {
    console.error("[notify_log] failed:", e);
  }
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const hasRecurrence = await hasColumn("tasks", "recurrence");
  const hasPriority = await hasColumn("tasks", "priority");
  const priority = hasPriority ? (d.priority || "normal") : undefined;

  let rows;
  if (hasRecurrence && d.recurrence) {
    // A recurring task's due_date is its first occurrence; next_run
    // starts at the same date so the scheduled generator spawns the
    // SECOND occurrence exactly when the first one's date arrives.
    rows = hasPriority
      ? await sql`
          INSERT INTO tasks (coordinator_id,event_id,contact_id,title,details,type,assignees,due_date,status,recurrence,next_run,priority)
          VALUES (${d.coordinator_id||null},${d.event_id||null},${d.contact_id||null},${d.title},${d.details||''},${d.type||'call'},${d.assignees||[]},${d.due_date||null},${d.status||'todo'},${d.recurrence},${d.due_date||null},${priority})
          RETURNING *`
      : await sql`
          INSERT INTO tasks (coordinator_id,event_id,contact_id,title,details,type,assignees,due_date,status,recurrence,next_run)
          VALUES (${d.coordinator_id||null},${d.event_id||null},${d.contact_id||null},${d.title},${d.details||''},${d.type||'call'},${d.assignees||[]},${d.due_date||null},${d.status||'todo'},${d.recurrence},${d.due_date||null})
          RETURNING *`;
  } else {
    rows = hasPriority
      ? await sql`
          INSERT INTO tasks (coordinator_id,event_id,contact_id,title,details,type,assignees,due_date,status,priority)
          VALUES (${d.coordinator_id||null},${d.event_id||null},${d.contact_id||null},${d.title},${d.details||''},${d.type||'call'},${d.assignees||[]},${d.due_date||null},${d.status||'todo'},${priority})
          RETURNING *`
      : await sql`
          INSERT INTO tasks (coordinator_id,event_id,contact_id,title,details,type,assignees,due_date,status)
          VALUES (${d.coordinator_id||null},${d.event_id||null},${d.contact_id||null},${d.title},${d.details||''},${d.type||'call'},${d.assignees||[]},${d.due_date||null},${d.status||'todo'})
          RETURNING *`;
  }

  const task = rows[0];
  await syncAssignedAndParticipants(task.id, d.assignees || []);
  if (d.notify !== false && d.assignees?.length) {
    const log = await notifyAssignees(task, d.assignees, d.assigned_by);
    await persistNotifyLog(task.id, log);
  }
  const me = await currentUser(req);
  logAudit({ entityType:"task", entityId:task.id, action:"create", actorName:me?.name||d.assigned_by, summary:`נוצרה: ${d.title}` });
  return NextResponse.json({ task });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();

  // Row-level scoping: O-only roles may only touch a task they're
  // actually assigned to — checked once here, before any of the update
  // branches below, so it can't be bypassed via a specific payload shape.
  const meCheck = await currentUser(req);
  if (meCheck && ["rav", "advisor", "coordinator", "secretary"].includes(meCheck.role)) {
    const [task] = await sql`SELECT assignees FROM tasks WHERE id=${d.id}`;
    if (!task || !(task.assignees || []).includes(meCheck.name)) {
      return NextResponse.json({ error: "אין הרשאה — משימה זו אינה משויכת אליך" }, { status: 403 });
    }
  }

  // Status-only update (kanban drag/quick buttons) — never touches
  // other fields, so a partial payload can't wipe title/assignees.
  if (d.status_only || (d.title === undefined && d.due_date === undefined)) {
    if (d.status === undefined) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    await sql`UPDATE tasks SET status=${d.status} WHERE id=${d.id}`;
    const me0 = await currentUser(req);
    logAudit({ entityType:"task", entityId:d.id, action:"update", actorName:me0?.name, actorEmail:me0?.email, summary:`סטטוס → ${d.status}` });
    return NextResponse.json({ ok: true });
  }

  // Due-date-only update ("דחה למחר" / snooze) — same guard as above,
  // for the one-click reschedule action.
  if (d.due_date_only) {
    if (d.due_date === undefined) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    await sql`UPDATE tasks SET due_date=${d.due_date} WHERE id=${d.id}`;
    const me0b = await currentUser(req);
    logAudit({ entityType:"task", entityId:d.id, action:"update", actorName:me0b?.name, actorEmail:me0b?.email, summary:`נדחה ל-${d.due_date}` });
    return NextResponse.json({ ok: true });
  }

  // Find newly-added assignees so we only email them
  const before = await sql`SELECT assignees FROM tasks WHERE id=${d.id} LIMIT 1`;
  const prev: string[] = (before[0] as any)?.assignees || [];
  const next: string[] = d.assignees || [];
  const added = next.filter(n => !prev.includes(n));

  const hasRecurrence = await hasColumn("tasks", "recurrence");
  const hasPriority = await hasColumn("tasks", "priority");
  const priority = d.priority || "normal";

  if (hasRecurrence) {
    // Editing a task keeps its existing next_run schedule untouched
    // unless the recurrence rule itself changed; turning recurrence
    // off clears next_run so the generator skips it going forward.
    if (d.recurrence) {
      if (hasPriority) {
        await sql`UPDATE tasks SET title=${d.title},details=${d.details||''},type=${d.type},assignees=${next},due_date=${d.due_date||null},status=${d.status},event_id=${d.event_id||null},contact_id=${d.contact_id||null},recurrence=${d.recurrence},priority=${priority} WHERE id=${d.id}`;
      } else {
        await sql`UPDATE tasks SET title=${d.title},details=${d.details||''},type=${d.type},assignees=${next},due_date=${d.due_date||null},status=${d.status},event_id=${d.event_id||null},contact_id=${d.contact_id||null},recurrence=${d.recurrence} WHERE id=${d.id}`;
      }
    } else {
      if (hasPriority) {
        await sql`UPDATE tasks SET title=${d.title},details=${d.details||''},type=${d.type},assignees=${next},due_date=${d.due_date||null},status=${d.status},event_id=${d.event_id||null},contact_id=${d.contact_id||null},recurrence=NULL,next_run=NULL,priority=${priority} WHERE id=${d.id}`;
      } else {
        await sql`UPDATE tasks SET title=${d.title},details=${d.details||''},type=${d.type},assignees=${next},due_date=${d.due_date||null},status=${d.status},event_id=${d.event_id||null},contact_id=${d.contact_id||null},recurrence=NULL,next_run=NULL WHERE id=${d.id}`;
      }
    }
  } else if (hasPriority) {
    await sql`UPDATE tasks SET title=${d.title},details=${d.details||''},type=${d.type},assignees=${next},due_date=${d.due_date||null},status=${d.status},event_id=${d.event_id||null},contact_id=${d.contact_id||null},priority=${priority} WHERE id=${d.id}`;
  } else {
    await sql`UPDATE tasks SET title=${d.title},details=${d.details||''},type=${d.type},assignees=${next},due_date=${d.due_date||null},status=${d.status},event_id=${d.event_id||null},contact_id=${d.contact_id||null} WHERE id=${d.id}`;
  }

  await syncAssignedAndParticipants(d.id, next);

  if (d.notify !== false && added.length) {
    const log = await notifyAssignees(
      { title: d.title, type: d.type, due_date: d.due_date, details: d.details },
      added,
      d.assigned_by
    );
    await persistNotifyLog(d.id, log);
  }
  const me1 = await currentUser(req);
  logAudit({ entityType:"task", entityId:d.id, action:"update", actorName:me1?.name||d.assigned_by, summary:`עודכן: ${d.title}` });
  return NextResponse.json({ ok: true, notified: added.length });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const me = await currentUser(req);
  if (me && ["rav", "advisor", "coordinator", "secretary"].includes(me.role)) {
    const [task] = await sql`SELECT assignees FROM tasks WHERE id=${id}`;
    if (!task || !(task.assignees || []).includes(me.name)) {
      return NextResponse.json({ error: "אין הרשאה — משימה זו אינה משויכת אליך" }, { status: 403 });
    }
  }
  await sql`DELETE FROM tasks WHERE id=${id}`;
  logAudit({ entityType:"task", entityId:id, action:"delete", actorName:me?.name, actorEmail:me?.email });
  return NextResponse.json({ ok: true });
}
