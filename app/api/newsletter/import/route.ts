import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { upsertResendContact } from "@/lib/newsletter";

/**
 * Two admin write paths sharing one file:
 *   POST { name, email, coordinator_id? }                — add one parent manually
 *   POST { rows: [{name,email}], coordinator_id? }        — bulk import (from a parsed CSV)
 *
 * Both skip an email that's already an active subscriber rather than
 * erroring, since the common case for a bulk import is "some of these
 * are already on the list" — the useful result is how many were
 * actually new.
 */
export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  if (!(await hasColumn("newsletter_subscribers", "id"))) {
    return NextResponse.json({ error: "הפיצ'ר ממתין לעדכון מסד נתונים" }, { status: 409 });
  }

  const d = await req.json();
  const coordinatorId: number | null = d.coordinator_id ? parseInt(d.coordinator_id) : null;
  const rows: { name: string; email: string }[] = Array.isArray(d.rows)
    ? d.rows
    : (d.name && d.email ? [{ name: d.name, email: d.email }] : []);

  if (!rows.length) return NextResponse.json({ error: "אין נתונים לייבוא" }, { status: 400 });

  let added = 0, skipped = 0;
  for (const r of rows) {
    const name = String(r.name || "").trim();
    const email = String(r.email || "").trim().toLowerCase();
    if (!name || !email || !email.includes("@")) { skipped++; continue; }

    const existing = await sql`SELECT id, status FROM newsletter_subscribers WHERE email=${email} LIMIT 1`;
    if (existing.length) {
      if ((existing[0] as any).status === "active") { skipped++; continue; }
      await sql`UPDATE newsletter_subscribers SET status='active', unsubscribed_at=NULL WHERE id=${(existing[0] as any).id}`;
      added++;
      continue;
    }

    const inserted = await sql`
      INSERT INTO newsletter_subscribers (name, email, coordinator_id, source)
      VALUES (${name}, ${email}, ${coordinatorId}, ${coordinatorId ? "coordinator" : "manual"})
      RETURNING id`;
    const resendId = await upsertResendContact(email, name);
    if (resendId) await sql`UPDATE newsletter_subscribers SET resend_contact_id=${resendId} WHERE id=${inserted[0].id}`;
    added++;
  }

  return NextResponse.json({ ok: true, added, skipped });
}
