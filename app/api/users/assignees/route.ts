import { NextResponse } from "next/server";
import sql from "@/lib/db";

// Returns all active users who can be assigned tasks/leads
export async function GET() {
  const [coordinators, managers] = await Promise.all([
    sql`SELECT id, name, 'coordinator' as role FROM coordinators ORDER BY name`,
    sql`SELECT id, name, role FROM users WHERE role IN ('admin','viewer') AND status='active' ORDER BY name`,
  ]);
  return NextResponse.json({ coordinators, managers });
}
