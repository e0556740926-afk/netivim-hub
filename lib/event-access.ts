import { NextRequest } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import type { SessionUser } from "@/lib/session";

/**
 * Event access. Since Nov 2026 coordinators have the same event
 * permissions as managers (see, edit, approve, registration form,
 * attendees, delete) on every event — not only their own. Module-level
 * gating (read-only roles can't write) stays in middleware.
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

/** True when the caller may act on this event — managers and coordinators alike, on any event. */
export async function canTouchEvent(req: NextRequest, _eventId: number): Promise<{ ok: boolean; scope: Awaited<ReturnType<typeof eventScope>> }> {
  const scope = await eventScope(req);
  return { ok: true, scope };
}
