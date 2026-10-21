import sql from "@/lib/db";

export * from "@/lib/permission-matrix";
import type { UserCtx } from "@/lib/permission-matrix";

/**
 * Blanket write guard for "viewer" (finding #1): viewer is read-only
 * everywhere, full stop, regardless of module. Call this first in any
 * route that handles POST/PATCH/DELETE.
 */
export function viewerBlockedFromWrite(ctx: UserCtx, method: string): boolean {
  return ctx.role === "viewer" && method !== "GET";
}

/** Resolves a coordinator-role user's own coordinator row — the only leads they may ever see or write. */
export async function resolveOwnCoordinatorId(userId: number): Promise<number | null> {
  const [row] = await sql`SELECT id FROM coordinators WHERE user_id=${userId}`;
  return row?.id ?? null;
}
