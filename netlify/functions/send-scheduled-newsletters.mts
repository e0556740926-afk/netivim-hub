import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Runs every 15 minutes. Finds newsletter issues with status='scheduled'
 * whose scheduled_at has arrived, and sends them.
 *
 * Deliberately self-contained: Netlify Scheduled Functions build in a
 * separate esbuild context from the Next.js app, so the "@/lib/*" path
 * aliases used everywhere else do not resolve here. Rather than fight
 * the bundler, this file duplicates the small pieces of lib/newsletter.ts
 * it needs (DB connection, Resend calls) with relative imports only —
 * it touches no file the rest of the app depends on, so it cannot break
 * anything else. Worst case, this one function fails to run and a
 * scheduled issue just sits at "scheduled" until sent manually from
 * the admin UI's "שלח עכשיו" button.
 */

const sql = neon(process.env.DATABASE_URL!);
const RESEND_KEY = process.env.RESEND_NEWSLETTER_API_KEY || process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "נתיבים שטח <onboarding@resend.dev>";
const APP_URL = process.env.NEXTAUTH_URL || "https://ornate-caramel-83bd4f.netlify.app";

async function getAudienceId(): Promise<string | null> {
  const rows = await sql`SELECT value FROM app_settings WHERE key='resend_audience_id' LIMIT 1`;
  return (rows[0] as any)?.value || null;
}

function personalize(html: string, fullName?: string | null): string {
  const first = (fullName || "").trim().split(" ")[0] || "";
  return html.replace(/\{\{\{\s*first_name\s*\}\}\}/gi, first);
}

async function sendBroadcast(issue: any): Promise<{ ok: boolean; broadcastId?: string; recipients?: number; reason?: string }> {
  const audienceId = await getAudienceId();
  if (!audienceId) return { ok: false, reason: "no_audience" };
  const from = issue.from_name ? `${issue.from_name} <${FROM.replace(/^.*<|>$/g, "")}>` : FROM;

  const createRes = await fetch("https://api.resend.com/broadcasts", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      audience_id: audienceId, from, subject: issue.subject, html: issue.html,
      ...(issue.reply_to ? { reply_to: issue.reply_to } : {}),
    }),
  });
  if (!createRes.ok) return { ok: false, reason: await createRes.text() };
  const created = await createRes.json();
  const broadcastId = created.id as string;

  const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcastId}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
  });
  if (!sendRes.ok) return { ok: false, reason: await sendRes.text(), broadcastId };

  const recipRows = await sql`SELECT COUNT(*)::int AS c FROM newsletter_subscribers WHERE status='active'`;
  return { ok: true, broadcastId, recipients: (recipRows[0] as any)?.c || 0 };
}

async function sendSegmented(issue: any): Promise<{ ok: boolean; recipients?: number; reason?: string }> {
  const subs = await sql`SELECT email, name, manage_token FROM newsletter_subscribers WHERE status='active' AND area=${issue.segment_area}`;
  if (!subs.length) return { ok: false, reason: "no_subscribers_in_segment" };
  const from = issue.from_name ? `${issue.from_name} <${FROM.replace(/^.*<|>$/g, "")}>` : FROM;

  const batch = (subs as any[]).map(s => {
    const unsubUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${s.manage_token}`;
    const html = personalize(issue.html, s.name).replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, unsubUrl);
    return {
      from, to: [s.email], subject: issue.subject, html,
      ...(issue.reply_to ? { reply_to: issue.reply_to } : {}),
      headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    };
  });

  for (let i = 0; i < batch.length; i += 100) {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch.slice(i, i + 100)),
    });
    if (!res.ok) return { ok: false, reason: await res.text() };
  }
  return { ok: true, recipients: subs.length };
}

export default async () => {
  const results = { sent: 0, failed: 0, errors: [] as string[] };
  if (!RESEND_KEY) {
    console.log("[send-scheduled-newsletters] no RESEND key configured — skipping");
    return new Response(JSON.stringify({ skipped: "no_key" }), { headers: { "Content-Type": "application/json" } });
  }

  try {
    const due = await sql`
      SELECT * FROM newsletter_issues
      WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now()
      ORDER BY scheduled_at ASC LIMIT 10`;

    for (const issue of due as any[]) {
      try {
        const result = issue.segment_area ? await sendSegmented(issue) : await sendBroadcast(issue);
        await sql`
          UPDATE newsletter_issues SET
            status=${result.ok ? "sent" : "failed"},
            sent_at=${result.ok ? new Date().toISOString() : null},
            recipients=${result.recipients || 0},
            resend_broadcast_id=${(result as any).broadcastId || null}
          WHERE id=${issue.id}`;
        if (result.ok) { results.sent++; } else { results.failed++; results.errors.push(`#${issue.id}: ${result.reason}`); }
      } catch (e: any) {
        results.failed++;
        results.errors.push(`#${issue.id}: ${e.message}`);
        await sql`UPDATE newsletter_issues SET status='failed' WHERE id=${issue.id}`.catch(() => {});
      }
    }
  } catch (e: any) {
    results.errors.push(`query: ${e.message}`);
  }

  console.log("[send-scheduled-newsletters]", JSON.stringify(results));
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
};

export const config: Config = {
  schedule: "*/15 * * * *", // every 15 minutes
};
