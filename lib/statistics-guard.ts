import { NextRequest } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { accessLevel } from "@/lib/permissions";

/**
 * Returns true if the caller may access the statistics module.
 * Finding #3 from the permissions audit: this used to be a separate,
 * stricter `role === 'admin'` check that disagreed with the generic
 * "any non-coordinator" rule used everywhere else. It now reads the
 * same central matrix as every other module (lib/permissions.ts) —
 * admin, ceo, recruitment_manager, and field_manager all get "M" there;
 * every other role (including a plain admin with no matching row, rav,
 * advisor, coordinator, secretary, viewer) is blocked.
 */
export async function canAccessStatistics(req: NextRequest): Promise<boolean> {
  const me = await currentUser(req);
  if (!me) return false;
  const [row] = await sql`SELECT role, team FROM users WHERE id=${me.id}`;
  if (!row) return false;
  return accessLevel({ id: me.id, role: row.role, team: row.team }, "statistics") !== "NONE";
}
