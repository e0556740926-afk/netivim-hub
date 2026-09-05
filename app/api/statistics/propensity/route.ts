import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";

const MIN_SAMPLE = 3; // below this, the rate is statistical noise — shown but flagged, not ranked as reliable

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const rows = await sql`
    SELECT
      CASE WHEN age BETWEEN 15 AND 16 THEN '15-16' WHEN age BETWEEN 17 AND 18 THEN '17-18' WHEN age >= 19 THEN '19+' ELSE 'לא ידוע' END AS age_bucket,
      COALESCE(NULLIF(city, ''), 'לא ידוע') AS city,
      COALESCE(sector, 'לא ידוע') AS sector,
      source,
      count(*)::int AS total,
      count(*) FILTER (WHERE advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
    FROM leads WHERE deleted_at IS NULL
    GROUP BY 1, 2, 3, 4
    HAVING count(*) >= 1
    ORDER BY (count(*) FILTER (WHERE advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה')))::float / count(*) DESC`;

  const scored = (rows as any[]).map(r => ({
    ...r,
    placement_rate: r.total > 0 ? Math.round((r.placed / r.total) * 100) : 0,
    reliable: r.total >= MIN_SAMPLE,
  }));

  return NextResponse.json({
    combinations: scored,
    methodology: "שיעור המרה בפועל (שובצו÷סה\"כ) לכל שילוב גיל/עיר/מגזר/מקור, מהיסטוריית סטטוסים אמיתית — לא מודל למידת מכונה. שילובים עם פחות מ-3 תיקים מסומנים 'לא מהימן סטטיסטית' ולא רק מוסתרים, כדי לא ליצור רושם שווא של דגימה גדולה.",
  });
}
