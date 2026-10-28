/**
 * Make scenario "נתיבים שטח ← סילפרוס: ליד חדש" — the only path from this
 * system to Salesforce. (The old SILFRUS_WEBHOOK_URL Make webhook was removed
 * on 28.10.2026.) The webhook answers with the Salesforce record id so the
 * lead is linked at once.
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
