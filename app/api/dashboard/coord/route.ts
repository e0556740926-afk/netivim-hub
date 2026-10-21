import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser } from "@/lib/auth-server";

/**
 * Coordinator home dashboard, one request. A coordinator can only ever
 * read their own card (resolved from their session, the query param is
 * ignored for them); an admin may pass ?coordinator_id= to preview any.
 */
export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });

  let coordId: number | null = null;
  if (me.role === "coordinator") {
    const [own] = await sql`SELECT id FROM coordinators WHERE user_id=${me.id} LIMIT 1`;
    coordId = own?.id ?? null;
  } else {
    const q = Number(req.nextUrl.searchParams.get("coordinator_id"));
    coordId = q || null;
  }
  if (!coordId) return NextResponse.json({ coord: null });

  const hasPriority = await hasColumn("tasks", "priority");
  const priorityCol = hasPriority ? "t.priority" : "'normal'";

  const [coord] = await sql`SELECT id, name, area, slug, user_id FROM coordinators WHERE id=${coordId} LIMIT 1`;
  if (!coord) return NextResponse.json({ coord: null });

  const [targetRows, leadCount, linkCount, tasks, events, contacts, latestLeads] = await Promise.all([
    sql`SELECT target_leads FROM monthly_targets WHERE coordinator_id=${coordId}
        AND month = EXTRACT(MONTH FROM now())::int AND year = EXTRACT(YEAR FROM now())::int LIMIT 1`,
    sql`SELECT count(*)::int AS n FROM leads WHERE coordinator_id=${coordId} AND deleted_at IS NULL
        AND date_trunc('month', created_at) = date_trunc('month', now())`,
    sql`SELECT count(*)::int AS n FROM leads WHERE coordinator_id=${coordId} AND deleted_at IS NULL AND source='link'`,
    sql.query(`
      SELECT t.id, t.title, t.due_date, t.status, ${priorityCol} AS priority, c.name AS contact_name, e.name AS event_name
      FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id LEFT JOIN events e ON e.id = t.event_id
      WHERE t.status <> 'done' AND ($1 = ANY(t.assignees) OR t.coordinator_id = $2)
      ORDER BY t.due_date NULLS LAST, ${priorityCol} = 'urgent' DESC LIMIT 40`,
      [coord.name, coordId]),
    sql`SELECT id, name, date, time, location, status, approved FROM events
        WHERE coordinator_id=${coordId} AND status NOT IN ('done','cancelled')
        ORDER BY date NULLS LAST LIMIT 6`,
    sql`SELECT id, name, org, status, last_contact FROM contacts
        WHERE coordinator_id=${coordId} AND deleted_at IS NULL AND status NOT IN ('irrelevant')
          AND (last_contact IS NULL OR last_contact < CURRENT_DATE - 60)
        ORDER BY last_contact NULLS FIRST LIMIT 8`,
    sql`SELECT id, name, city, created_at, source, status FROM leads
        WHERE coordinator_id=${coordId} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 6`,
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const norm = (t: any) => ({ ...t, due_date: t.due_date ? String(t.due_date instanceof Date ? t.due_date.toISOString() : t.due_date).slice(0, 10) : null });
  const taskRows = (tasks as any[]).map(norm);

  return NextResponse.json({
    coord,
    target: Number(targetRows[0]?.target_leads) || 0,
    leads_this_month: leadCount[0]?.n ?? 0,
    link_leads: linkCount[0]?.n ?? 0,
    tasks: {
      overdue: taskRows.filter(t => t.due_date && t.due_date < today),
      today: taskRows.filter(t => t.due_date === today),
      later: taskRows.filter(t => !t.due_date || t.due_date > today),
    },
    events,
    contacts_cold: contacts,
    latest_leads: latestLeads,
  });
}
