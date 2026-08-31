import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { sendMonthlyIssue } from "@/lib/newsletter";

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  if (!(await hasColumn("newsletter_issues", "id"))) {
    return NextResponse.json({ issues: [], available: false });
  }
  const rows = await sql`SELECT * FROM newsletter_issues ORDER BY created_at DESC LIMIT 50`;
  return NextResponse.json({ issues: rows, available: true });
}

/** Sends a new monthly issue immediately via Resend Broadcasts. */
export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const d = await req.json();
  if (!d.subject?.trim()) return NextResponse.json({ error: "כותרת היא שדה חובה" }, { status: 400 });

  const content = {
    subject: d.subject.trim(),
    intro: d.intro || "",
    blocks: Array.isArray(d.blocks) ? d.blocks.filter((b: any) => b.title?.trim() || b.text?.trim()) : [],
    closing: d.closing || "",
  };
  const customHtml: string | null = d.customHtml?.trim() || null;

  const result = await sendMonthlyIssue(content, customHtml);

  const rows = await sql`
    INSERT INTO newsletter_issues (subject, intro, blocks, closing, sent_at, recipients, resend_broadcast_id, created_by)
    VALUES (${content.subject}, ${customHtml ? "[HTML מותאם אישית]" : content.intro}, ${JSON.stringify(content.blocks)}, ${content.closing},
            ${result.ok ? new Date().toISOString() : null}, ${result.recipients || 0},
            ${result.broadcastId || null}, ${me?.name || ""})
    RETURNING *`;

  if (!result.ok) {
    return NextResponse.json({ error: result.reason || "השליחה נכשלה", issue: rows[0] }, { status: 502 });
  }
  return NextResponse.json({ ok: true, issue: rows[0] });
}
