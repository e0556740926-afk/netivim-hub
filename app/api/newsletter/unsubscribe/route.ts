import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { unsubscribeResendContact } from "@/lib/newsletter";

/**
 * One-click unsubscribe target for segmented sends (see
 * sendSegmentedIssue in lib/newsletter.ts, which sets List-Unsubscribe
 * / List-Unsubscribe-Post headers pointing here). RFC 8058 requires
 * the POST path to work with no confirmation page and no login —
 * mail clients call it directly when the user taps "Unsubscribe".
 * GET is kept as a plain-link fallback for clients that don't support
 * one-click headers.
 */
async function doUnsubscribe(token: string | null) {
  if (!token) return false;
  const rows = await sql`SELECT id, resend_contact_id FROM newsletter_subscribers WHERE manage_token=${token} LIMIT 1`;
  if (!rows.length) return false;
  const row: any = rows[0];
  await sql`UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now() WHERE id=${row.id}`;
  await unsubscribeResendContact(row.resend_contact_id || null);
  return true;
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const ok = await doUnsubscribe(token);
  return NextResponse.json({ ok });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const ok = await doUnsubscribe(token);
  return NextResponse.redirect(new URL(ok ? "/newsletter/unsubscribed" : "/newsletter/preferences", req.url));
}
