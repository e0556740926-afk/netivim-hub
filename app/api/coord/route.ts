import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("user_id");
  if (!uid) return NextResponse.json({ coord: null });
  const rows = await sql`SELECT * FROM coordinators WHERE user_id = ${parseInt(uid)} LIMIT 1`;
  return NextResponse.json({ coord: rows[0] || null });
}
