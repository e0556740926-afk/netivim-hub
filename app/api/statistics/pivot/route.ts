import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";

/**
 * Whitelisted dimension expressions — the only way a client-chosen
 * "dimension" name reaches SQL, so this can never become an injection
 * vector no matter what a caller sends in `dims`.
 */
const DIMENSIONS: Record<string, string> = {
  age_bucket: "CASE WHEN l.age BETWEEN 15 AND 16 THEN '15-16' WHEN l.age BETWEEN 17 AND 18 THEN '17-18' WHEN l.age >= 19 THEN '19+' ELSE 'לא ידוע' END",
  city: "COALESCE(NULLIF(l.city, ''), 'לא ידוע')",
  sector: "COALESCE(l.sector, 'לא ידוע')",
  source: "l.source",
  advisor_status: "l.advisor_status",
  category: "COALESCE(op.category, o.category, 'לא סווג')",
};

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const dims = (req.nextUrl.searchParams.get("dims") || "").split(",").map(d => d.trim()).filter(Boolean);
  const valid = dims.filter(d => DIMENSIONS[d]);
  if (!valid.length || valid.length > 4) {
    return NextResponse.json({ error: "בחר בין 1 ל-4 ממדים מהרשימה: " + Object.keys(DIMENSIONS).join(", ") }, { status: 400 });
  }
  const needsReferralJoin = valid.includes("category");
  const selectCols = valid.map((d, i) => `${DIMENSIONS[d]} AS dim${i}`).join(", ");
  const groupCols = valid.map((_, i) => `dim${i}`).join(", ");

  const query = `
    SELECT ${selectCols}, count(DISTINCT l.id)::int AS n
    FROM leads l
    ${needsReferralJoin ? "LEFT JOIN referrals r ON r.case_id = l.id AND r.status = 'התקבל' LEFT JOIN organizations o ON o.id = r.organization_id LEFT JOIN org_programs op ON op.id = r.program_id" : ""}
    WHERE l.deleted_at IS NULL
    GROUP BY ${groupCols}
    ORDER BY n DESC`;

  const rows = await sql.query(query);
  return NextResponse.json({ dims: valid, rows });
}
