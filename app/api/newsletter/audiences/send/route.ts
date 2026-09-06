import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { sendWhatsApp } from "@/lib/whatsapp";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/**
 * { recipients: {email,phone}[], subject, html, channel: "email"|"whatsapp" }
 * Deliberately separate from the mature newsletter_issues pipeline (which
 * has open/click analytics, unsubscribe tokens, RFC 8058 compliance) —
 * building all of that for an ad-hoc filtered blast to internal-facing
 * audiences (partners, advisees, parents-who-inquired) is out of scope
 * here. This is a plain send: no tracking, no unsubscribe link. Fine for
 * "email/WhatsApp everyone matching this filter right now"; not a
 * replacement for the newsletter subscriber pipeline.
 */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const channel = d.channel === "whatsapp" ? "whatsapp" : "email";
  const recipients: { email?: string; phone?: string }[] = d.recipients || [];
  const valid = recipients.filter(r => channel === "whatsapp" ? !!r.phone : !!r.email);
  if (!valid.length) return NextResponse.json({ error: `no valid recipients with a ${channel === "whatsapp" ? "phone" : "email"}` }, { status: 400 });
  if (!d.subject && channel === "email") return NextResponse.json({ error: "missing subject" }, { status: 400 });
  if (!d.html) return NextResponse.json({ error: "missing message body" }, { status: 400 });

  const me = await currentUser(req);
  let sent = 0;
  if (channel === "whatsapp") {
    // WhatsApp has no subject line or HTML — strip tags to plain text.
    const plainText = d.html.replace(/<[^>]+>/g, "");
    for (const r of valid) {
      const res = await sendWhatsApp(r.phone!, plainText);
      if (res.ok) sent++;
    }
  } else {
    for (const r of valid) {
      const res: any = await sendEmail({ to: r.email!, subject: d.subject, html: d.html });
      if (res?.ok) sent++;
    }
  }
  logAudit({ entityType: "organization", entityId: 0, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `דיוור אד-הוק (${channel === "whatsapp" ? "WhatsApp" : "דוא\"ל"}) נשלח ל-${sent}/${valid.length} נמענים: ${d.subject || plainTextSubjectFallback(d.html)}` });
  return NextResponse.json({ ok: true, sent, total: valid.length, channel });
}

function plainTextSubjectFallback(html: string) {
  return html.replace(/<[^>]+>/g, "").slice(0, 40);
}
