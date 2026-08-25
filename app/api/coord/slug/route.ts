import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ coord: null });
  const rows = await sql`SELECT id, name FROM coordinators WHERE slug = ${slug} LIMIT 1`;
  return NextResponse.json({ coord: rows[0] || null });
}
