import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

/** Public — no auth. Resolves an event's public lead-capture slug to the minimal fields the /j/event/[slug] form needs. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ event: null });
  const rows = await sql`
    SELECT e.id, e.name, e.date, e.location, e.coordinator_id, c.name as coordinator_name
    FROM events e LEFT JOIN coordinators c ON c.id = e.coordinator_id
    WHERE e.slug = ${slug} LIMIT 1`;
  return NextResponse.json({ event: rows[0] || null });
}
