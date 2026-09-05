import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";

export async function GET() {
  const rows = await sql`SELECT category FROM field_budget_categories ORDER BY category`;
  return NextResponse.json({ categories: (rows as any[]).map(r => r.category) });
}

export async function POST(req: NextRequest) {
  const { category } = await req.json();
  if (!category) return NextResponse.json({ error: "missing category" }, { status: 400 });
  const me = await currentUser(req);
  await sql`INSERT INTO field_budget_categories (category, added_by) VALUES (${category}, ${me?.name || null}) ON CONFLICT DO NOTHING`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { category } = await req.json();
  await sql`DELETE FROM field_budget_categories WHERE category=${category}`;
  return NextResponse.json({ ok: true });
}
