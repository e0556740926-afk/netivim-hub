import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

/** Public — returns the stored rendered html of one sent issue for the "read online" archive page. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await sql`SELECT subject, html, sent_at FROM newsletter_issues WHERE id=${parseInt(id)} AND status='sent' LIMIT 1`;
  if (!rows.length) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  return NextResponse.json({ issue: rows[0] });
}
