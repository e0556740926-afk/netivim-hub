import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";

// Rough schematic (x,y) positions on a 0-100 canvas — not a real
// geographic projection, just enough to lay out the known cities in
// roughly the right relative arrangement. No population data source is
// available, so bubble size reflects lead count only, not population
// share (unlike the reference system's bubble map).
const CITY_POSITIONS: Record<string, { x: number; y: number }> = {
  "ירושלים": { x: 62, y: 62 }, "בני ברק": { x: 48, y: 38 }, "אשדוד": { x: 38, y: 68 },
  "בית שמש": { x: 55, y: 58 }, "מודיעין עילית": { x: 55, y: 48 }, "אלעד": { x: 50, y: 44 },
  "ביתר עילית": { x: 58, y: 55 }, "פתח תקווה": { x: 47, y: 34 },
};

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const rows = await sql`
    SELECT COALESCE(NULLIF(city, ''), 'לא ידוע') AS city, count(*)::int AS n
    FROM leads WHERE deleted_at IS NULL GROUP BY 1 ORDER BY n DESC`;

  const known = (rows as any[]).filter(r => CITY_POSITIONS[r.city]).map(r => ({ ...r, ...CITY_POSITIONS[r.city] }));
  const unknownCount = (rows as any[]).find(r => r.city === "לא ידוע")?.n || 0;
  const otherKnownButUnpositioned = (rows as any[]).filter(r => r.city !== "לא ידוע" && !CITY_POSITIONS[r.city]);

  return NextResponse.json({
    cities: known,
    unknown_city_count: unknownCount,
    unpositioned_cities: otherKnownButUnpositioned,
    note: "מפה סכמטית — לא הטלה גיאוגרפית מדויקת, וגודל הבועה משקף כמות לידים בלבד (אין נתון היקף אוכלוסייה חרדית לפי עיר במערכת).",
  });
}
