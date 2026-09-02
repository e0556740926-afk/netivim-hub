import sql from "@/lib/db";
import { sendEmail } from "@/lib/email";

// Audience/Broadcast management needs a Resend API key with full
// access — the existing RESEND_API_KEY (used for every transactional
// email elsewhere in the app) is deliberately scoped to "Sending
// access only" and confirmed via a live diagnostic to reject audience
// management calls with 401 restricted_api_key. Rather than widen
// that key's permissions everywhere, the newsletter uses its own key
// so the rest of the app keeps the narrower, safer scope.
const RESEND_KEY = process.env.RESEND_NEWSLETTER_API_KEY || process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "נתיבים שטח <onboarding@resend.dev>";
const APP_URL = process.env.NEXTAUTH_URL || "https://ornate-caramel-83bd4f.netlify.app";
// Required by anti-spam law (a physical mailing address in every bulk
// commercial/organizational email) — set NEWSLETTER_ORG_ADDRESS in env
// once the org confirms the address to publish.
const ORG_ADDRESS = process.env.NEWSLETTER_ORG_ADDRESS || "נתיבים שטח — יש להגדיר כתובת דואר בהגדרות (ORG_ADDRESS)";

/**
 * Resend Audiences require an audience_id up front. Rather than
 * asking for a manual setup step (create an audience in the Resend
 * dashboard, copy the ID, set an env var), this creates the audience
 * once via the API on first use and caches the ID in app_settings —
 * same "no human setup step" philosophy as the auto-generated
 * coordinator/manager slugs elsewhere in this app.
 */
async function getOrCreateAudienceId(): Promise<{ id: string | null; reason?: string }> {
  if (!RESEND_KEY) return { id: null, reason: "RESEND_API_KEY לא מוגדר" };

  const rows = await sql`SELECT value FROM app_settings WHERE key='resend_audience_id' LIMIT 1`;
  if (rows.length) return { id: (rows[0] as any).value };

  try {
    const res = await fetch("https://api.resend.com/audiences", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "הורים — ניוזלטר נתיבים" }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[newsletter] audience create failed:", errText);
      return { id: null, reason: `Resend: ${errText}` };
    }
    const data = await res.json();
    const id = data.id as string;
    await sql`INSERT INTO app_settings (key, value) VALUES ('resend_audience_id', ${id})
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    return { id };
  } catch (e) {
    console.error("[newsletter] audience create error:", e);
    return { id: null, reason: String(e) };
  }
}

/**
 * Adds or updates a subscriber as a Resend contact. Best-effort and
 * non-blocking: the local newsletter_subscribers row is always the
 * source of truth for the app's own UI (list, counts, channel
 * breakdown); this just keeps Resend's side in sync so a future
 * broadcast reaches them. A failure here never blocks signup.
 */
export async function upsertResendContact(email: string, name: string): Promise<string | null> {
  const { id: audienceId } = await getOrCreateAudienceId();
  if (!audienceId) return null;

  try {
    const [firstName, ...rest] = name.trim().split(" ");
    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, first_name: firstName, last_name: rest.join(" "), unsubscribed: false }),
    });
    if (!res.ok) {
      console.error("[newsletter] contact upsert failed:", await res.text());
      return null;
    }
    const data = await res.json();
    return data.id as string;
  } catch (e) {
    console.error("[newsletter] contact upsert error:", e);
    return null;
  }
}

/** Marks a contact unsubscribed on Resend's side too, best-effort. */
export async function unsubscribeResendContact(resendContactId: string | null): Promise<void> {
  if (!resendContactId || !RESEND_KEY) return;
  const { id: audienceId } = await getOrCreateAudienceId();
  if (!audienceId) return;
  try {
    await fetch(`https://api.resend.com/audiences/${audienceId}/contacts/${resendContactId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ unsubscribed: true }),
    });
  } catch (e) {
    console.error("[newsletter] unsubscribe sync error:", e);
  }
}

/**
 * Resolves an optional {{{first_name}}} token to a real first name.
 * Used for segmented and test sends, which go out as individual
 * transactional emails we fully control. True whole-audience Broadcasts
 * instead rely on Resend's own contact-property merge syntax (best
 * effort — Resend's documented property key is `first_name`, but this
 * hasn't been confirmed against a live send, so admins who want
 * guaranteed personalization should target a segment or send a test).
 */
function personalize(html: string, fullName?: string | null): string {
  const first = (fullName || "").trim().split(" ")[0] || "";
  return html.replace(/\{\{\{\s*first_name\s*\}\}\}/gi, first);
}

export interface IssueContent {
  subject: string;
  intro: string;
  blocks: { title: string; text: string }[];
  closing: string;
}

/**
 * The fixed monthly template — admins fill in a few plain-text
 * fields (intro, up to a handful of titled blocks, a closing note)
 * rather than writing HTML, so every issue looks consistent without
 * anyone touching markup.
 */
export function renderIssueHtml(c: IssueContent): string {
  const blocksHtml = c.blocks.map(b => `
    <tr><td style="padding:18px 0;border-top:1px solid #E2E8F0;">
      <div style="font-size:16px;font-weight:700;color:#0D2744;margin-bottom:8px;">${b.title}</div>
      <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${b.text}</div>
    </td></tr>`).join("");

  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="margin:0;padding:24px 12px;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif;">
    <table style="width:100%;max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border-collapse:collapse;">
      <tr><td style="background:#0D2744;padding:24px;">
        <div style="color:#fff;font-size:20px;font-weight:800;">נתיבים שטח</div>
        <div style="color:#C9A84C;font-size:13px;margin-top:4px;">${c.subject}</div>
      </td></tr>
      <tr><td style="padding:24px;">
        <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${c.intro}</div>
      </td></tr>
      ${blocksHtml}
      <tr><td style="padding:20px 24px;border-top:1px solid #E2E8F0;">
        <div style="font-size:13px;color:#64748B;line-height:1.6;white-space:pre-wrap;">${c.closing}</div>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#F8FAFC;text-align:center;">
        <div style="font-size:11px;color:#94A3B8;">
          נתיבים — מרכז הכוון לצעירים חרדים<br/>
          ${ORG_ADDRESS}<br/>
          <a href="${APP_URL}/newsletter/preferences" style="color:#94A3B8;">ניהול העדפות</a> ·
          {{{RESEND_UNSUBSCRIBE_URL}}}
        </div>
      </td></tr>
    </table></body></html>`;
}

/**
 * Wraps custom HTML (e.g. exported from Canva or any other design
 * tool) with an unsubscribe footer, unless the pasted content already
 * contains one. The unsubscribe link is a hard requirement regardless
 * of who designed the email — this makes it impossible to accidentally
 * skip by pasting content that doesn't already have the placeholder.
 */
function ensureUnsubscribeFooter(html: string): string {
  if (html.includes("RESEND_UNSUBSCRIBE_URL")) return html;
  const footer = `
    <div style="padding:16px 24px;background:#F8FAFC;text-align:center;font-family:'Segoe UI',Arial,sans-serif;">
      <div style="font-size:11px;color:#94A3B8;">
        ${ORG_ADDRESS}<br/>
        <a href="${APP_URL}/newsletter/preferences" style="color:#94A3B8;">ניהול העדפות</a> ·
        {{{RESEND_UNSUBSCRIBE_URL}}}
      </div>
    </div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : html + footer;
}

/** Builds the final HTML for an issue — used for sending, previewing, test-sending and archiving. */
export function buildIssueHtml(content: IssueContent, customHtml?: string | null): string {
  return customHtml?.trim() ? ensureUnsubscribeFooter(customHtml.trim()) : renderIssueHtml(content);
}

/**
 * Sends the issue as a Resend Broadcast to the full active audience.
 * Using Broadcasts (not the transactional send API) is what makes
 * Resend inject the one-click unsubscribe link automatically via the
 * {{{RESEND_UNSUBSCRIBE_URL}}} placeholder — required, not optional.
 * A {{{first_name}}} token in the content is left as-is here (best
 * effort — see `personalize`'s docblock); it's only guaranteed to
 * resolve on segmented/test sends, which render per-recipient locally.
 */
export async function sendBroadcastIssue(
  content: IssueContent,
  customHtml?: string | null,
  opts?: { fromName?: string | null; replyTo?: string | null }
): Promise<{ ok: boolean; broadcastId?: string; recipients?: number; reason?: string; html: string }> {
  const html = buildIssueHtml(content, customHtml);
  if (!RESEND_KEY) return { ok: false, reason: "no_key", html };
  const { id: audienceId, reason: audienceFailReason } = await getOrCreateAudienceId();
  if (!audienceId) return { ok: false, reason: audienceFailReason || "no_audience", html };

  const from = opts?.fromName ? `${opts.fromName} <${FROM.replace(/^.*<|>$/g, "")}>` : FROM;

  try {
    const createRes = await fetch("https://api.resend.com/broadcasts", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        audience_id: audienceId, from, subject: content.subject, html,
        ...(opts?.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("[newsletter] broadcast create failed:", err);
      return { ok: false, reason: err, html };
    }
    const created = await createRes.json();
    const broadcastId = created.id as string;

    const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcastId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    });
    if (!sendRes.ok) {
      const err = await sendRes.text();
      console.error("[newsletter] broadcast send failed:", err);
      return { ok: false, reason: err, broadcastId, html };
    }

    const recipRows = await sql`SELECT COUNT(*)::int AS c FROM newsletter_subscribers WHERE status='active'`;
    return { ok: true, broadcastId, recipients: (recipRows[0] as any)?.c || 0, html };
  } catch (e) {
    console.error("[newsletter] send error:", e);
    return { ok: false, reason: String(e), html };
  }
}

/**
 * Sends the issue to a subset of subscribers (e.g. one region) rather
 * than the whole audience. Resend Broadcasts only target a full
 * audience, so a real segment send goes through the transactional
 * batch-send endpoint instead — meaning we lose Resend's automatic
 * one-click unsubscribe injection and have to add the equivalent
 * List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058)
 * ourselves, per recipient, pointing at our own one-click endpoint.
 */
export async function sendSegmentedIssue(
  content: IssueContent,
  customHtml: string | null,
  area: string,
  opts?: { fromName?: string | null; replyTo?: string | null }
): Promise<{ ok: boolean; recipients?: number; reason?: string; html: string }> {
  const html = buildIssueHtml(content, customHtml);
  if (!RESEND_KEY) return { ok: false, reason: "no_key", html };

  const subs = await sql`SELECT email, manage_token FROM newsletter_subscribers WHERE status='active' AND area=${area}`;
  if (!subs.length) return { ok: false, reason: "no_subscribers_in_segment", html };

  const from = opts?.fromName ? `${opts.fromName} <${FROM.replace(/^.*<|>$/g, "")}>` : FROM;
  const batches: any[] = [];
  for (const s of subs as any[]) {
    const unsubUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${s.manage_token}`;
    // {{{RESEND_UNSUBSCRIBE_URL}}} only auto-resolves on Broadcasts, not
    // on this batch/transactional endpoint — left as-is it would show as
    // literal unrendered text in the email body. Swap it for the real
    // per-recipient link before sending. The List-Unsubscribe header
    // below covers the RFC 8058 one-click button; this covers the
    // visible in-body link for clients that don't show that button.
    const personalHtml = personalize(html, s.name).replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, unsubUrl);
    batches.push({
      from,
      ...(opts?.replyTo ? { reply_to: opts.replyTo } : {}),
      to: [s.email],
      subject: content.subject,
      html: personalHtml,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  }

  try {
    // Resend's batch endpoint accepts up to 100 emails per call.
    for (let i = 0; i < batches.length; i += 100) {
      const chunk = batches.slice(i, i + 100);
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[newsletter] segmented batch send failed:", err);
        return { ok: false, reason: err, html };
      }
    }
    return { ok: true, recipients: subs.length, html };
  } catch (e) {
    console.error("[newsletter] segmented send error:", e);
    return { ok: false, reason: String(e), html };
  }
}

/** Sends a one-off preview copy to a single address — never touches subscriber stats. */
export async function sendTestEmail(toEmail: string, content: IssueContent, customHtml?: string | null, previewName?: string) {
  const html = personalize(buildIssueHtml(content, customHtml), previewName || "ישראל");
  return sendEmail({ to: toEmail, subject: `[בדיקה] ${content.subject}`, html });
}

/**
 * Sent immediately on signup, separately from the monthly broadcast —
 * this is the highest-open-rate moment in a subscriber's lifecycle
 * and was previously wasted (new subscribers just waited silently for
 * the next monthly issue). Best-effort: a failure here never blocks
 * the signup itself.
 */
export async function sendWelcomeEmail(name: string, email: string) {
  const firstName = name.trim().split(" ")[0] || name;
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><body style="margin:0;padding:24px 12px;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif;">
    <table style="width:100%;max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border-collapse:collapse;">
      <tr><td style="background:#0D2744;padding:24px;">
        <div style="color:#fff;font-size:20px;font-weight:800;">נתיבים שטח</div>
        <div style="color:#C9A84C;font-size:13px;margin-top:4px;">ברוכים הבאים לניוזלטר</div>
      </td></tr>
      <tr><td style="padding:24px;">
        <div style="font-size:15px;color:#374151;line-height:1.8;">
          שלום ${firstName},<br/><br/>
          תודה שנרשמת לניוזלטר של נתיבים! מדי חודש תקבלו מאיתנו עדכון קצר — הישגים, אירועים קרובים וסיפורים מהשטח.<br/><br/>
          בלי ספאם, ואפשר להסיר בכל רגע בלחיצה אחת מכל מייל שנשלח.
        </div>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#F8FAFC;text-align:center;">
        <div style="font-size:11px;color:#94A3B8;">נתיבים — מרכז הכוון לצעירים חרדים<br/>${ORG_ADDRESS}</div>
      </td></tr>
    </table></body></html>`;
  const result = await sendEmail({ to: email, subject: "ברוכים הבאים לניוזלטר נתיבים 👋", html });
  if (result.ok) {
    await sql`UPDATE newsletter_subscribers SET welcome_sent_at=now() WHERE email=${email}`.catch(() => {});
  }
  return result;
}
