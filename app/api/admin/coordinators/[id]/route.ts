import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { coordinatorMetrics } from "@/lib/coordinator-metrics";

/**
 * GET /api/admin/coordinators/[id]?month=YYYY-MM&feed_type=&from=&to=&page=&page_size=
 * The full coordinator card: profile + metrics (for the month), lists
 * (tasks / leads / events / reports / meetings) and a paginated activity
 * feed from audit_log. Admin-only (middleware's /api/admin fallback).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const q = req.nextUrl.searchParams;
  const ym = q.get("month");
  const feedType = q.get("feed_type") || "";       // entity_type filter ('' = all)
  const from = q.get("from") || "";
  const to = q.get("to") || "";
  const page = Math.max(1, Number(q.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(q.get("page_size")) || 30));

  const [metrics] = await coordinatorMetrics(ym, id);
  if (!metrics) return NextResponse.json({ error: "not found" }, { status: 404 });

  const hasActorId = await hasColumn("audit_log", "actor_id");
  const actorMatch = hasActorId ? "(a.actor_id = $1 OR a.actor_name = $2)" : "a.actor_name = $2";
  const feedWhere: string[] = [actorMatch];
  const feedParams: any[] = [metrics.user_id ?? -1, metrics.name];
  if (feedType) { feedParams.push(feedType); feedWhere.push(`a.entity_type = $${feedParams.length}`); }
  if (from)     { feedParams.push(from);     feedWhere.push(`a.created_at >= $${feedParams.length}`); }
  if (to)       { feedParams.push(to);       feedWhere.push(`a.created_at < ($${feedParams.length}::date + 1)`); }
  const whereSql = "WHERE " + feedWhere.join(" AND ");

  const [tasks, leads, events, reports, meetings, feed, feedCount, feedTypes] = await Promise.all([
    sql`SELECT t.id, t.title, t.status, t.due_date, t.priority, t.type, t.created_at, e.name AS event_name, c.name AS contact_name
        FROM tasks t LEFT JOIN events e ON e.id = t.event_id LEFT JOIN contacts c ON c.id = t.contact_id
        WHERE ${metrics.name} = ANY(t.assignees) OR t.coordinator_id = ${id}
        ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.created_at DESC LIMIT 100`,
    sql`SELECT id, name, phone, city, status, source, created_at FROM leads
        WHERE coordinator_id = ${id} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT id, name, date, location, status, approved, actual_attendees, leads_collected FROM events
        WHERE coordinator_id = ${id} ORDER BY date DESC NULLS LAST LIMIT 50`,
    sql`SELECT * FROM weekly_reports WHERE coordinator_id = ${id} ORDER BY submitted_at DESC LIMIT 26`,
    sql`SELECT * FROM meetings WHERE coordinator_id = ${id} ORDER BY date DESC LIMIT 50`,
    sql.query(`SELECT a.id, a.entity_type, a.entity_id, a.action, a.summary, a.created_at FROM audit_log a ${whereSql}
               ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, feedParams),
    sql.query(`SELECT count(*)::int AS n FROM audit_log a ${whereSql}`, feedParams),
    sql.query(`SELECT a.entity_type, count(*)::int AS n FROM audit_log a WHERE ${actorMatch} GROUP BY a.entity_type ORDER BY n DESC`, feedParams.slice(0, 2)),
  ]);

  return NextResponse.json({
    coordinator: metrics,
    tasks, leads, events, reports, meetings,
    feed: { rows: feed, total: (feedCount as any[])[0]?.n ?? 0, page, page_size: pageSize, types: feedTypes },
  });
}
