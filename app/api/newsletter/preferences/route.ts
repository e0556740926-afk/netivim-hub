import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { unsubscribeResendContact } from "@/lib/newsletter";

/**
 * Public preference center — identified by email, same trust level as
 * the public subscribe form (no login there either). Lets a subscriber
 * change their region tag / send frequency, or unsubscribe, without a
 * phone call to the office.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "נא להזין כתובת מייל" }, { status: 400 });
  const rows = await sql`SELECT name, email, area, frequency, status FROM newsletter_subscribers WHERE email=${email} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ error: "לא נמצאה הרשמה עם המייל הזה" }, { status: 404 });
  return NextResponse.json({ subscriber: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  const email = (d.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "נא להזין כתובת מייל" }, { status: 400 });
  const rows = await sql`SELECT id, resend_contact_id FROM newsletter_subscribers WHERE email=${email} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ error: "לא נמצאה הרשמה עם המייל הזה" }, { status: 404 });
  const row: any = rows[0];

  if (d.unsubscribe) {
    await sql`UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now() WHERE id=${row.id}`;
    await unsubscribeResendContact(row.resend_contact_id || null);
    return NextResponse.json({ ok: true, unsubscribed: true });
  }

  await sql`UPDATE newsletter_subscribers SET area=${d.area || null}, frequency=${d.frequency || "monthly"} WHERE id=${row.id}`;
  return NextResponse.json({ ok: true });
}
