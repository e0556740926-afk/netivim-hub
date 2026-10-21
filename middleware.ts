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
  "/api/arrival-channels",  // needed by public lead-capture forms (/j, /s) — read-only, no PII
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
  contacts: { admin: "M", ceo: "R", rav: "R", recruitment_manager: "M", advisor: "E", field_manager: "M", coordinator: "E", secretary: "E", viewer: "R" },
  events: { admin: "M", ceo: "R", recruitment_manager: "R", field_manager: "M", coordinator: "E", secretary: "R", viewer: "R" },
  tasks: { admin: "M", ceo: "R", rav: "O", recruitment_manager: "T", advisor: "O", field_manager: "T", coordinator: "O", secretary: "O", viewer: "R" },
  newsletters: { admin: "M", ceo: "M", recruitment_manager: "E", field_manager: "M", coordinator: "R", secretary: "E" },
  budget_main: { admin: "M", ceo: "M", recruitment_manager: "R", field_manager: "E", secretary: "E", viewer: "A" },
  reports: { admin: "M", ceo: "M", rav: "R", recruitment_manager: "T", advisor: "O", field_manager: "M", coordinator: "O", secretary: "R", viewer: "A" },
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
  ["/api/routines", "reports"],      // manager routines — admins write, coordinators read (reports row: coordinator = O)
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
  { path: "/api/admin" },
];

function isPublicApi(pathname: string) {
  return PUBLIC_API.some(p => pathname === p || pathname.startsWith(p + "/"));
}

const VIEW_AS_COOKIE = "netivim_view_as";

/**
 * "View as..." preview override, mirrored from lib/auth-server.ts (kept
 * as a local copy here for the same edge-runtime-safety reason as the
 * permission matrix above — this file avoids any import that could drag
 * in a DB client). Only ever applies on top of a genuine chief-admin
 * session; the cookie's own content is never trusted on its own.
 */
function applyViewAsOverride(req: NextRequest, real: any) {
  if (real.role !== "admin" || real.team) return real;
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

async function getUser(req: NextRequest) {
  // 1) our own signed cookie
  const own = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (own) return applyViewAsOverride(req, own);

  // 2) NextAuth (Google) — verified JWT, carries the role
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token?.email) {
      const real = {
        id: Number((token as any).id) || 0,
        name: String((token as any).dbName || token.name || ""),
        email: String(token.email),
        role: String((token as any).role || "coordinator"),
        area: String((token as any).area || ""),
      };
      return applyViewAsOverride(req, real);
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

    // The "view as" preview endpoint must always be reachable, including
    // while a preview is already active — otherwise a chief admin
    // previewing e.g. "coordinator" would see the overridden role here
    // too and get locked out of the very endpoint that ends the preview.
    // The route itself re-checks the *real* session before doing anything.
    if (pathname === "/api/admin/view-as") return NextResponse.next();

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
    // above.
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
