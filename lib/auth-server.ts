import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { verifySession, SESSION_COOKIE, SessionUser } from "@/lib/session";

export const VIEW_AS_COOKIE = "netivim_view_as";

/**
 * "View as..." role preview (upgrade proposal §1) — a genuine, server-
 * enforced role override, not a cosmetic UI toggle. It only ever takes
 * effect on top of a *real* chief-admin session (role=admin, no team) —
 * checked here against the verified session, never trusted from the
 * cookie's own content — so nobody can grant themselves a broader role
 * by setting this cookie themselves. When active, the caller genuinely
 * gets the row-level scoping of the previewed role, which is exactly
 * what makes this useful as a permission-matrix test tool.
 */
function applyViewAsOverride(req: NextRequest, real: SessionUser): SessionUser {
  if (real.role !== "admin" || real.team) return real; // only a real chief admin may preview
  const raw = req.cookies.get(VIEW_AS_COOKIE)?.value;
  if (!raw) return real;
  try {
    const { role, team } = JSON.parse(raw);
    if (!role) return real;
    return { ...real, role, team: team || undefined };
  } catch {
    return real;
  }
}

/**
 * Identify the caller inside a route handler.
 * Accepts either our signed cookie session or a NextAuth (Google) JWT.
 * Middleware already rejected unauthenticated requests; this is for
 * handlers that need to know *who* is asking.
 */
export async function currentUser(req: NextRequest): Promise<SessionUser | null> {
  const own = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (own) return applyViewAsOverride(req, own);

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token?.email) {
      const real: SessionUser = {
        id: Number((token as any).id) || 0,
        name: String((token as any).dbName || token.name || ""),
        email: String(token.email),
        role: String((token as any).role || "coordinator"),
        area: String((token as any).area || ""),
      };
      return applyViewAsOverride(req, real);
    }
  } catch { /* ignore */ }

  return null;
}

export function isAdmin(u: SessionUser | null): boolean {
  return u?.role === "admin";
}

/**
 * The *real* underlying session, ignoring any active "view as" preview —
 * needed by the view-as management endpoint itself, since otherwise a
 * chief admin currently previewing a limited role couldn't reach the
 * endpoint that lets them exit the preview (currentUser() would report
 * them as that limited role).
 */
export async function realCurrentUser(req: NextRequest): Promise<SessionUser | null> {
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
