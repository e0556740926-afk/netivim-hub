import { NextRequest } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";

/** Returns true if the caller may access the statistics module. */
export async function canAccessStatistics(req: NextRequest): Promise<boolean> {
  const me = await currentUser(req);
  if (!me) return false;
  const [row] = await sql`SELECT role, team, is_ceo FROM users WHERE id=${me.id}`;
  if (!row || row.role !== "admin") return false;
  return !row.team || !!row.is_ceo; // no team = chief admin; is_ceo = CEO regardless of team
}
