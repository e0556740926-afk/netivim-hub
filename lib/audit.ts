import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";

interface LogArgs {
  entityType: "contact" | "lead" | "task" | "event" | "organization" | "case" | "case_protected" | "referral" | "funding_source" | "purchase_request" | "custom_field" | "setting";
  entityId: number;
  action: "create" | "update" | "delete" | "restore" | "view";
  actorName?: string;
  actorEmail?: string;
  summary?: string;
}

let tableChecked = false;
let tableExists = false;

async function ensureTableKnown() {
  if (tableChecked) return tableExists;
  tableExists = await hasColumn("audit_log", "id");
  tableChecked = true;
  return tableExists;
}

/**
 * Records one audit line. Never throws — a logging failure must not
 * break the request it's describing. Silently does nothing until
 * migration-001.sql has been applied.
 */
export async function logAudit(a: LogArgs): Promise<void> {
  try {
    if (!(await ensureTableKnown())) return;
    await sql`
      INSERT INTO audit_log (entity_type, entity_id, action, actor_name, actor_email, summary)
      VALUES (${a.entityType}, ${a.entityId}, ${a.action}, ${a.actorName || ""}, ${a.actorEmail || ""}, ${a.summary || ""})
    `;
  } catch (e) {
    console.error("[audit]", e);
  }
}

/** Builds a short "field: old → new" diff summary for a small set of tracked fields. */
export function diffSummary(before: Record<string, any>, after: Record<string, any>, fields: string[]): string {
  const parts: string[] = [];
  for (const f of fields) {
    const a = before?.[f], b = after?.[f];
    const an = a ?? "", bn = b ?? "";
    if (String(an) !== String(bn)) parts.push(`${f}: ${an || "—"} → ${bn || "—"}`);
  }
  return parts.join(" · ");
}
