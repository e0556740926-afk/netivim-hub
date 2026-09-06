import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";

/**
 * Simple single-dimension conversion tables (upgrade proposal §3.2) —
 * same underlying data as "דירוג נטייה" (which cross-tabulates 4
 * dimensions at once), just split into two plain, quickly-readable
 * tables: by lead_sources.label and by coordinator, each on its own.
 */
export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const [bySource, byCoordinator] = await Promise.all([
    sql`
      SELECT ls.label,
        count(l.id)::int AS total,
        count(l.id) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
      FROM lead_sources ls LEFT JOIN leads l ON l.lead_source_id = ls.id AND l.deleted_at IS NULL
      GROUP BY ls.label HAVING count(l.id) > 0
      ORDER BY placed DESC`,
    sql`
      SELECT c.name AS coordinator_name,
        count(l.id)::int AS total,
        count(l.id) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
      FROM coordinators c LEFT JOIN leads l ON l.coordinator_id = c.id AND l.deleted_at IS NULL
      GROUP BY c.name HAVING count(l.id) > 0
      ORDER BY placed DESC`,
  ]);

  const withRate = (rows: any[]) => rows.map(r => ({ ...r, rate: r.total > 0 ? Math.round((r.placed / r.total) * 100) : 0 }));
  return NextResponse.json({ by_source: withRate(bySource as any[]), by_coordinator: withRate(byCoordinator as any[]) });
}
