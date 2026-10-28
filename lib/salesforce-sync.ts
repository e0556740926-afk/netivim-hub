import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";

/**
 * Salesforce → Netivim Hub status sync.
 *
 * In Salesforce, a lead from the field lands as a "תהליך ייעוץ"
 * (Consultation_Process__c) record, linked to a Contact (the advisee),
 * with Reffer_Source__c = "שטח". This module takes one such record —
 * either from Make.com (webhook) or from the direct-API poller — and
 * writes its process status onto the matching lead here.
 *
 * Matching: by sf_record_id once a lead is linked; otherwise by phone
 * (last 9 digits) or ID number, picking the most recent not-yet-linked lead. The
 * first successful match stores sf_record_id, so later updates are exact.
 */

export interface SfStatusUpdate {
  sfId: string;
  phone?: string;
  idNumber?: string;
  status?: string;
  subStatus?: string;
  advisor?: string;
  framework?: string;
  referralDestination?: string;
  inactiveReason?: string;
  light?: string;
  lastModified?: string;
}

/** Accepts both our own keys and raw Salesforce API names, so a Make mapping can be a straight pass-through. */
export function normalizeSfPayload(p: any): SfStatusUpdate | null {
  if (!p || typeof p !== "object") return null;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = k.includes(".") ? k.split(".").reduce((o: any, part) => o?.[part], p) : p[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return undefined;
  };
  const sfId = pick("sf_id", "sfId", "Id", "id");
  if (!sfId) return null;
  return {
    sfId,
    phone: pick("phone", "Advisee_Phone__c"),
    idNumber: pick("id_number", "Id_Number__c", "Advisee_Israeli_Id__c"),
    status: pick("status", "Status__c"),
    subStatus: pick("sub_status", "subStatus", "Sub_Status__c"),
    advisor: pick("advisor", "Advisor__r.Name", "advisor_name"),
    framework: pick("framework", "Framework_Entered__c"),
    referralDestination: [
      pick("referral_destination", "Referral_Destination__c"),
      pick("org_type", "Org_Type__c"),
      pick("destination", "Refferal_Army_Destination__c", "Refferal_Mechina_Destination__c", "Refferal_Yeshiva_Destination__c"),
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || undefined,
    inactiveReason: pick("inactive_reason", "Inactive_Reason__c"),
    light: pick("light", "Light__c"),
    lastModified: pick("last_modified", "LastModifiedDate", "SystemModstamp"),
  };
}

export function phoneKey(phone?: string): string {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}

export type ApplyResult = { ok: boolean; leadId?: number; matchedBy?: "sf_id" | "phone" | "id_number"; reason?: string };

export async function applySfStatus(u: SfStatusUpdate): Promise<ApplyResult> {
  if (!(await hasColumn("leads", "sf_record_id"))) return { ok: false, reason: "migration_pending" };

  let leadId: number | undefined;
  let matchedBy: ApplyResult["matchedBy"];

  const byId = await sql`SELECT id FROM leads WHERE sf_record_id = ${u.sfId} AND deleted_at IS NULL LIMIT 1`;
  if (byId.length) { leadId = (byId[0] as any).id; matchedBy = "sf_id"; }

  if (!leadId) {
    const key = phoneKey(u.phone);
    if (key) {
      const byPhone = await sql`
        SELECT id FROM leads
        WHERE deleted_at IS NULL AND sf_record_id IS NULL
          AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = ${key}
        ORDER BY created_at DESC LIMIT 1`;
      if (byPhone.length) { leadId = (byPhone[0] as any).id; matchedBy = "phone"; }
    }
  }

  if (!leadId) {
    const tz = String(u.idNumber || "").replace(/\D/g, "");
    if (tz.length >= 5) {
      const byTz = await sql`
        SELECT id FROM leads
        WHERE deleted_at IS NULL AND sf_record_id IS NULL AND COALESCE(id_number, '') <> ''
          AND lpad(regexp_replace(id_number, '\\D', '', 'g'), 9, '0') = ${tz.padStart(9, "0")}
        ORDER BY created_at DESC LIMIT 1`;
      if (byTz.length) { leadId = (byTz[0] as any).id; matchedBy = "id_number"; }
    }
  }

  if (!leadId) return { ok: false, reason: "no_match" };

  // Ignore out-of-order deliveries: only apply if this update is not older than what we hold.
  const modified = u.lastModified ? new Date(u.lastModified) : new Date();
  const updated = await sql`
    UPDATE leads SET
      sf_record_id = ${u.sfId},
      sf_status = ${u.status ?? null},
      sf_sub_status = ${u.subStatus ?? null},
      sf_advisor = ${u.advisor ?? null},
      sf_framework = ${u.framework ?? null},
      sf_referral_destination = ${u.referralDestination ?? null},
      sf_inactive_reason = ${u.inactiveReason ?? null},
      sf_light = ${u.light ?? null},
      sf_updated_at = ${modified.toISOString()},
      sf_synced_at = now()
    WHERE id = ${leadId} AND (sf_updated_at IS NULL OR sf_updated_at <= ${modified.toISOString()})
    RETURNING id`;
  if (!updated.length) return { ok: true, leadId, matchedBy, reason: "stale_update_ignored" };
  return { ok: true, leadId, matchedBy };
}
