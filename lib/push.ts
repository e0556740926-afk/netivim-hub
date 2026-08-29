import webpush from "web-push";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails("mailto:support@netivim.org", PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Sends a push notification to every device the given email has enabled
 * push on. Never throws — a failed or unconfigured push must not break
 * whatever triggered it, same pattern as sendEmail/sendWhatsApp.
 * Silently a no-op until the migration creates push_subscriptions and
 * VAPID keys are set.
 */
export async function sendPush(email: string, payload: PushPayload): Promise<void> {
  if (!email) return;
  if (!ensureConfigured()) return;
  if (!(await hasColumn("push_subscriptions", "id"))) return;

  try {
    const subs = await sql`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE email=${email}`;
    for (const s of subs as any[]) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
      } catch (e: any) {
        // 404/410 = the browser revoked this subscription — clean it up.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sql`DELETE FROM push_subscriptions WHERE id=${s.id}`;
        } else {
          console.error("[push] send failed:", e?.statusCode, e?.body);
        }
      }
    }
  } catch (e) {
    console.error("[push] error:", e);
  }
}
