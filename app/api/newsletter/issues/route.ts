import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { sendBroadcastIssue, sendSegmentedIssue, buildIssueHtml, IssueContent } from "@/lib/newsletter";

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  if (!(await hasColumn("newsletter_issues", "id"))) {
    return NextResponse.json({ issues: [], available: false });
  }
  const rows = await sql`SELECT id,subject,intro,blocks,closing,status,scheduled_at,segment_area,from_name,reply_to,sent_at,recipients,
    resend_broadcast_id,created_by,created_at,opens,clicks,unique_opens,unique_clicks,bounced,complained
    FROM newsletter_issues ORDER BY COALESCE(scheduled_at, sent_at, created_at) DESC LIMIT 100`;
  return NextResponse.json({ issues: rows, available: true });
}

function buildContent(d: any): IssueContent {
  return {
    subject: (d.subject || "").trim(),
    intro: d.intro || "",
    blocks: Array.isArray(d.blocks) ? d.blocks.filter((b: any) => b.title?.trim() || b.text?.trim()) : [],
    closing: d.closing || "",
  };
}

/**
 * mode: "draft" (save only) | "schedule" (save + scheduled_at, sent later
 * by the scheduled function) | "send" (default — send immediately, to the
 * full audience or, if segment_area is set, only that region).
 */
export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const d = await req.json();
  const mode: "draft" | "schedule" | "send" = d.mode || "send";
  if (!d.subject?.trim()) return NextResponse.json({ error: "כותרת היא שדה חובה" }, { status: 400 });

  const content = buildContent(d);
  const customHtml: string | null = d.customHtml?.trim() || null;
  const segmentArea: string | null = d.segmentArea?.trim() || null;
  const fromName: string | null = d.fromName?.trim() || null;
  const replyTo: string | null = d.replyTo?.trim() || null;

  if (mode === "draft" || mode === "schedule") {
    if (mode === "schedule" && !d.scheduledAt) {
      return NextResponse.json({ error: "יש לבחור תאריך ושעה לתזמון" }, { status: 400 });
    }
    const html = buildIssueHtml(content, customHtml);
    const rows = await sql`
      INSERT INTO newsletter_issues (subject, intro, blocks, closing, html, status, scheduled_at, segment_area, from_name, reply_to, created_by)
      VALUES (${content.subject}, ${customHtml ? "[HTML מותאם אישית]" : content.intro}, ${JSON.stringify(content.blocks)}, ${content.closing},
              ${html}, ${mode === "schedule" ? "scheduled" : "draft"}, ${mode === "schedule" ? d.scheduledAt : null}, ${segmentArea}, ${fromName}, ${replyTo}, ${me?.name || ""})
      RETURNING *`;
    return NextResponse.json({ ok: true, issue: rows[0] });
  }

  // mode === "send" — send right now.
  const opts = { fromName, replyTo };
  const result = segmentArea
    ? await sendSegmentedIssue(content, customHtml, segmentArea, opts)
    : await sendBroadcastIssue(content, customHtml, opts);

  const rows = await sql`
    INSERT INTO newsletter_issues (subject, intro, blocks, closing, html, status, segment_area, from_name, reply_to, sent_at, recipients, resend_broadcast_id, created_by)
    VALUES (${content.subject}, ${customHtml ? "[HTML מותאם אישית]" : content.intro}, ${JSON.stringify(content.blocks)}, ${content.closing}, ${result.html},
            ${result.ok ? "sent" : "failed"}, ${segmentArea}, ${fromName}, ${replyTo}, ${result.ok ? new Date().toISOString() : null}, ${result.recipients || 0},
            ${(result as any).broadcastId || null}, ${me?.name || ""})
    RETURNING *`;

  if (!result.ok) {
    return NextResponse.json({ error: result.reason || "השליחה נכשלה", issue: rows[0] }, { status: 502 });
  }
  return NextResponse.json({ ok: true, issue: rows[0] });
}
