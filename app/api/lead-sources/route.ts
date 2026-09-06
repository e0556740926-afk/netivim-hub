import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`
    SELECT ls.id, ls.label, ls.coordinator_id, ls.active FROM lead_sources ls
    WHERE ls.active = true
    ORDER BY ls.coordinator_id IS NULL, ls.label`;
  return NextResponse.json({ lead_sources: rows });
}
