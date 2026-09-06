import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const [overall, byAdvisor] = await Promise.all([
    sql`
      SELECT count(*)::int AS sent, count(responded_at)::int AS responded,
        avg(personalized_score)::float AS avg_personalized, avg(nps)::float AS avg_nps
      FROM feedback_responses`,
    sql`
      SELECT owner_name,
        count(*)::int AS sent, count(responded_at)::int AS responded,
        round(avg(personalized_score)::numeric, 1) AS avg_personalized,
        round(avg(nps)::numeric, 1) AS avg_nps
      FROM feedback_responses WHERE owner_name IS NOT NULL
      GROUP BY owner_name ORDER BY responded DESC`,
  ]);

  return NextResponse.json({ overall: (overall as any[])[0], by_advisor: byAdvisor });
}
