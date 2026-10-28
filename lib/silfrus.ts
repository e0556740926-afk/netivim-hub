const WEBHOOK_URL = process.env.SILFRUS_WEBHOOK_URL;
/**
 * New Make scenario ("נתיבים שטח ← סילפרוס: ליד חדש"). When set, it takes
 * precedence over the legacy SILFRUS_WEBHOOK_URL: richer payload, and the
 * webhook answers with the Salesforce record id so the lead is linked at once.
 */
export const LEAD_WEBHOOK_URL = process.env.SF_LEAD_WEBHOOK_URL;

interface SilfrusLeadArgs {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  /** The coordinator or manager this lead is assigned to. */
  ownerName: string;
  /** Israeli ID number (ת.ז), if collected. */
  idNumber?: string;
  age?: string | number;
  notes?: string;
  leadId?: number;
  city?: string;
  leadSource?: string;
  arrivalChannel?: string;
  event?: string;
  referrerName?: string;
}

/**
 * Pushes one lead to Silfrus (Salesforce) through a Make.com webhook.
 *
 * Never throws — a failed sync must not break lead creation. Silently
 * skips if SILFRUS_WEBHOOK_URL isn't configured, same pattern as
 * email/WhatsApp.
 */
export async function sendToSilfrus(a: SilfrusLeadArgs): Promise<{ ok: boolean; reason?: string; sfId?: string; exists?: boolean }> {
  if (LEAD_WEBHOOK_URL) return sendToLeadScenario(a, LEAD_WEBHOOK_URL);
  if (!WEBHOOK_URL) {
    console.log("[silfrus] SILFRUS_WEBHOOK_URL not set — skipping");
    return { ok: false, reason: "no_webhook" };
  }
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        mail: a.email || "",
        phone: a.phone,
        medium: a.ownerName,
        source: "נתיבים שטח",
        campaign: "",
        last_name: a.lastName,
        "First name": a.firstName,
        id_number: a.idNumber || "",
        age: a.age != null ? String(a.age) : "",
        notes: a.notes || "",
      }]),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[silfrus] send failed:", err);
      return { ok: false, reason: err };
    }
    return { ok: true };
  } catch (e) {
    console.error("[silfrus] error:", e);
    return { ok: false, reason: String(e) };
  }
}

export type LeadScenarioResult = { ok: boolean; reason?: string; sfId?: string; exists?: boolean; contactId?: string };

/**
 * The new Make scenario: looks the person up in Salesforce by phone and by
 * ID number. Found → answers {exists:true} and creates nothing. Not found →
 * creates the Contact + "תהליך ייעוץ" and answers with the process id.
 */
export async function sendToLeadScenario(a: SilfrusLeadArgs, url = LEAD_WEBHOOK_URL || ""): Promise<LeadScenarioResult> {
  if (!url) return { ok: false, reason: "no_webhook" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: a.leadId ?? null,
        first_name: a.firstName,
        last_name: a.lastName,
        phone: a.phone,
        phone_digits: String(a.phone || "").replace(/\D/g, ""),
        id_number: String(a.idNumber || "").replace(/\D/g, ""),
        email: a.email || "",
        age: a.age != null && a.age !== "" ? String(a.age) : "",
        city: a.city || "",
        notes: a.notes || "",
        sender: a.ownerName || "",
        referral_source: "מערכת שטח",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[silfrus] lead scenario failed:", res.status, text);
      return { ok: false, reason: text };
    }
    try {
      const j = JSON.parse(text);
      return { ok: true, exists: !!j?.exists, sfId: j?.sf_id || undefined, contactId: j?.contact_id || undefined };
    } catch {
      return { ok: true }; // "Accepted" — scenario queued, no answer
    }
  } catch (e) {
    console.error("[silfrus] lead scenario error:", e);
    return { ok: false, reason: String(e) };
  }
}
