import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/**
 * { recipients: {email}[], subject, html }
 * Deliberately separate from the mature newsletter_issues pipeline (which
 * has open/click analytics, unsubscribe tokens, RFC 8058 compliance) —
 * building all of that for an ad-hoc filtered blast to internal-facing
 * audiences (partners, advisees, parents-who-inquired) is out of scope
 * here. This is a plain send: no tracking, no unsubscribe link. Fine for
 * "email everyone matching this filter right now"; not a replacement for
 * the newsletter subscriber pipeline.
 */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const recipients: { email?: string }[] = d.recipients || [];
  const valid = recipients.filter(r => r.email);
  if (!valid.length) return NextResponse.json({ error: "no valid recipients" }, { status: 400 });
  if (!d.subject || !d.html) return NextResponse.json({ error: "missing subject/html" }, { status: 400 });

  const me = await currentUser(req);
  let sent = 0;
  for (const r of valid) {
    const res: any = await sendEmail({ to: r.email!, subject: d.subject, html: d.html });
    if (res?.ok) sent++;
  }
  logAudit({ entityType: "organization", entityId: 0, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `דיוור אד-הוק נשלח ל-${sent}/${valid.length} נמענים: ${d.subject}` });
  return NextResponse.json({ ok: true, sent, total: valid.length });
}
