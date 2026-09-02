import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";

/** Public — no auth. Lists past sent issues so people who missed an email can still read it. */
export async function GET() {
  if (!(await hasColumn("newsletter_issues", "id"))) return NextResponse.json({ issues: [] });
  const rows = await sql`SELECT id, subject, sent_at FROM newsletter_issues WHERE status='sent' ORDER BY sent_at DESC LIMIT 50`;
  return NextResponse.json({ issues: rows });
}
