import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";

/** Monday of the week containing `weekStr` (or of last week when omitted). */
function weekBounds(weekStr?: string | null) {
  let start: Date;
  if (weekStr) {
    start = new Date(weekStr + "T00:00:00");
    const dow = start.getDay();               // 0 = Sunday
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
  } else {
    start = new Date();
    const dow = start.getDay();
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { ws: start.toISOString().slice(0, 10), we: end.toISOString().slice(0, 10) };
}

export async function GET(req: NextRequest) {
  const coordId = req.nextUrl.searchParams.get("coordinator_id");
  if (!coordId) return NextResponse.json({ error: "missing coordinator_id" }, { status: 400 });
  const cid = parseInt(coordId, 10);
  if (Number.isNaN(cid)) return NextResponse.json({ error: "bad coordinator_id" }, { status: 400 });

  const { ws, we } = weekBounds(req.nextUrl.searchParams.get("week"));

  // Coordinator first — the tasks query needs the name.
  const coordRows = await sql`
    SELECT c.*, u.email FROM coordinators c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.id = ${cid} LIMIT 1`;
  const coordinator: any = coordRows[0] || null;
  if (!coordinator) return NextResponse.json({ error: "coordinator not found" }, { status: 404 });

  // A coordinator may only read their own report; admins may read any.
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  if (!isAdmin(me) && coordinator.user_id !== me.id && coordinator.email !== me.email) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  const coordName: string = coordinator.name;

  const [leads, interactions, tasksRows, reportRows, events, contacts] = await Promise.all([
    sql`SELECT * FROM leads
        WHERE coordinator_id = ${cid}
          AND created_at::date BETWEEN ${ws} AND ${we}
        ORDER BY created_at`,

    sql`SELECT i.*, c.name AS contact_name, c.org AS contact_org
        FROM interactions i
        LEFT JOIN contacts c ON c.id = i.contact_id
        WHERE i.coordinator_id = ${cid}
          AND i.date BETWEEN ${ws} AND ${we}
        ORDER BY i.date`,

    // Tasks belonging to this coordinator that touch the week:
    // due in it, created in it, or still open and already overdue.
    sql`SELECT * FROM tasks
        WHERE (coordinator_id = ${cid} OR ${coordName} = ANY(assignees))
          AND (
            due_date BETWEEN ${ws} AND ${we}
            OR created_at::date BETWEEN ${ws} AND ${we}
            OR (status <> 'done' AND due_date < ${ws})
          )
        ORDER BY due_date NULLS LAST`,

    sql`SELECT * FROM weekly_reports
        WHERE coordinator_id = ${cid} AND week_start BETWEEN ${ws} AND ${we}
        ORDER BY submitted_at DESC LIMIT 1`,

    sql`SELECT * FROM events
        WHERE coordinator_id = ${cid} AND date BETWEEN ${ws} AND ${we}
        ORDER BY date`,

    sql`SELECT * FROM contacts
        WHERE (coordinator_id = ${cid} OR owner = ${coordName})
          AND last_contact BETWEEN ${ws} AND ${we}
        ORDER BY last_contact DESC`,
  ]);

  const asDate = (v: any) =>
    v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null;

  const all = tasksRows as any[];
  const done = all.filter(t => t.status === "done");
  const late = all.filter(t => {
    const d = asDate(t.due_date);
    return t.status !== "done" && d !== null && d < we;
  });
  const lateIds = new Set(late.map(t => t.id));
  const inProgress = all.filter(
    t => (t.status === "inprogress" || t.status === "waiting") && !lateIds.has(t.id)
  );
  const todo = all.filter(t => t.status === "todo" && !lateIds.has(t.id));

  const leadsScore  = Math.min(leads.length * 5, 30);
  const intScore    = Math.min(interactions.length * 8, 30);
  const taskScore   = Math.min(done.length * 5, 20);
  const reportScore = reportRows.length > 0 ? 20 : 0;

  return NextResponse.json({
    coordinator,
    week: { start: ws, end: we },
    leads,
    interactions,
    tasks: { done, inProgress, late, todo, all },
    report: reportRows[0] || null,
    events,
    contacts,
    score: {
      total: leadsScore + intScore + taskScore + reportScore,
      leads: leadsScore, interactions: intScore, tasks: taskScore, report: reportScore,
    },
  });
}
