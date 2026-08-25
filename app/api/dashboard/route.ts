import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const [coordinators, targets, leads, events, expenses, tasks, reports] = await Promise.all([
    sql`SELECT id, name, area, role FROM coordinators ORDER BY id`,
    sql`SELECT coordinator_id, target_leads FROM monthly_targets WHERE month = EXTRACT(MONTH FROM NOW()) AND year = EXTRACT(YEAR FROM NOW())`,
    sql`SELECT coordinator_id, created_at FROM leads WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
    sql`SELECT id, name, date, location, status, budget_planned, approved FROM events ORDER BY date`,
    sql`SELECT event_id, amount FROM expenses`,
    sql`SELECT status, due_date FROM tasks`,
    sql`SELECT coordinator_id FROM weekly_reports WHERE submitted_at > NOW() - INTERVAL '7 days'`,
  ]);
  return NextResponse.json({ coordinators, targets, leads, events, expenses, tasks, reports });
}
