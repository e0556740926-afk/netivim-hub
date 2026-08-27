import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { verifySession, SESSION_COOKIE, SessionUser } from "@/lib/session";

/**
 * Identify the caller inside a route handler.
 * Accepts either our signed cookie session or a NextAuth (Google) JWT.
 * Middleware already rejected unauthenticated requests; this is for
 * handlers that need to know *who* is asking.
 */
export async function currentUser(req: NextRequest): Promise<SessionUser | null> {
  const own = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (own) return own;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token?.email) {
      return {
        id: Number((token as any).id) || 0,
        name: String((token as any).dbName || token.name || ""),
        email: String(token.email),
        role: String((token as any).role || "coordinator"),
        area: String((token as any).area || ""),
      };
    }
  } catch { /* ignore */ }

  return null;
}

export function isAdmin(u: SessionUser | null): boolean {
  return u?.role === "admin";
}
