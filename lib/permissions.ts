import sql from "@/lib/db";

export type Role = "admin" | "ceo" | "rav" | "recruitment_manager" | "advisor" | "field_manager" | "coordinator" | "secretary" | "viewer";
export type ModuleName =
  | "leads" | "cases" | "case_protected" | "contacts" | "events" | "tasks"
  | "newsletters" | "budget_main" | "budget_field" | "statistics" | "reports"
  | "advisor_management" | "audit_log" | "settings_users";

export interface UserCtx { id: number; role: string; team?: string | null }

/**
 * Central permission gate — every module's API route calls this instead
 * of checking `role === ...` itself. Levels match the matrix in the
 * permissions spec (§4): M=full, E=partial edit, R=read-only, O=own
 * items only, T=own team, A=aggregate/no-PII, NONE=blocked.
 *
 * This is a first pass covering the 5 concrete findings from the audit
 * (viewer writes, protected-info leakage, statistics inconsistency,
 * coordinator scoping, the four new roles behaving like admin) — not
 * yet every cell of the full matrix. Modules not listed here still fall
 * back to the older per-route checks until they're migrated onto this.
 */
const MATRIX: Record<ModuleName, Partial<Record<Role, "M" | "E" | "R" | "O" | "T" | "A" | "NONE">>> = {
  leads: { admin: "M", ceo: "R", recruitment_manager: "M", advisor: "O", field_manager: "R", coordinator: "O", secretary: "E", viewer: "R" },
  cases: { admin: "M", ceo: "R", rav: "R", recruitment_manager: "M", advisor: "O", field_manager: "R", coordinator: "O", secretary: "E", viewer: "R" },
  case_protected: { admin: "M", rav: "R", recruitment_manager: "R", advisor: "O", viewer: "NONE" },
  contacts: { admin: "M", ceo: "R", rav: "R", recruitment_manager: "M", advisor: "E", field_manager: "M", coordinator: "E", secretary: "E", viewer: "R" },
  events: { admin: "M", ceo: "R", recruitment_manager: "R", field_manager: "M", coordinator: "E", secretary: "R", viewer: "R" },
  tasks: { admin: "M", ceo: "R", rav: "O", recruitment_manager: "T", advisor: "O", field_manager: "T", coordinator: "O", secretary: "O", viewer: "R" },
  newsletters: { admin: "M", ceo: "M", recruitment_manager: "E", field_manager: "M", coordinator: "R", secretary: "E" },
  budget_main: { admin: "M", ceo: "M", recruitment_manager: "R", field_manager: "E", secretary: "E", viewer: "A" },
  budget_field: { admin: "M", ceo: "R", field_manager: "M", coordinator: "E" },
  statistics: { admin: "M", ceo: "M", recruitment_manager: "M", field_manager: "M" },
  reports: { admin: "M", ceo: "M", rav: "R", recruitment_manager: "T", advisor: "O", field_manager: "M", coordinator: "O", secretary: "R", viewer: "A" },
  advisor_management: { admin: "M", ceo: "R", recruitment_manager: "M", advisor: "R" },
  audit_log: { admin: "M", ceo: "R", recruitment_manager: "T" },
  settings_users: { admin: "M" },
};

/** Returns this user's access level for a module — "NONE" if the role has no entry at all. */
export function accessLevel(ctx: UserCtx, module: ModuleName): "M" | "E" | "R" | "O" | "T" | "A" | "NONE" {
  return MATRIX[module][ctx.role as Role] || "NONE";
}

/** True if this level permits any write (M/E/O/T can write within their scope; R/A/NONE cannot). */
export function levelAllowsWrite(level: string): boolean {
  return level === "M" || level === "E" || level === "O" || level === "T";
}

/**
 * Blanket write guard for "viewer" (finding #1): viewer is read-only
 * everywhere, full stop, regardless of module. Call this first in any
 * route that handles POST/PATCH/DELETE.
 */
export function viewerBlockedFromWrite(ctx: UserCtx, method: string): boolean {
  return ctx.role === "viewer" && method !== "GET";
}

/**
 * Finding #2: who may open a case's protected/sensitive tab. `rav` is
 * further restricted to cases actually flagged red or explicitly routed
 * to them (checked by the caller via case data); this function only
 * answers the role-level question.
 */
export function canAccessProtectedInfo(ctx: UserCtx): boolean {
  const level = accessLevel(ctx, "case_protected");
  return level === "M" || level === "R" || level === "O";
}

/** Resolves a coordinator-role user's own coordinator row — the only leads/cases they may ever see or write. */
export async function resolveOwnCoordinatorId(userId: number): Promise<number | null> {
  const [row] = await sql`SELECT id FROM coordinators WHERE user_id=${userId}`;
  return row?.id ?? null;
}
