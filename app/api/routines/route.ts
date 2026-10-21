import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { ensureRoutinesSchema, materializeOccurrences } from "@/lib/routines";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/** Routines are the manager's tool: coordinators may read, only admins write. */
async function adminOnly(req: NextRequest) {
  const me = await currentUser(req);
  if (!me || me.role !== "admin") return null;
  return me;
}

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

/** List routines with their next occurrence and last recorded status. */
export async function GET() {
  await ensureRoutinesSchema();
  const today = new Date();
  const horizon = new Date(today); horizon.setUTCDate(horizon.getUTCDate() + 35);
  await materializeOccurrences(ymd(today), ymd(horizon));

  const rows = await sql`
    SELECT r.*,
      (SELECT o.due_date FROM routine_occurrences o WHERE o.routine_id = r.id AND o.due_date >= CURRENT_DATE ORDER BY o.due_date LIMIT 1) AS next_due,
      (SELECT o.status FROM routine_occurrences o WHERE o.routine_id = r.id AND o.due_date < CURRENT_DATE ORDER BY o.due_date DESC LIMIT 1) AS last_status,
      (SELECT o.due_date FROM routine_occurrences o WHERE o.routine_id = r.id AND o.due_date < CURRENT_DATE ORDER BY o.due_date DESC LIMIT 1) AS last_due,
      (SELECT count(*)::int FROM routine_occurrences o WHERE o.routine_id = r.id AND o.status = 'done') AS done_count,
      (SELECT count(*)::int FROM routine_occurrences o WHERE o.routine_id = r.id AND o.status = 'missed') AS missed_count
    FROM routines r
    ORDER BY r.active DESC, r.weekday NULLS LAST, r.name`;
  const coordinators = await sql`SELECT id, name, area FROM coordinators ORDER BY name`;
  return NextResponse.json({ routines: rows, coordinators });
}

function cleanBody(d: any) {
  const freq = ["daily", "weekly", "monthly"].includes(d.frequency) ? d.frequency : "weekly";
  return {
    name: String(d.name || "").trim(),
    description: d.description || "",
    frequency: freq,
    weekday: freq === "weekly" ? (Number.isInteger(+d.weekday) ? +d.weekday : 0) : null,
    day_of_month: freq === "monthly" ? Math.min(31, Math.max(1, +d.day_of_month || 1)) : null,
    time: d.time || null,
    participants: Array.isArray(d.participants) ? d.participants.map(Number).filter(Boolean) : [],
    agenda_template: d.agenda_template || "",
    requires_doc: !!d.requires_doc,
    linked_type: d.linked_type === "weekly_report" || d.linked_type === "meeting" ? d.linked_type : null,
  };
}

export async function POST(req: NextRequest) {
  const me = await adminOnly(req);
  if (!me) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  await ensureRoutinesSchema();
  const b = cleanBody(await req.json());
  if (!b.name) return NextResponse.json({ error: "חסר שם" }, { status: 400 });
  const [row] = await sql`
    INSERT INTO routines (name, description, frequency, weekday, day_of_month, time, participants, agenda_template, requires_doc, linked_type)
    VALUES (${b.name}, ${b.description}, ${b.frequency}, ${b.weekday}, ${b.day_of_month}, ${b.time}, ${b.participants}, ${b.agenda_template}, ${b.requires_doc}, ${b.linked_type})
    RETURNING *`;
  logAudit({ entityType: "setting", entityId: row.id, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `שגרה חדשה: ${b.name}` });
  return NextResponse.json({ routine: row });
}

export async function PATCH(req: NextRequest) {
  const me = await adminOnly(req);
  if (!me) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  await ensureRoutinesSchema();
  const d = await req.json();
  const id = Number(d.id);
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  if ("active" in d && Object.keys(d).length === 2) {
    await sql`UPDATE routines SET active = ${!!d.active} WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  }
  const b = cleanBody(d);
  if (!b.name) return NextResponse.json({ error: "חסר שם" }, { status: 400 });
  const [row] = await sql`
    UPDATE routines SET name=${b.name}, description=${b.description}, frequency=${b.frequency}, weekday=${b.weekday},
      day_of_month=${b.day_of_month}, time=${b.time}, participants=${b.participants}, agenda_template=${b.agenda_template},
      requires_doc=${b.requires_doc}, linked_type=${b.linked_type}
    WHERE id = ${id} RETURNING *`;
  // Future planned occurrences follow the new schedule: drop them and let the next GET regenerate.
  await sql`DELETE FROM routine_occurrences WHERE routine_id = ${id} AND due_date > CURRENT_DATE AND status = 'planned' AND notes = '' AND meeting_id IS NULL`;
  logAudit({ entityType: "setting", entityId: id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `שגרה עודכנה: ${b.name}` });
  return NextResponse.json({ routine: row });
}

/** Soft delete — the routine and its history stay, it just stops generating occurrences. */
export async function DELETE(req: NextRequest) {
  const me = await adminOnly(req);
  if (!me) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  await ensureRoutinesSchema();
  const { id } = await req.json();
  await sql`UPDATE routines SET active = false WHERE id = ${Number(id)}`;
  await sql`DELETE FROM routine_occurrences WHERE routine_id = ${Number(id)} AND due_date > CURRENT_DATE AND status = 'planned' AND notes = '' AND meeting_id IS NULL`;
  logAudit({ entityType: "setting", entityId: Number(id), action: "delete", actorName: me?.name, actorEmail: me?.email, summary: "שגרה הושבתה" });
  return NextResponse.json({ ok: true });
}
