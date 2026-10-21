import { NextRequest } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import type { SessionUser } from "@/lib/session";

/**
 * Row-level scoping for events, mirroring the leads pattern: a
 * coordinator may only touch events whose coordinator_id is their own
 * coordinators row. Everyone else (admin and the other staff roles,
 * which middleware already gates at module level) passes through.
 *
 * Returns the caller plus their own coordinator id (null for non-
 * coordinators) so routes can also force coordinator_id on inserts.
 */
export async function eventScope(req: NextRequest): Promise<{ me: SessionUser | null; ownCoordId: number | null; isCoordinator: boolean }> {
  const me = await currentUser(req);
  if (me?.role !== "coordinator") return { me, ownCoordId: null, isCoordinator: false };
  const [own] = await sql`SELECT id FROM coordinators WHERE user_id=${me.id} LIMIT 1`;
  return { me, ownCoordId: own?.id ?? null, isCoordinator: true };
}

/** True when the caller may act on this event (admin, or the owning coordinator). */
export async function canTouchEvent(req: NextRequest, eventId: number): Promise<{ ok: boolean; scope: Awaited<ReturnType<typeof eventScope>> }> {
  const scope = await eventScope(req);
  if (!scope.isCoordinator) return { ok: true, scope };
  if (!scope.ownCoordId) return { ok: false, scope };
  const [ev] = await sql`SELECT coordinator_id FROM events WHERE id=${eventId} LIMIT 1`;
  return { ok: !!ev && ev.coordinator_id === scope.ownCoordId, scope };
}
