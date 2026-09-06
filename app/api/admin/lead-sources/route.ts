import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`
    SELECT ls.*, c.name AS coordinator_name FROM lead_sources ls
    LEFT JOIN coordinators c ON c.id = ls.coordinator_id
    ORDER BY ls.coordinator_id IS NULL, ls.label`;
  return NextResponse.json({ lead_sources: rows });
}

/** { label } — a custom "other" source, not tied to a coordinator. */
export async function POST(req: NextRequest) {
  const { label } = await req.json();
  if (!label) return NextResponse.json({ error: "missing label" }, { status: 400 });
  const rows = await sql`INSERT INTO lead_sources (label) VALUES (${label}) ON CONFLICT (label) DO NOTHING RETURNING *`;
  return NextResponse.json({ lead_source: rows[0] || null });
}

/** { id, active } */
export async function PATCH(req: NextRequest) {
  const { id, active } = await req.json();
  await sql`UPDATE lead_sources SET active=${active} WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
