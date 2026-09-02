import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { sendBroadcastIssue, sendSegmentedIssue, buildIssueHtml } from "@/lib/newsletter";

/**
 * Sends a draft/scheduled/failed issue right now. Used by the admin's
 * manual "שלח עכשיו" button on a draft, and by the scheduled function
 * that fires off due `scheduled` issues (see netlify/functions).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await ctx.params;
  const eid = parseInt(id);

  const rows = await sql`SELECT * FROM newsletter_issues WHERE id=${eid} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  const issue: any = rows[0];
  if (issue.status === "sent") return NextResponse.json({ error: "הגיליון כבר נשלח" }, { status: 409 });

  const content = { subject: issue.subject, intro: issue.intro, blocks: issue.blocks || [], closing: issue.closing };
  // Custom-HTML issues store the fully-rendered html directly (intro is
  // just the "[HTML מותאם אישית]" marker) — pass it straight through
  // rather than re-rendering from the template fields.
  const customHtml: string | null = issue.intro === "[HTML מותאם אישית]" ? issue.html : null;

  const opts = { fromName: issue.from_name, replyTo: issue.reply_to };
  const result = issue.segment_area
    ? await sendSegmentedIssue(content, customHtml, issue.segment_area, opts)
    : await sendBroadcastIssue(content, customHtml, opts);

  const updated = await sql`
    UPDATE newsletter_issues SET
      status=${result.ok ? "sent" : "failed"},
      html=${result.html},
      sent_at=${result.ok ? new Date().toISOString() : null},
      recipients=${result.recipients || 0},
      resend_broadcast_id=${(result as any).broadcastId || null}
    WHERE id=${eid}
    RETURNING *`;

  if (!result.ok) return NextResponse.json({ error: result.reason || "השליחה נכשלה", issue: updated[0] }, { status: 502 });
  return NextResponse.json({ ok: true, issue: updated[0] });
}
