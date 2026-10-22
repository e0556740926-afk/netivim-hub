import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Hourly WhatsApp connection check for the bot. Asks Green API for the
 * instance state and stores it in whatsapp_bot_settings (shown on the bot
 * settings screen). When the instance stops being "authorized" — usually the
 * phone hasn't opened WhatsApp for ~14 days, so linked devices were logged
 * out — managers get an email, since WhatsApp itself is the thing that's down.
 *
 * Self-contained (separate esbuild context, no "@/lib/*" imports).
 */

const sql = neon(process.env.DATABASE_URL!);
const GREENAPI_ID = process.env.GREENAPI_ID_INSTANCE;
const GREENAPI_TOKEN = process.env.GREENAPI_API_TOKEN;
const RESEND_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "נתיבים שטח <onboarding@resend.dev>";
const APP_URL = process.env.NEXTAUTH_URL || "https://netivimportal.org";

export default async () => {
  if (!GREENAPI_ID || !GREENAPI_TOKEN) return Response.json({ skipped: "no green api config" });
  let state = "unknown";
  try {
    const res = await fetch(`${(process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "")}/waInstance${GREENAPI_ID}/getStateInstance/${GREENAPI_TOKEN}`);
    const data: any = await res.json().catch(() => null);
    state = res.ok && data?.stateInstance ? String(data.stateInstance) : `http_${res.status}`;
  } catch (e) {
    state = "unreachable";
  }

  let prev: string | null = null;
  try {
    const [row] = await sql`SELECT last_state FROM whatsapp_bot_settings WHERE id = 1`;
    prev = row?.last_state ?? null;
    await sql`UPDATE whatsapp_bot_settings SET last_state = ${state}, last_state_at = now() WHERE id = 1`;
  } catch {
    return Response.json({ state, note: "settings table not created yet" });
  }

  const wentDown = state !== "authorized" && (prev === "authorized" || prev === null);
  if (wentDown && RESEND_KEY) {
    try {
      const admins = await sql`SELECT email FROM users WHERE role = 'admin' AND status = 'active' AND COALESCE(email,'') <> ''`;
      const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
        <p><b>בוט הוואטסאפ של נתיבים מנותק</b> (מצב: ${state}).</p>
        <p>הבוט לא מקבל ולא שולח הודעות עד שיחובר מחדש. ברוב המקרים מספיק לפתוח וואטסאפ בטלפון של המספר המחובר;
        אם זה לא עוזר — לסרוק מחדש את קוד ה-QR בחשבון Green API.</p>
        <p><a href="${APP_URL}/admin/settings/whatsapp-bot">מסך הגדרות הבוט</a></p></div>`;
      for (const a of admins as any[]) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: EMAIL_FROM, to: [a.email], subject: "⚠️ בוט הוואטסאפ מנותק", html }),
        }).catch(() => {});
      }
    } catch (e) {
      console.error("[wa-health] alert failed", e);
    }
  }
  console.log("[wa-health]", state, "prev:", prev);
  return Response.json({ state, prev, alerted: wentDown });
};

export const config: Config = {
  schedule: "17 * * * *",
};
