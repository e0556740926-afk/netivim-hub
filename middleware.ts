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
  "/api/lead-sources/slug", // needed by the public source-distribution link to resolve a slug
  "/api/portal",            // external institution/advisee portals — secured by their own token in the URL, not a staff session
  "/api/whatsapp/webhook",  // called by Green API's servers, not a browser session — no cookie to check
];

/**
 * Central permission matrix, mirrored from lib/permissions.ts. Duplicated
 * here (not imported) on purpose: middleware runs on the Edge runtime,
 * and lib/permissions.ts pulls in the Neon DB client transitively via
 * lib/db.ts — importing it here risks an edge-bundling failure. This
 * copy covers path-level gating only (module NONE / read-only-can't-write);
 * row-level "own item" filtering (O/T) still happens inside the route
 * handlers themselves, which run in the Node.js runtime where DB access
 * is safe.
 */
type Role = "admin" | "ceo" | "rav" | "recruitment_manager" | "advisor" | "field_manager" | "coordinator" | "secretary" | "viewer";
const MODULE_MATRIX: Record<string, Partial<Record<Role, string>>> = {
  leads: { admin: "M", ceo: "R", recruitment_manager: "M", advisor: "O", field_manager: "R", coordinator: "O", secretary: "E", viewer: "R" },
  cases: { admin: "M", ceo: "R", rav: "R", recruitment_manager: "M", advisor: "O", field_manager: "R", coordinator: "O", secretary: "E", viewer: "R" },
  contacts: { admin: "M", ceo: "R", rav: "R", recruitment_manager: "M", advisor: "E", field_manager: "M", coordinator: "E", secretary: "E", viewer: "R" },
  events: { admin: "M", ceo: "R", recruitment_manager: "R", field_manager: "M", coordinator: "E", secretary: "R", viewer: "R" },
  tasks: { admin: "M", ceo: "R", rav: "O", recruitment_manager: "T", advisor: "O", field_manager: "T", coordinator: "O", secretary: "O", viewer: "R" },
  newsletters: { admin: "M", ceo: "M", recruitment_manager: "E", field_manager: "M", coordinator: "R", secretary: "E" },
  budget_main: { admin: "M", ceo: "M", recruitment_manager: "R", field_manager: "E", secretary: "E", viewer: "A" },
  budget_field: { admin: "M", ceo: "R", field_manager: "M", coordinator: "E" },
  reports: { admin: "M", ceo: "M", rav: "R", recruitment_manager: "T", advisor: "O", field_manager: "M", coordinator: "O", secretary: "R", viewer: "A" },
  advisor_management: { admin: "M", ceo: "R", recruitment_manager: "M", advisor: "R" },
  audit_log: { admin: "M", ceo: "R", recruitment_manager: "T" },
  settings_users: { admin: "M" },
};
/** Path prefix -> module name. Order matters: first match wins, so put more specific paths first. */
const PATH_TO_MODULE: [string, string][] = [
  ["/api/tasks/bulk", "settings_users"],   // manager-only tooling — keep admin-only regardless of the tasks row
  ["/api/tasks/series", "settings_users"],
  ["/api/task-templates", "settings_users"],
  ["/api/leads", "leads"],
  ["/api/contacts", "contacts"],
  ["/api/events", "events"],
  ["/api/tasks", "tasks"],
  ["/api/newsletter/audiences", "newsletters"],
  ["/api/expenses", "budget_main"],
  ["/api/budget-sources", "budget_main"],
  ["/api/budget", "budget_main"],
  ["/api/field-budget", "budget_field"],
  ["/api/admin/report-builder", "reports"],
  ["/api/admin/report-schedules", "reports"],
  ["/api/admin/advisors", "advisor_management"],
  ["/api/admin/call-qa", "advisor_management"],
  ["/api/audit-log", "audit_log"],
  ["/api/users", "settings_users"],
];
function moduleFor(pathname: string): string | null {
  for (const [prefix, mod] of PATH_TO_MODULE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return mod;
  }
  return null;
}
function levelFor(role: string, mod: string): string {
  return MODULE_MATRIX[mod]?.[role as Role] || "NONE";
}
function levelAllowsWrite(level: string): boolean {
  return level === "M" || level === "E" || level === "O" || level === "T";
}

/** Admin-only endpoints — a coordinator must not reach these. Fallback for anything not yet mapped to a module above. */
const ADMIN_ONLY: { path: string; methods?: string[] }[] = [
  { path: "/api/meetings" },
  { path: "/api/targets", methods: ["POST", "PATCH", "DELETE"] },
  { path: "/api/export" },
  { path: "/api/statistics" },
  { path: "/api/dashboards" },
  { path: "/api/admin" },
  // Row-level "own case" scoping for coordinator/advisor/rav isn't built
  // for these two yet (unlike leads) — kept strictly admin-only rather
  // than letting the matrix's "O" level through with no filtering behind it.
  { path: "/api/cases" },
  { path: "/api/referrals" },
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

    // Finding #1: viewer is read-only everywhere, enforced server-side —
    // not by hiding a button. Applies before the module gate below,
    // since a viewer must not write even to non-admin-only endpoints.
    if (user.role === "viewer" && req.method !== "GET") {
      return NextResponse.json({ error: "משתמש צופה — קריאה בלבד" }, { status: 403 });
    }

    // Module-matrix gate (finding #5): a path mapped to a module is
    // checked against the real per-role level, not the old blanket
    // "not coordinator = full access" rule. NONE blocks entirely; a
    // read-only level (R/A) blocks any non-GET method. Row-level "own
    // item" scoping (O/T) still happens inside the route handler.
    const mod = moduleFor(pathname);
    if (mod && user.role !== "admin") {
      const level = levelFor(user.role, mod);
      if (level === "NONE") {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }
      if (req.method !== "GET" && !levelAllowsWrite(level)) {
        return NextResponse.json({ error: "אין הרשאת כתיבה" }, { status: 403 });
      }
    }

    // Legacy admin-only fallback for paths not yet mapped to a module
    // above (e.g. organizations writes, which deliberately stay
    // admin-only regardless of the contacts matrix row — see comment
    // in PATH_TO_MODULE).
    if (!mod && user.role !== "admin") {
      const blocked = ADMIN_ONLY.find(
        r =>
          (pathname === r.path || pathname.startsWith(r.path + "/")) &&
          (!r.methods || r.methods.includes(req.method))
      );
      if (blocked) {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }
    }
    if (user.role !== "admin" && (pathname === "/api/organizations" || pathname.startsWith("/api/organizations/"))
      && ["POST", "PATCH"].includes(req.method)) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
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
