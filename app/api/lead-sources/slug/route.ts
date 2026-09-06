import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ source: null });
  const [row] = await sql`SELECT id, label, coordinator_id FROM lead_sources WHERE slug=${slug} AND active=true`;
  return NextResponse.json({ source: row || null });
}
