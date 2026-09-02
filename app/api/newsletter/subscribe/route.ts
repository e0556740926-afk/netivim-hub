import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { upsertResendContact, sendWelcomeEmail } from "@/lib/newsletter";

/**
 * Public signup — no auth, matches /api/leads POST's public-form
 * treatment (already allow-listed in middleware for POST).
 * Accepts an optional coordinator slug so a coordinator's personal
 * newsletter link (/newsletter/[slug]) can attribute signups to them,
 * reusing the same slug already minted for their lead-form link.
 */
export async function POST(req: NextRequest) {
  if (!(await hasColumn("newsletter_subscribers", "id"))) {
    return NextResponse.json({ error: "הרשמה אינה זמינה כרגע" }, { status: 409 });
  }

  const d = await req.json();
  if (!d.name?.trim() || !d.email?.trim()) {
    return NextResponse.json({ error: "שם ומייל הם שדות חובה" }, { status: 400 });
  }

  const existing = await sql`SELECT id, status FROM newsletter_subscribers WHERE email=${d.email} LIMIT 1`;
  if (existing.length) {
    const row: any = existing[0];
    if (row.status === "unsubscribed") {
      // Re-subscribing after a previous opt-out — reactivate rather
      // than reject, this is a normal and expected flow.
      await sql`UPDATE newsletter_subscribers SET status='active', unsubscribed_at=NULL WHERE id=${row.id}`;
      return NextResponse.json({ ok: true, reactivated: true });
    }
    return NextResponse.json({ ok: true, already: true });
  }

  let coordinatorId: number | null = null;
  let source = "general";
  if (d.slug) {
    const cr = await sql`SELECT id FROM coordinators WHERE slug=${d.slug} LIMIT 1`;
    if (cr.length) { coordinatorId = (cr[0] as any).id; source = "coordinator"; }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const consentSource = d.slug ? `לינק אישי רכז (${d.slug})` : "טופס ציבורי";

  const rows = await sql`
    INSERT INTO newsletter_subscribers (name, email, coordinator_id, source, area, consent_source, consent_ip)
    VALUES (${d.name.trim()}, ${d.email.trim()}, ${coordinatorId}, ${source}, ${d.area?.trim() || null}, ${consentSource}, ${ip})
    RETURNING id`;

  // Best-effort — never blocks the signup itself.
  const resendId = await upsertResendContact(d.email.trim(), d.name.trim());
  if (resendId) {
    await sql`UPDATE newsletter_subscribers SET resend_contact_id=${resendId} WHERE id=${rows[0].id}`;
  }
  sendWelcomeEmail(d.name.trim(), d.email.trim()).catch(e => console.error("[newsletter] welcome email error:", e));

  return NextResponse.json({ ok: true });
}
