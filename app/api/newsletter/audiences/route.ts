import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

/**
 * Four audiences per spec §12.1. "קהילת הורים" (newsletter subscribers)
 * isn't handled here — it's the existing newsletter_subscribers list,
 * already fully built; nothing new to query.
 */
const AUDIENCES = ["contacts_partners", "advisees", "parents"] as const;

function buildWhere(audience: string, filters: Record<string, string>) {
  const clauses: string[] = [];
  const values: any[] = [];
  let i = 1;
  const push = (col: string, val: string) => { clauses.push(`${col} = $${i++}`); values.push(val); };

  if (audience === "contacts_partners") {
    if (filters.type) push("type", filters.type);
    if (filters.owner) push("owner", filters.owner);
    clauses.unshift("deleted_at IS NULL");
  } else {
    // advisees / parents share the leads table
    clauses.unshift("deleted_at IS NULL");
    if (audience === "parents") clauses.push("is_parent = true");
    if (filters.city) push("city", filters.city);
    if (filters.sector) push("sector", filters.sector);
    if (filters.advisor_status) push("advisor_status", filters.advisor_status);
    if (filters.owner_name) push("owner_name", filters.owner_name);
    if (filters.source) push("source", filters.source);
  }
  return { where: clauses.length ? "WHERE " + clauses.join(" AND ") : "", values };
}

export async function GET(req: NextRequest) {
  const audience = req.nextUrl.searchParams.get("audience") || "";
  if (!AUDIENCES.includes(audience as any)) return NextResponse.json({ error: "unknown audience" }, { status: 400 });

  const filters: Record<string, string> = {};
  for (const key of ["type", "owner", "city", "sector", "advisor_status", "owner_name", "source"]) {
    const v = req.nextUrl.searchParams.get(key);
    if (v) filters[key] = v;
  }
  const { where, values } = buildWhere(audience, filters);
  const table = audience === "contacts_partners" ? "contacts" : "leads";

  const rows = await sql.query(`SELECT id, name, phone, email FROM ${table} ${where} ORDER BY name LIMIT 500`, values);
  const countRows = await sql.query(`SELECT count(*)::int AS n FROM ${table} ${where}`, values);

  return NextResponse.json({ recipients: rows, count: countRows[0].n });
}
