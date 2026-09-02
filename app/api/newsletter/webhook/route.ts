import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import sql from "@/lib/db";

// Signature verification needs Node's crypto module.
export const runtime = "nodejs";

/**
 * Resend signs webhooks using the Svix standard-webhooks scheme:
 *   signed_content = `${svix-id}.${svix-timestamp}.${raw_body}`
 *   signature = base64(HMAC-SHA256(secret, signed_content))
 * The secret is the "whsec_..." value shown once when the webhook is
 * created in the Resend dashboard — this is the one manual, third-party
 * setup step (Resend has no public API to create webhooks). It must be
 * set as RESEND_WEBHOOK_SECRET in the environment for this to verify.
 */
function verifySignature(rawBody: string, headers: Headers): boolean {
  const secretEnv = process.env.RESEND_WEBHOOK_SECRET;
  if (!secretEnv) {
    console.error("[newsletter webhook] RESEND_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const secretBytes = Buffer.from(secretEnv.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  return signatureHeader.split(" ").some(sigPart => {
    const sig = sigPart.split(",")[1] || sigPart;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch { return false; }
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const type: string = payload.type || "";
  const data = payload.data || {};
  const email: string | null = Array.isArray(data.to) ? data.to[0] : (data.to || null);
  const broadcastId: string | null = data.broadcast_id || null;
  const linkUrl: string | null = data.click?.link || data.link || null;

  const eventMap: Record<string, string> = {
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.delivered": "delivered",
  };
  const eventType = eventMap[type];
  if (!eventType) return NextResponse.json({ ok: true, ignored: type });

  let issueId: number | null = null;
  if (broadcastId) {
    const issueRows = await sql`SELECT id FROM newsletter_issues WHERE resend_broadcast_id=${broadcastId} LIMIT 1`;
    issueId = (issueRows[0] as any)?.id || null;
  }

  await sql`INSERT INTO newsletter_events (issue_id, subscriber_email, event_type, link_url) VALUES (${issueId}, ${email}, ${eventType}, ${linkUrl})`;

  if (issueId) {
    const col = eventType === "opened" ? "opens" : eventType === "clicked" ? "clicks" : eventType === "bounced" ? "bounced" : eventType === "complained" ? "complained" : null;
    if (col) await sql.query(`UPDATE newsletter_issues SET ${col} = ${col} + 1 WHERE id = $1`, [issueId]);
    // Unique opens/clicks: only the first event of that type per email per issue counts.
    if (eventType === "opened" || eventType === "clicked") {
      const priorRows = await sql`SELECT COUNT(*)::int AS c FROM newsletter_events WHERE issue_id=${issueId} AND subscriber_email=${email} AND event_type=${eventType}`;
      if ((priorRows[0] as any)?.c === 1) {
        const uniqCol = eventType === "opened" ? "unique_opens" : "unique_clicks";
        await sql.query(`UPDATE newsletter_issues SET ${uniqCol} = ${uniqCol} + 1 WHERE id = $1`, [issueId]);
      }
    }
  }

  if (email) {
    if (eventType === "opened") {
      await sql`UPDATE newsletter_subscribers SET opens_count = opens_count + 1, last_opened_at = now() WHERE email=${email}`;
    } else if (eventType === "clicked") {
      await sql`UPDATE newsletter_subscribers SET clicks_count = clicks_count + 1 WHERE email=${email}`;
    } else if (eventType === "bounced") {
      // Hard bounce — stop mailing this address. Kept distinct from a
      // voluntary unsubscribe for list-hygiene reporting.
      await sql`UPDATE newsletter_subscribers SET status='bounced' WHERE email=${email} AND status='active'`;
    } else if (eventType === "complained") {
      await sql`UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now() WHERE email=${email}`;
    }
  }

  return NextResponse.json({ ok: true });
}
