import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const [coords, admins] = await Promise.all([
    sql`SELECT c.id, c.name, c.user_id, c.area, 'coordinator' as type FROM coordinators c ORDER BY c.name`,
    sql`SELECT u.id, u.name, u.area, u.role as type FROM users u WHERE u.role IN ('admin','viewer') AND u.status='active' ORDER BY u.name`,
  ]);
  return NextResponse.json({ coordinators: coords, admins });
}
