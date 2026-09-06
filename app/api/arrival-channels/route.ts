import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`SELECT id, label FROM arrival_channels WHERE active=true ORDER BY sort_order, label`;
  return NextResponse.json({ arrival_channels: rows });
}
