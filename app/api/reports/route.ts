import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`
    SELECT r.*, c.name as coordinator_name, c.area FROM weekly_reports r
    JOIN coordinators c ON c.id=r.coordinator_id
    ORDER BY r.submitted_at DESC`;
  return NextResponse.json({ reports: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  await sql`
    INSERT INTO weekly_reports (coordinator_id,week_start,achievements,challenges,leads_count,next_week_plan)
    VALUES (${d.coordinator_id},${d.week_start},${d.achievements},${d.challenges||''},${d.leads_count||0},${d.next_week_plan})`;
  return NextResponse.json({ ok: true });
}