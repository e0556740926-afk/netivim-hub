import sql from "@/lib/db";

/**
 * Emails of users who may no longer act in the system (deleted or inactive).
 * Sessions are signed cookies valid for 7 days and middleware runs on the edge
 * without DB access, so a user deleted mid-session would otherwise keep
 * working until the cookie expires. Route handlers (Node runtime) check this
 * set through currentUser(). Cached for 60s; any DB failure fails open — auth
 * must never break because of this extra check.
 */
const TTL_MS = 60_000;
let cache: { at: number; emails: Set<string> } | null = null;

export function forgetBlockedCache() {
  cache = null;
}

export async function isBlockedEmail(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      const rows = await sql`SELECT lower(email) AS email FROM users WHERE status <> 'active' AND COALESCE(email,'') <> ''`;
      cache = { at: Date.now(), emails: new Set(rows.map((r: any) => String(r.email))) };
    }
    return cache.emails.has(email.toLowerCase());
  } catch {
    return false;
  }
}
