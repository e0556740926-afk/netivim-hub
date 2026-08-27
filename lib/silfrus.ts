const WEBHOOK_URL = process.env.SILFRUS_WEBHOOK_URL;

interface SilfrusLeadArgs {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  /** The coordinator or manager this lead is assigned to. */
  ownerName: string;
}

/**
 * Pushes one lead to Silfrus (Salesforce) through a Make.com webhook.
 *
 * Never throws — a failed sync must not break lead creation. Silently
 * skips if SILFRUS_WEBHOOK_URL isn't configured, same pattern as
 * email/WhatsApp.
 */
export async function sendToSilfrus(a: SilfrusLeadArgs): Promise<{ ok: boolean; reason?: string }> {
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
        medium: "נתיבים שטח",
        source: a.ownerName,
        campaign: "",
        last_name: a.lastName,
        "First name": a.firstName,
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
