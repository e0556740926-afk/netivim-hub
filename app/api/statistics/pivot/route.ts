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

/**
 * Builds extra WHERE clauses from a validated filters object (per
 * lib/nl-query-schema PivotQuery["filters"], already mapped onto this
 * app's column names by the caller). Every value is parameterized —
 * nothing here is string-interpolated from user input.
 */
function buildFilterClauses(filters: Record<string, any> | undefined, startIndex: number, needsReferralJoin: boolean) {
  const clauses: string[] = [];
  const values: any[] = [];
  let i = startIndex;
  if (!filters) return { clauses, values, nextIndex: i };

  if (filters.age_range && Array.isArray(filters.age_range) && filters.age_range.length === 2) {
    clauses.push(`l.age BETWEEN $${i++} AND $${i++}`);
    values.push(filters.age_range[0], filters.age_range[1]);
  }
  if (filters.city?.length) { clauses.push(`l.city = ANY($${i++})`); values.push(filters.city); }
  if (filters.sector?.length) { clauses.push(`l.sector = ANY($${i++})`); values.push(filters.sector); }
  if (filters.source?.length) { clauses.push(`l.source = ANY($${i++})`); values.push(filters.source); }
  if (filters.case_status?.length) { clauses.push(`l.advisor_status = ANY($${i++})`); values.push(filters.case_status); }
  if (filters.placement_category?.length && needsReferralJoin) {
    clauses.push(`COALESCE(op.category, o.category, 'לא סווג') = ANY($${i++})`);
    values.push(filters.placement_category);
  }
  if (filters.date_range === "current_year") clauses.push(`date_trunc('year', l.created_at) = date_trunc('year', now())`);
  else if (filters.date_range === "current_quarter") clauses.push(`date_trunc('quarter', l.created_at) = date_trunc('quarter', now())`);
  else if (filters.date_range && typeof filters.date_range === "object" && filters.date_range.from) {
    clauses.push(`l.created_at::date BETWEEN $${i++} AND $${i++}`);
    values.push(filters.date_range.from, filters.date_range.to);
  }
  return { clauses, values, nextIndex: i };
}

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const dims = (req.nextUrl.searchParams.get("dims") || "").split(",").map(d => d.trim()).filter(Boolean);
  const valid = dims.filter(d => DIMENSIONS[d]);
  if (!valid.length || valid.length > 4) {
    return NextResponse.json({ error: "בחר בין 1 ל-4 ממדים מהרשימה: " + Object.keys(DIMENSIONS).join(", ") }, { status: 400 });
  }
  const needsReferralJoin = valid.includes("category") || req.nextUrl.searchParams.has("filters");
  const joinClause = needsReferralJoin ? "LEFT JOIN referrals r ON r.case_id = l.id AND r.status = 'התקבל' LEFT JOIN organizations o ON o.id = r.organization_id LEFT JOIN org_programs op ON op.id = r.program_id" : "";

  let filters: Record<string, any> | undefined;
  const filtersRaw = req.nextUrl.searchParams.get("filters");
  if (filtersRaw) {
    try { filters = JSON.parse(filtersRaw); } catch { return NextResponse.json({ error: "filters לא תקין" }, { status: 400 }); }
  }

  // Drawer support: same dimension expressions, filtered to one exact
  // combination instead of grouped — the row-level records behind one
  // pivot cell, per spec §3.1 ("the drawer reads the same query, not a
  // separate one that could disagree with the COUNT").
  const detailParam = req.nextUrl.searchParams.get("detail");
  if (detailParam !== null) {
    const values = detailParam.split("|||");
    if (values.length !== valid.length) return NextResponse.json({ error: "mismatched detail values" }, { status: 400 });
    const dimClauses = valid.map((d, i) => `(${DIMENSIONS[d]}) = $${i + 1}`);
    const { clauses: filterClauses, values: filterValues } = buildFilterClauses(filters, values.length + 1, needsReferralJoin);
    const detailQuery = `
      SELECT DISTINCT l.id, l.name, l.age, l.city, l.advisor_status
      FROM leads l ${joinClause}
      WHERE l.deleted_at IS NULL AND ${[...dimClauses, ...filterClauses].join(" AND ")}
      ORDER BY l.id DESC LIMIT 200`;
    const rows = await sql.query(detailQuery, [...values, ...filterValues]);
    return NextResponse.json({ rows });
  }

  const selectCols = valid.map((d, i) => `${DIMENSIONS[d]} AS dim${i}`).join(", ");
  const groupCols = valid.map((_, i) => `dim${i}`).join(", ");
  const { clauses: filterClauses, values: filterValues } = buildFilterClauses(filters, 1, needsReferralJoin);

  const query = `
    SELECT ${selectCols}, count(DISTINCT l.id)::int AS n
    FROM leads l
    ${joinClause}
    WHERE l.deleted_at IS NULL ${filterClauses.length ? "AND " + filterClauses.join(" AND ") : ""}
    GROUP BY ${groupCols}
    ORDER BY n DESC`;

  const rows = await sql.query(query, filterValues);
  return NextResponse.json({ dims: valid, rows });
}
