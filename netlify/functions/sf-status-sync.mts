import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Salesforce → Hub status poller (direct API path).
 *
 * Dormant until SF_CLIENT_ID / SF_CLIENT_SECRET are set — that needs an
 * External Client App (OAuth Client Credentials flow) created by a full
 * Salesforce admin. Until then, status updates arrive through Make.com
 * at /api/integrations/salesforce/status instead. Both paths write the
 * same sf_* columns with the same matching rules, so they can coexist.
 *
 * Self-contained on purpose (Netlify functions build in a separate
 * esbuild context — no "@/lib/*" imports). Matching logic mirrors
 * lib/salesforce-sync.ts; keep them in step.
 */

const sql = neon(process.env.DATABASE_URL!);
const SF_DOMAIN = process.env.SF_DOMAIN || "https://nahalharedi.my.salesforce.com";
const SF_CLIENT_ID = process.env.SF_CLIENT_ID;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const API = "v62.0";
const STATE_KEY = "sf_status_sync_watermark";

async function token(): Promise<string> {
  const res = await fetch(`${SF_DOMAIN}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: SF_CLIENT_ID!, client_secret: SF_CLIENT_SECRET! }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function query(tok: string, soql: string): Promise<any[]> {
  const out: any[] = [];
  let url: string | null = `${SF_DOMAIN}/services/data/${API}/query?q=${encodeURIComponent(soql)}`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}`);
    const j: any = await res.json();
    out.push(...j.records);
    url = j.nextRecordsUrl ? `${SF_DOMAIN}${j.nextRecordsUrl}` : null;
  }
  return out;
}

function phoneKey(phone?: string): string {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}

async function apply(r: any): Promise<boolean> {
  let rows = await sql`SELECT id FROM leads WHERE sf_record_id = ${r.Id} AND deleted_at IS NULL LIMIT 1`;
  if (!rows.length) {
    const key = phoneKey(r.Advisee_Phone__c);
    if (!key) return false;
    rows = await sql`
      SELECT id FROM leads
      WHERE deleted_at IS NULL AND sf_record_id IS NULL
        AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = ${key}
      ORDER BY created_at DESC LIMIT 1`;
    if (!rows.length) return false;
  }
  const id = (rows[0] as any).id;
  await sql`
    UPDATE leads SET
      sf_record_id = ${r.Id},
      sf_status = ${r.Status__c ?? null},
      sf_sub_status = ${r.Sub_Status__c ?? null},
      sf_advisor = ${r.Advisor__r?.Name ?? null},
      sf_framework = ${r.Framework_Entered__c ?? null},
      sf_referral_destination = ${r.Referral_Destination__c ?? null},
      sf_inactive_reason = ${r.Inactive_Reason__c ?? null},
      sf_light = ${r.Light__c ?? null},
      sf_updated_at = ${r.LastModifiedDate},
      sf_synced_at = now()
    WHERE id = ${id} AND (sf_updated_at IS NULL OR sf_updated_at <= ${r.LastModifiedDate})`;
  return true;
}

export default async () => {
  if (!SF_CLIENT_ID || !SF_CLIENT_SECRET) {
    console.log("[sf-sync] SF_CLIENT_ID/SECRET not set — skipping");
    return;
  }
  try {
    const [st] = await sql`SELECT value FROM integration_state WHERE key = ${STATE_KEY}`;
    // First run: look back 120 days to backfill existing leads.
    const since = (st as any)?.value || new Date(Date.now() - 120 * 864e5).toISOString();
    const tok = await token();
    const records = await query(tok, `
      SELECT Id, Advisee_Phone__c, Status__c, Sub_Status__c, Advisor__r.Name, Framework_Entered__c,
             Referral_Destination__c, Inactive_Reason__c, Light__c, LastModifiedDate
      FROM Consultation_Process__c
      WHERE Reffer_Source__c = 'שטח' AND LastModifiedDate > ${new Date(since).toISOString()}
      ORDER BY LastModifiedDate ASC`.replace(/\s+/g, " "));
    let matched = 0;
    for (const r of records) {
      try { if (await apply(r)) matched++; } catch (e) { console.error("[sf-sync] apply", r.Id, e); }
    }
    const newest = records.length ? records[records.length - 1].LastModifiedDate : since;
    await sql`
      INSERT INTO integration_state (key, value, updated_at) VALUES (${STATE_KEY}, ${newest}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    console.log(`[sf-sync] ${records.length} changed in SF, ${matched} matched to leads`);
  } catch (e) {
    console.error("[sf-sync] failed:", e);
  }
};

export const config: Config = { schedule: "*/20 * * * *" };
