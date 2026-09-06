import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  if (!(await hasColumn("audit_log", "id"))) {
    return NextResponse.json({ entries: [], available: false });
  }
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("entity_type");
  const id = req.nextUrl.searchParams.get("entity_id");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 300);

  // T-level (permissions matrix, "audit_log" row): recruitment_manager
  // sees only entries actioned by themselves or their direct reports
  // (users.reports_to), never the whole org's audit trail.
  if (me.role === "recruitment_manager") {
    const reportNames = await sql`SELECT name FROM users WHERE reports_to=${me.id}`;
    const names = [me.name, ...(reportNames as any[]).map(r => r.name)];
    const rows = type && id
      ? await sql`SELECT * FROM audit_log WHERE entity_type=${type} AND entity_id=${parseInt(id)} AND actor_name = ANY(${names}) ORDER BY created_at DESC LIMIT ${limit}`
      : await sql`SELECT * FROM audit_log WHERE actor_name = ANY(${names}) ORDER BY created_at DESC LIMIT ${limit}`;
    return NextResponse.json({ entries: rows, available: true, team_scoped: true });
  }

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
