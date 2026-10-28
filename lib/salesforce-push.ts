import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { sendToLeadScenario, type LeadScenarioResult } from "@/lib/silfrus";

/**
 * Bookkeeping for "did this lead reach Salesforce?" so a failure is
 * visible in the leads screen and can be re-sent from there.
 *
 *   sf_sync_state: ok      — consultation process created, sf_record_id stored
 *                  pending — Make accepted the lead but didn't answer in time
 *                  exists  — Salesforce already has this person (phone / ID)
 *                  failed  — Make or Salesforce refused; sf_sync_error says why
 */
export type SyncState = "ok" | "pending" | "exists" | "failed";

export function stateFromResult(r: LeadScenarioResult): { state: SyncState; error: string | null } {
  if (r.exists) return { state: "exists", error: null };
  if (r.ok && r.sfId) return { state: "ok", error: null };
  if (r.ok) return { state: "pending", error: null };
  return { state: "failed", error: humanError(r.reason) };
}

function humanError(reason?: string): string {
  const t = String(reason || "").trim();
  if (!t) return "שגיאה לא ידועה";
  if (/timeout|aborted/i.test(t)) return "Make לא ענה בזמן (8 שניות)";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(t)) return "אין חיבור ל-Make";
  return t.slice(0, 300);
}

/** Writes the sync result onto the lead. Never throws. */
export async function recordSync(leadId: number, r: LeadScenarioResult): Promise<SyncState | null> {
  try {
    if (!(await hasColumn("leads", "sf_sync_state"))) return null;
    const { state, error } = stateFromResult(r);
    if (r.sfId) {
      await sql`UPDATE leads SET sf_record_id = ${r.sfId}, sf_status = COALESCE(sf_status, 'חדש'), sf_synced_at = now(),
                sf_sync_state = ${state}, sf_sync_error = NULL, sf_sync_at = now() WHERE id = ${leadId}`;
    } else {
      await sql`UPDATE leads SET sf_sync_state = ${state}, sf_sync_error = ${error}, sf_sync_at = now() WHERE id = ${leadId}`;
    }
    return state;
  } catch (e) {
    console.error("[silfrus record]", e);
    return null;
  }
}

/** Re-send one saved lead (from the leads screen). Uses the same scenario, so Salesforce de-dup still applies. */
export async function resendLead(leadId: number): Promise<{ id: number; state: SyncState | "skipped"; error?: string | null }> {
  const rows = await sql`
    SELECT l.id, l.name, l.phone, l.email, l.id_number, l.age, l.city, l.notes, l.owner_name, l.sf_record_id, c.name AS coord_name
    FROM leads l LEFT JOIN coordinators c ON c.id = l.coordinator_id
    WHERE l.id = ${leadId} AND l.deleted_at IS NULL LIMIT 1`;
  const l = rows[0] as any;
  if (!l) return { id: leadId, state: "skipped", error: "הליד לא נמצא" };
  if (l.sf_record_id) return { id: leadId, state: "skipped", error: "כבר מקושר לסילפרוס" };
  const [firstName, ...rest] = String(l.name || "").trim().split(/\s+/);
  const r = await sendToLeadScenario({
    firstName: firstName || l.name || "", lastName: rest.join(" "),
    phone: l.phone || "", email: l.email || "", idNumber: l.id_number || "",
    age: l.age ?? "", city: l.city || "", notes: l.notes || "",
    ownerName: l.coord_name || l.owner_name || "",
  });
  const { state, error } = stateFromResult(r);
  await recordSync(leadId, r);
  return { id: leadId, state, error };
}
