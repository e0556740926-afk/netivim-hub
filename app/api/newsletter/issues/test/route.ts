import { NextRequest, NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { sendTestEmail, IssueContent } from "@/lib/newsletter";

/** Sends a one-off preview copy without touching any subscriber data. */
export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const d = await req.json();
  const to = (d.email || me?.email || "").trim();
  if (!to) return NextResponse.json({ error: "אין כתובת מייל לשליחת הבדיקה" }, { status: 400 });
  if (!d.subject?.trim()) return NextResponse.json({ error: "כותרת היא שדה חובה" }, { status: 400 });

  const content: IssueContent = {
    subject: d.subject.trim(),
    intro: d.intro || "",
    blocks: Array.isArray(d.blocks) ? d.blocks.filter((b: any) => b.title?.trim() || b.text?.trim()) : [],
    closing: d.closing || "",
  };
  const customHtml: string | null = d.customHtml?.trim() || null;

  const result = await sendTestEmail(to, content, customHtml, me?.name);
  if (!result.ok) return NextResponse.json({ error: result.reason || "השליחה נכשלה" }, { status: 502 });
  return NextResponse.json({ ok: true, to });
}
