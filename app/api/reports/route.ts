import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`SELECT * FROM weekly_reports ORDER BY submitted_at DESC`;
  return NextResponse.json({ reports: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  await sql`
    INSERT INTO weekly_reports (coordinator_id, week_start, achievements, challenges, leads_count, next_week_plan)
    VALUES (${d.coordinator_id}, ${d.week_start}, ${d.achievements}, ${d.challenges||''}, ${d.leads_count||0}, ${d.next_week_plan})
  `;
  return NextResponse.json({ ok: true });
}
