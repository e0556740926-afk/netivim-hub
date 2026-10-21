import { NextRequest, NextResponse } from "next/server";
import { coordinatorMetrics, monthRange } from "@/lib/coordinator-metrics";

/**
 * GET /api/admin/coordinators/compare?month=YYYY-MM
 * One row per coordinator with every metric + engagement traffic light.
 * Admin-only (middleware's /api/admin fallback).
 */
export async function GET(req: NextRequest) {
  const ym = req.nextUrl.searchParams.get("month");
  const { year, month } = monthRange(ym);
  const rows = await coordinatorMetrics(ym);
  const totals = rows.reduce((t, r) => ({
    leads: t.leads + r.leads_month,
    target: t.target + r.target_leads,
    tasks_open: t.tasks_open + r.tasks_open,
    tasks_overdue: t.tasks_overdue + r.tasks_overdue,
    red: t.red + (r.light === "red" ? 1 : 0),
    yellow: t.yellow + (r.light === "yellow" ? 1 : 0),
    green: t.green + (r.light === "green" ? 1 : 0),
  }), { leads: 0, target: 0, tasks_open: 0, tasks_overdue: 0, red: 0, yellow: 0, green: 0 });
  return NextResponse.json({ year, month, coordinators: rows, totals });
}
