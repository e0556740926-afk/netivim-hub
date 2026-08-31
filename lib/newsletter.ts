import sql from "@/lib/db";

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "נתיבים שטח <onboarding@resend.dev>";

/**
 * Resend Audiences require an audience_id up front. Rather than
 * asking for a manual setup step (create an audience in the Resend
 * dashboard, copy the ID, set an env var), this creates the audience
 * once via the API on first use and caches the ID in app_settings —
 * same "no human setup step" philosophy as the auto-generated
 * coordinator/manager slugs elsewhere in this app.
 */
async function getOrCreateAudienceId(): Promise<string | null> {
  if (!RESEND_KEY) return null;

  const rows = await sql`SELECT value FROM app_settings WHERE key='resend_audience_id' LIMIT 1`;
  if (rows.length) return (rows[0] as any).value;

  try {
    const res = await fetch("https://api.resend.com/audiences", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "הורים — ניוזלטר נתיבים" }),
    });
    if (!res.ok) {
      console.error("[newsletter] audience create failed:", await res.text());
      return null;
    }
    const data = await res.json();
    const id = data.id as string;
    await sql`INSERT INTO app_settings (key, value) VALUES ('resend_audience_id', ${id})
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    return id;
  } catch (e) {
    console.error("[newsletter] audience create error:", e);
    return null;
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
  const audienceId = await getOrCreateAudienceId();
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
  const audienceId = await getOrCreateAudienceId();
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

interface IssueContent {
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
function renderIssueHtml(c: IssueContent): string {
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
      <div style="font-size:11px;color:#94A3B8;">{{{RESEND_UNSUBSCRIBE_URL}}}</div>
    </div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : html + footer;
}

/**
 * Sends the monthly issue as a Resend Broadcast to the full active
 * audience. Using Broadcasts (not the transactional send API) is
 * what makes Resend inject the one-click unsubscribe link
 * automatically via the {{{RESEND_UNSUBSCRIBE_URL}}} placeholder —
 * required, not optional, per the newsletter's own requirements.
 */
export async function sendMonthlyIssue(
  content: IssueContent,
  customHtml?: string | null
): Promise<{ ok: boolean; broadcastId?: string; recipients?: number; reason?: string }> {
  if (!RESEND_KEY) return { ok: false, reason: "no_key" };
  const audienceId = await getOrCreateAudienceId();
  if (!audienceId) return { ok: false, reason: "no_audience" };

  const html = customHtml?.trim()
    ? ensureUnsubscribeFooter(customHtml.trim())
    : renderIssueHtml(content);

  try {
    const createRes = await fetch("https://api.resend.com/broadcasts", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        audience_id: audienceId,
        from: FROM,
        subject: content.subject,
        html,
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("[newsletter] broadcast create failed:", err);
      return { ok: false, reason: err };
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
      return { ok: false, reason: err, broadcastId };
    }

    const recipRows = await sql`SELECT COUNT(*)::int AS c FROM newsletter_subscribers WHERE status='active'`;
    return { ok: true, broadcastId, recipients: (recipRows[0] as any)?.c || 0 };
  } catch (e) {
    console.error("[newsletter] send error:", e);
    return { ok: false, reason: String(e) };
  }
}
