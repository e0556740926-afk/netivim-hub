/**
 * Pure permission matrix — no DB import, so client components (the mobile
 * shell's menu and quick-add list) can read the same levels the API
 * enforces. Server routes keep using lib/permissions.ts, which re-exports
 * everything here. Showing/hiding UI from this is a convenience only —
 * the server remains the gate.
 */
export type Role = "admin" | "ceo" | "rav" | "recruitment_manager" | "advisor" | "field_manager" | "coordinator" | "secretary" | "viewer";
export type ModuleName =
  | "leads" | "contacts" | "events" | "tasks"
  | "newsletters" | "budget_main" | "reports"
  | "audit_log" | "settings_users";

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
  contacts: { admin: "M", ceo: "R", rav: "R", recruitment_manager: "M", advisor: "E", field_manager: "M", coordinator: "E", secretary: "E", viewer: "R" },
  events: { admin: "M", ceo: "R", recruitment_manager: "R", field_manager: "M", coordinator: "E", secretary: "R", viewer: "R" },
  tasks: { admin: "M", ceo: "R", rav: "O", recruitment_manager: "T", advisor: "O", field_manager: "T", coordinator: "O", secretary: "O", viewer: "R" },
  newsletters: { admin: "M", ceo: "M", recruitment_manager: "E", field_manager: "M", coordinator: "R", secretary: "E" },
  budget_main: { admin: "M", ceo: "M", recruitment_manager: "R", field_manager: "E", secretary: "E", viewer: "A" },
  reports: { admin: "M", ceo: "M", rav: "R", recruitment_manager: "T", advisor: "O", field_manager: "M", coordinator: "O", secretary: "R", viewer: "A" },
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

