import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";

export async function GET(req: NextRequest) {
  if (!(await hasColumn("audit_log", "id"))) {
    return NextResponse.json({ entries: [], available: false });
  }
  const type = req.nextUrl.searchParams.get("entity_type");
  const id = req.nextUrl.searchParams.get("entity_id");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 300);

  let rows;
  if (type && id) {
    rows = await sql`
      SELECT * FROM audit_log
      WHERE entity_type=${type} AND entity_id=${parseInt(id)}
      ORDER BY created_at DESC LIMIT ${limit}`;
  } else {
    rows = await sql`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ${limit}`;
  }
  return NextResponse.json({ entries: rows, available: true });
}
