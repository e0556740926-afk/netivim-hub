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
  // Every $n we send must be referenced in the text: an unused parameter
  // makes Postgres fail with "could not determine data type of parameter $1"
  // (42P18). That is exactly what broke the card before audit_log.actor_id
  // existed — the fallback text dropped $1 but the param was still sent.
  const actorMatch = hasActorId ? "(a.actor_id = $1 OR a.actor_name = $2)" : "a.actor_name = $1";
  const feedWhere: string[] = [actorMatch];
  const feedParams: any[] = hasActorId ? [Number(metrics.user_id) || -1, metrics.name] : [metrics.name];
  const actorParamCount = feedParams.length;
  if (feedType) { feedParams.push(feedType); feedWhere.push(`a.entity_type = $${feedParams.length}`); }
  if (from)     { feedParams.push(from);     feedWhere.push(`a.created_at >= $${feedParams.length}`); }
  if (to)       { feedParams.push(to);       feedWhere.push(`a.created_at < ($${feedParams.length}::date + 1)`); }
  const whereSql = "WHERE " + feedWhere.join(" AND ");

  // Each list is loaded independently: one failing secondary query
  // (e.g. a column a migration hasn't added yet) shows an empty section
  // with a notice instead of taking the whole card down.
  const failed: string[] = [];
  const safe = <T,>(key: string, p: Promise<T>, fallback: T): Promise<T> =>
    p.catch(err => { console.error(`[coordinator card ${id}] ${key} failed:`, err?.message || err); failed.push(key); return fallback; });

  const [tasks, leads, events, reports, meetings, feed, feedCount, feedTypes] = await Promise.all([
    safe("tasks", Promise.resolve(sql`SELECT t.id, t.title, t.status, t.due_date, t.priority, t.type, t.created_at, e.name AS event_name, c.name AS contact_name
        FROM tasks t LEFT JOIN events e ON e.id = t.event_id LEFT JOIN contacts c ON c.id = t.contact_id
        WHERE ${metrics.name} = ANY(t.assignees) OR t.coordinator_id = ${id}
        ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.created_at DESC LIMIT 100`) as Promise<any[]>, [] as any[]),
    safe("leads", Promise.resolve(sql`SELECT id, name, phone, city, status, source, created_at FROM leads
        WHERE coordinator_id = ${id} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`) as Promise<any[]>, [] as any[]),
    safe("events", Promise.resolve(sql`SELECT id, name, date, location, status, approved, actual_attendees, leads_collected FROM events
        WHERE coordinator_id = ${id} ORDER BY date DESC NULLS LAST LIMIT 50`) as Promise<any[]>, [] as any[]),
    safe("reports", Promise.resolve(sql`SELECT * FROM weekly_reports WHERE coordinator_id = ${id} ORDER BY submitted_at DESC LIMIT 26`) as Promise<any[]>, [] as any[]),
    safe("meetings", Promise.resolve(sql`SELECT * FROM meetings WHERE coordinator_id = ${id} ORDER BY date DESC LIMIT 50`) as Promise<any[]>, [] as any[]),
    safe("feed", Promise.resolve(sql.query(`SELECT a.id, a.entity_type, a.entity_id, a.action, a.summary, a.created_at FROM audit_log a ${whereSql}
               ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, feedParams)) as Promise<any[]>, [] as any[]),
    safe("feedCount", Promise.resolve(sql.query(`SELECT count(*)::int AS n FROM audit_log a ${whereSql}`, feedParams)) as Promise<any[]>, [{ n: 0 }] as any[]),
    safe("feedTypes", Promise.resolve(sql.query(`SELECT a.entity_type, count(*)::int AS n FROM audit_log a WHERE ${actorMatch} GROUP BY a.entity_type ORDER BY n DESC`, feedParams.slice(0, actorParamCount)),) as Promise<any[]>, [] as any[]),
  ]);

  return NextResponse.json({
    coordinator: metrics,
    tasks, leads, events, reports, meetings,
    feed: { rows: feed, total: (feedCount as any[])[0]?.n ?? 0, page, page_size: pageSize, types: feedTypes },
    failed,
  });
}
