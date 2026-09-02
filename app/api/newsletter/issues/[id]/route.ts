import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { buildIssueHtml, IssueContent } from "@/lib/newsletter";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await ctx.params;
  const rows = await sql`SELECT * FROM newsletter_issues WHERE id=${parseInt(id)} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  return NextResponse.json({ issue: rows[0] });
}

/** Edits a draft or scheduled issue — sent issues are immutable history. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await ctx.params;
  const eid = parseInt(id);

  const existing = await sql`SELECT status FROM newsletter_issues WHERE id=${eid} LIMIT 1`;
  if (!existing.length) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  if ((existing[0] as any).status === "sent") {
    return NextResponse.json({ error: "לא ניתן לערוך גיליון שכבר נשלח" }, { status: 409 });
  }

  const d = await req.json();
  const content: IssueContent = {
    subject: (d.subject || "").trim(),
    intro: d.intro || "",
    blocks: Array.isArray(d.blocks) ? d.blocks.filter((b: any) => b.title?.trim() || b.text?.trim()) : [],
    closing: d.closing || "",
  };
  if (!content.subject) return NextResponse.json({ error: "כותרת היא שדה חובה" }, { status: 400 });
  const customHtml: string | null = d.customHtml?.trim() || null;
  const segmentArea: string | null = d.segmentArea?.trim() || null;
  const fromName: string | null = d.fromName?.trim() || null;
  const replyTo: string | null = d.replyTo?.trim() || null;
  const status: "draft" | "scheduled" = d.scheduledAt ? "scheduled" : "draft";
  const html = buildIssueHtml(content, customHtml);

  const rows = await sql`
    UPDATE newsletter_issues SET
      subject=${content.subject},
      intro=${customHtml ? "[HTML מותאם אישית]" : content.intro},
      blocks=${JSON.stringify(content.blocks)},
      closing=${content.closing},
      html=${html},
      status=${status},
      scheduled_at=${d.scheduledAt || null},
      segment_area=${segmentArea},
      from_name=${fromName},
      reply_to=${replyTo}
    WHERE id=${eid}
    RETURNING *`;
  return NextResponse.json({ ok: true, issue: rows[0] });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await ctx.params;
  const eid = parseInt(id);
  const existing = await sql`SELECT status FROM newsletter_issues WHERE id=${eid} LIMIT 1`;
  if ((existing[0] as any)?.status === "sent") {
    return NextResponse.json({ error: "לא ניתן למחוק גיליון שכבר נשלח" }, { status: 409 });
  }
  await sql`DELETE FROM newsletter_issues WHERE id=${eid}`;
  return NextResponse.json({ ok: true });
}
