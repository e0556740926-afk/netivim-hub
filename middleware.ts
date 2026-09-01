import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { getToken } from "next-auth/jwt";

/**
 * Routes reachable without a session.
 * Everything else under /api requires one.
 */
const PUBLIC_API = [
  "/api/auth",              // NextAuth (Google) — manages its own security
  "/api/session/login",
  "/api/session/logout",
  "/api/session/me",        // returns { user: null } when signed out
  "/api/calendar.ics",      // secured by its own secret token in the path
  "/api/coord/slug",        // needed by the public lead form to resolve a slug
];

/** Admin-only endpoints — a coordinator must not reach these. */
const ADMIN_ONLY: { path: string; methods?: string[] }[] = [
  { path: "/api/users" },
  { path: "/api/expenses" },
  { path: "/api/budget-sources" },
  { path: "/api/meetings" },
  { path: "/api/targets", methods: ["POST", "PATCH", "DELETE"] },
  { path: "/api/export" },
  // Manager-only task tooling: bulk actions across other people's
  // tasks, manual templates, and the recurring-series manager. A
  // coordinator keeps full access to /api/tasks itself (their own
  // tasks) plus comments/checklist on any task they can see.
  { path: "/api/tasks/bulk" },
  { path: "/api/tasks/series" },
  { path: "/api/task-templates" },
];

function isPublicApi(pathname: string) {
  return PUBLIC_API.some(p => pathname === p || pathname.startsWith(p + "/"));
}

async function getUser(req: NextRequest) {
  // 1) our own signed cookie
  const own = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (own) return own;

  // 2) NextAuth (Google) — verified JWT, carries the role
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token?.email) {
      return {
        id: Number((token as any).id) || 0,
        name: String((token as any).dbName || token.name || ""),
        email: String(token.email),
        role: String((token as any).role || "coordinator"),
        area: String((token as any).area || ""),
      };
    }
  } catch { /* fall through */ }

  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Public lead form: allow POST /api/leads only ────────────
  if (pathname === "/api/leads" && req.method === "POST") {
    return NextResponse.next();
  }

  // ── Public newsletter signup: allow POST /api/newsletter/subscribe only ──
  if (pathname === "/api/newsletter/subscribe" && req.method === "POST") {
    return NextResponse.next();
  }

  // ── API routes ──────────────────────────────────────────────
  if (pathname.startsWith("/api")) {
    if (isPublicApi(pathname)) return NextResponse.next();

    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    // Role gate
    if (user.role !== "admin") {
      const blocked = ADMIN_ONLY.find(
        r =>
          (pathname === r.path || pathname.startsWith(r.path + "/")) &&
          (!r.methods || r.methods.includes(req.method))
      );
      if (blocked) {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }
    }

    return NextResponse.next();
  }

  // ── Admin pages ─────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    const user = await getUser(req);
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    if (user.role === "coordinator") {
      const url = req.nextUrl.clone();
      url.pathname = "/coord/home";
      return NextResponse.redirect(url);
    }
  }

  // ── Coordinator pages ───────────────────────────────────────
  if (pathname.startsWith("/coord")) {
    const user = await getUser(req);
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/coord/:path*"],
};
