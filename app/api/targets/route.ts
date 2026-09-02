import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const [coordinators, targets, leads] = await Promise.all([
    sql`SELECT id, name, area FROM coordinators ORDER BY id`,
    sql`SELECT coordinator_id, target_leads FROM monthly_targets WHERE month = ${month} AND year = ${year}`,
    sql`SELECT coordinator_id, event_id FROM leads WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
  ]);
  return NextResponse.json({ coordinators, targets, leads });
}

export async function POST(req: NextRequest) {
  const { coordinator_id, target_leads } = await req.json();
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  await sql`
    INSERT INTO monthly_targets (coordinator_id, month, year, target_leads)
    VALUES (${coordinator_id}, ${month}, ${year}, ${target_leads})
    ON CONFLICT (coordinator_id, month, year) DO UPDATE SET target_leads = ${target_leads}
  `;
  return NextResponse.json({ ok: true });
}
