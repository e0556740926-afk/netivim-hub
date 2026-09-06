import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql`SELECT * FROM external_accounts ORDER BY created_at DESC`;
  return NextResponse.json({ accounts: rows });
}

/** { account_type: 'agency'|'funder', name, email?, access_expires_at? } */
export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.account_type || !d.name) return NextResponse.json({ error: "missing account_type/name" }, { status: 400 });
  const rows = await sql`
    INSERT INTO external_accounts (account_type, name, email, access_expires_at)
    VALUES (${d.account_type}, ${d.name}, ${d.email || null}, ${d.access_expires_at || null})
    RETURNING *`;
  return NextResponse.json({ account: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const { id, active } = await req.json();
  await sql`UPDATE external_accounts SET active=${active} WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
