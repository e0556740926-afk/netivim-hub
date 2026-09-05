import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const [row] = await sql`
    SELECT
      count(*)::int AS inquiry,
      count(*) FILTER (WHERE advisor_status NOT IN ('פנייה חדשה'))::int AS process,
      (SELECT count(DISTINCT case_id)::int FROM referrals) AS referred,
      count(*) FILTER (WHERE advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed,
      count(*) FILTER (WHERE advisor_status = 'הסתיים בהצלחה')::int AS retained
    FROM leads WHERE deleted_at IS NULL`;

  return NextResponse.json({
    stages: [
      { key: "inquiry", label: "פנייה", value: row.inquiry },
      { key: "process", label: "תהליך", value: row.process },
      { key: "referred", label: "הפניה", value: row.referred },
      { key: "placed", label: "שיבוץ", value: row.placed },
      { key: "retained", label: "התמדה", value: row.retained },
    ],
    note: "\"התמדה\" מוגדר כאן כתיקים שהסתיימו בהצלחה (הסתיים בהצלחה) — לא כל \"שיבוץ\" בהכרח מסתיים כך.",
  });
}
