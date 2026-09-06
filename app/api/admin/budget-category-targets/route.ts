import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`SELECT * FROM budget_category_targets`;
  return NextResponse.json({ targets: rows });
}

/** { category, target_amount } */
export async function POST(req: NextRequest) {
  const { category, target_amount } = await req.json();
  if (!category) return NextResponse.json({ error: "missing category" }, { status: 400 });
  await sql`
    INSERT INTO budget_category_targets (category, target_amount) VALUES (${category}, ${target_amount || 0})
    ON CONFLICT (category) DO UPDATE SET target_amount=${target_amount || 0}`;
  return NextResponse.json({ ok: true });
}
