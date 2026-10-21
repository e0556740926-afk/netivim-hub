import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { ensureRoutinesSchema, materializeOccurrences, weeklyReportStatus } from "@/lib/routines";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/** Routines are the manager's tool: coordinators may read, only admins write. */
async function adminOnly(req: NextRequest) {
  const me = await currentUser(req);
  if (!me || me.role !== "admin") return null;
  return me;
}

const STATUSES = ["planned", "done", "missed", "postponed"];

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD[&routine_id=]
 * Materialises missing occurrences in range, then lists them with the
 * routine's details. weekly_report-linked occurrences get a derived
 * report status (who submitted / who's missing) instead of a manual one.
 */
export async function GET(req: NextRequest) {
  await ensureRoutinesSchema();
  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = sp.get("from") || today;
  const to = sp.get("to") || today;
  const routineId = Number(sp.get("routine_id")) || null;
  await materializeOccurrences(from, to);

  const rows = routineId
    ? await sql`
        SELECT o.*, r.name, r.frequency, r.time, r.participants, r.agenda_template, r.requires_doc, r.linked_type, r.active
        FROM routine_occurrences o JOIN routines r ON r.id = o.routine_id
        WHERE o.due_date BETWEEN ${from} AND ${to} AND o.routine_id = ${routineId}
        ORDER BY o.due_date, r.time NULLS LAST, r.name`
    : await sql`
        SELECT o.*, r.name, r.frequency, r.time, r.participants, r.agenda_template, r.requires_doc, r.linked_type, r.active
        FROM routine_occurrences o JOIN routines r ON r.id = o.routine_id
        WHERE o.due_date BETWEEN ${from} AND ${to}
        ORDER BY o.due_date, r.time NULLS LAST, r.name`;

  const coordinators = await sql`SELECT id, name, area FROM coordinators ORDER BY name`;
  const occurrences = [];
  for (const o of rows as any[]) {
    const due = typeof o.due_date === "string" ? o.due_date.slice(0, 10) : new Date(o.due_date).toISOString().slice(0, 10);
    let report: any = null;
    let status = o.status;
    if (o.linked_type === "weekly_report") {
      report = await weeklyReportStatus(due, o.participants || []);
      // Derived: done once everyone submitted; missed once the date passed with gaps.
      if (status === "planned") status = report.all_submitted ? "done" : (due < today ? "missed" : "planned");
    }
    occurrences.push({ ...o, due_date: due, status, derived: o.linked_type === "weekly_report", report });
  }
  return NextResponse.json({ occurrences, coordinators, from, to });
}

/**
 * PATCH { id, status?, notes?, attendees?, create_meeting?: { agenda, summary, next_meeting_date }, tasks?: [{ title, type, details, coordinator_id, assignees, due_date }] }
 * Documents an occurrence. For a meeting-linked routine, optionally writes
 * a `meetings` row per attending coordinator (so it shows on each one's
 * card) and creates the extracted follow-up tasks.
 */
export async function PATCH(req: NextRequest) {
  const me = await adminOnly(req);
  if (!me) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  await ensureRoutinesSchema();
  const d = await req.json();
  const id = Number(d.id);
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const [occ] = await sql`
    SELECT o.*, r.name, r.linked_type, r.participants FROM routine_occurrences o JOIN routines r ON r.id = o.routine_id WHERE o.id = ${id}`;
  if (!occ) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const status = STATUSES.includes(d.status) ? d.status : occ.status;
  const notes = typeof d.notes === "string" ? d.notes : occ.notes;
  const attendees: number[] = Array.isArray(d.attendees) ? d.attendees.map(Number).filter(Boolean) : (occ.attendees || []);
  const due = typeof occ.due_date === "string" ? occ.due_date.slice(0, 10) : new Date(occ.due_date).toISOString().slice(0, 10);

  let meetingId: number | null = occ.meeting_id || null;
  if (d.create_meeting && occ.linked_type === "meeting" && !meetingId) {
    const cm = d.create_meeting;
    const targets: number[] = attendees.length ? attendees : (occ.participants?.length ? occ.participants : (await sql`SELECT id FROM coordinators`).map((c: any) => c.id));
    for (const cid of targets) {
      const [m] = await sql`
        INSERT INTO meetings (coordinator_id, manager_id, date, type, agenda, summary, next_meeting_date)
        VALUES (${cid}, ${me?.id || null}, ${due}, 'regular', ${cm.agenda || ""}, ${cm.summary || notes || ""}, ${cm.next_meeting_date || null})
        RETURNING id`;
      if (!meetingId) meetingId = m.id;
    }
  }

  const createdTaskIds: number[] = [...(occ.tasks_created || [])];
  if (Array.isArray(d.tasks)) {
    for (const t of d.tasks) {
      if (!t?.title) continue;
      let assignees: string[] = Array.isArray(t.assignees) ? t.assignees : [];
      let coordinatorId: number | null = t.coordinator_id ? Number(t.coordinator_id) : null;
      if (coordinatorId && !assignees.length) {
        const [c] = await sql`SELECT name FROM coordinators WHERE id = ${coordinatorId}`;
        if (c) assignees = [c.name];
      }
      if (!assignees.length && me?.name) assignees = [me.name];
      const [row] = await sql`
        INSERT INTO tasks (coordinator_id, title, details, type, assignees, due_date, status)
        VALUES (${coordinatorId}, ${t.title}, ${t.details || ""}, ${t.type || "backoffice"}, ${assignees}, ${t.due_date || null}, 'todo')
        RETURNING id`;
      createdTaskIds.push(row.id);
    }
  }

  const doneAt = status === "done" ? (occ.done_at || new Date().toISOString()) : null;
  const [updated] = await sql`
    UPDATE routine_occurrences
    SET status = ${status}, notes = ${notes}, attendees = ${attendees}, tasks_created = ${createdTaskIds}, meeting_id = ${meetingId}, done_at = ${doneAt}
    WHERE id = ${id} RETURNING *`;
  logAudit({ entityType: "setting", entityId: id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `שגרה "${occ.name}" ${due}: ${status}` });
  return NextResponse.json({ occurrence: updated, meeting_id: meetingId, tasks_created: createdTaskIds });
}
