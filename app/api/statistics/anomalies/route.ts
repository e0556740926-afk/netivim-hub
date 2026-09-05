import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import { narrateAnomalies } from "@/lib/gemini";
import sql from "@/lib/db";

const MIN_HISTORY_MONTHS = 2; // need at least this many prior months to call something a "deviation"
const THRESHOLD = 0.5; // flag when current differs from historical average by more than 50% relatively

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const rows = await sql`
    SELECT c.name AS coordinator_name, to_char(l.created_at, 'YYYY-MM') AS month,
      count(*)::int AS leads,
      count(*) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
    FROM coordinators c JOIN leads l ON l.coordinator_id = c.id
    WHERE l.deleted_at IS NULL
    GROUP BY c.name, 2 ORDER BY c.name, 2`;

  const byCoordinator = new Map<string, { month: string; rate: number }[]>();
  for (const r of rows as any[]) {
    const rate = r.leads > 0 ? r.placed / r.leads : 0;
    if (!byCoordinator.has(r.coordinator_name)) byCoordinator.set(r.coordinator_name, []);
    byCoordinator.get(r.coordinator_name)!.push({ month: r.month, rate });
  }

  const anomalies: any[] = [];
  const insufficientData: string[] = [];
  for (const [name, months] of byCoordinator) {
    if (months.length <= MIN_HISTORY_MONTHS) { insufficientData.push(name); continue; }
    const current = months[months.length - 1];
    const history = months.slice(0, -1);
    const avg = history.reduce((s, m) => s + m.rate, 0) / history.length;
    if (avg === 0) continue;
    const deviation = (current.rate - avg) / avg;
    if (Math.abs(deviation) >= THRESHOLD) {
      anomalies.push({
        coordinator_name: name, month: current.month,
        current_rate: Math.round(current.rate * 100), historical_avg: Math.round(avg * 100),
        deviation_pct: Math.round(deviation * 100),
      });
    }
  }

  // Data-storytelling layer (spec §6) — best-effort: if Gemini is
  // unreachable or misbehaves, the numbers above are still shown
  // exactly as computed; narration is a pure addition, never a
  // dependency for the numeric result itself.
  const stories = await narrateAnomalies(anomalies);
  if (stories) anomalies.forEach((a, i) => { a.story = stories[i]; });

  return NextResponse.json({
    anomalies, insufficient_data_for: insufficientData,
    methodology: `סטייה של ${THRESHOLD * 100}%+ בשיעור ההמרה החודשי מול ממוצע ${MIN_HISTORY_MONTHS}+ החודשים הקודמים. רכזים עם פחות מ-${MIN_HISTORY_MONTHS + 1} חודשי היסטוריה לא נבדקים כלל — אין די נתונים לחשב 'ממוצע היסטורי' אמיתי.`,
  });
}
