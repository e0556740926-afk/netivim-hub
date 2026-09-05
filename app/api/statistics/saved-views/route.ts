import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const rows = await sql`SELECT * FROM saved_pivot_queries ORDER BY created_at DESC`;
  return NextResponse.json({ saved: rows });
}

export async function POST(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const d = await req.json();
  if (!d.name || !d.query) return NextResponse.json({ error: "missing name/query" }, { status: 400 });
  const me = await currentUser(req);
  const rows = await sql`
    INSERT INTO saved_pivot_queries (name, query, created_by) VALUES (${d.name}, ${JSON.stringify(d.query)}::jsonb, ${me?.name || null})
    RETURNING *`;
  return NextResponse.json({ saved: rows[0] });
}

export async function DELETE(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await req.json();
  await sql`DELETE FROM saved_pivot_queries WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
