import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`
    SELECT v.*,
      (SELECT count(*)::int FROM purchase_orders po WHERE po.vendor_id = v.id) AS order_count
    FROM vendors v ORDER BY name`;
  return NextResponse.json({ vendors: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const rows = await sql`
    INSERT INTO vendors (name, contact, category, rating)
    VALUES (${d.name}, ${d.contact || null}, ${d.category || null}, ${d.rating || null})
    RETURNING *`;
  return NextResponse.json({ vendor: rows[0] });
}
