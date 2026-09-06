import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";

/**
 * Median days spent in each stage transition (upgrade proposal §3.1) —
 * adds a time dimension the existing funnel (count + conversion %)
 * doesn't have. A transition's "start" is the previous status change
 * for that case, or the case's created_at if this was its first ever
 * transition (LAG() over case history, ordered by time).
 */
export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const rows = await sql`
    WITH ordered AS (
      SELECT h.case_id, h.from_status, h.to_status, h.changed_at,
        COALESCE(LAG(h.changed_at) OVER (PARTITION BY h.case_id ORDER BY h.changed_at), l.created_at) AS prev_at
      FROM case_status_history h JOIN leads l ON l.id = h.case_id
    )
    SELECT from_status, to_status,
      count(*)::int AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (changed_at - prev_at)) / 86400) AS median_days
    FROM ordered
    GROUP BY from_status, to_status
    ORDER BY median_days DESC NULLS LAST`;

  return NextResponse.json({
    transitions: rows,
    note: "מבוסס על case_status_history — ככל שיצטברו יותר מעברים אמיתיים, המספר יתייצב. עם מדגם קטן זה עשוי לקפוץ בין תיק לתיק.",
  });
}
