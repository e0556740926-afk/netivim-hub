import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

function makeSlug(label: string, id: number) {
  const ascii = label.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return (ascii || "source") + "-" + id;
}

export async function GET() {
  const rows = await sql`
    SELECT ls.*, c.name AS coordinator_name FROM lead_sources ls
    LEFT JOIN coordinators c ON c.id = ls.coordinator_id
    ORDER BY ls.coordinator_id IS NULL, ls.label`;
  return NextResponse.json({ lead_sources: rows });
}

/** { label } — a custom "other" source, not tied to a coordinator. Always gets a personal distribution link. */
export async function POST(req: NextRequest) {
  const { label } = await req.json();
  if (!label) return NextResponse.json({ error: "missing label" }, { status: 400 });
  const rows = await sql`INSERT INTO lead_sources (label) VALUES (${label}) ON CONFLICT (label) DO NOTHING RETURNING *`;
  if (!rows[0]) return NextResponse.json({ lead_source: null });
  const slug = makeSlug(label, rows[0].id);
  const updated = await sql`UPDATE lead_sources SET slug=${slug} WHERE id=${rows[0].id} RETURNING *`;
  return NextResponse.json({ lead_source: updated[0] });
}

/** { id, active } */
export async function PATCH(req: NextRequest) {
  const { id, active } = await req.json();
  await sql`UPDATE lead_sources SET active=${active} WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
