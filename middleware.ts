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
  "/api/portal",            // external institution/advisee portals — secured by their own token in the URL, not a staff session
  "/api/whatsapp/webhook",  // called by Green API's servers, not a browser session — no cookie to check
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
  // New Netivim CRM foundation layer (2026-09-05): case/referral/budget
  // management is advisor & manager territory, not a coordinator screen.
  // Organizations stays readable by coordinators (contacts screen needs
  // it) but writes are admin-only.
  { path: "/api/organizations", methods: ["POST", "PATCH"] },
  { path: "/api/cases" },
  { path: "/api/referrals" },
  { path: "/api/budget" },
  { path: "/api/field-budget" },
  { path: "/api/newsletter/audiences" },
  { path: "/api/statistics" },
  { path: "/api/dashboards" },
  { path: "/api/admin" },
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

// Which /admin sub-paths belong to which team, mirroring the Sidebar
// groups. Paths not listed here (shared/exec pages) stay open to any admin.
const ADVISORS_TEAM_PATHS = ["/admin/leads", "/admin/cases", "/admin/organizations", "/admin/advisors-team", "/admin/call-center"];
const FIELD_TEAM_PATHS = ["/admin/contacts", "/admin/events", "/admin/reports",
  "/admin/dashboard", "/admin/targets", "/admin/leaderboard", "/admin/field-budget", "/admin/community-dashboard"];

function pathInGroup(pathname: string, group: string[]) {
  return group.some(p => pathname === p || pathname.startsWith(p + "/"));
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
    // Team managers (users.team = 'advisors' | 'field') are confined to
    // their own group's pages — real enforcement, not just a hidden nav
    // item. A chief admin (no team set) is unrestricted.
    const team = (user as any).team as string | undefined;
    if (team === "advisors" && pathInGroup(pathname, FIELD_TEAM_PATHS)) {
      const url = req.nextUrl.clone(); url.pathname = "/admin/leads";
      return NextResponse.redirect(url);
    }
    if (team === "field" && pathInGroup(pathname, ADVISORS_TEAM_PATHS)) {
      const url = req.nextUrl.clone(); url.pathname = "/admin/contacts";
      return NextResponse.redirect(url);
    }
    // Statistics ("the scary page") is CEO + chief admin only, per spec §13.1.
    if (pathname.startsWith("/admin/statistics") && team && !(user as any).isCeo) {
      const url = req.nextUrl.clone(); url.pathname = "/admin/dashboard";
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
