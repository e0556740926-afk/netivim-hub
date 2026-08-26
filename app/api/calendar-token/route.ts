import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const coordId = req.nextUrl.searchParams.get("coordinator_id");
  if (!userId && !coordId) return NextResponse.json({ token: null });

  try {
    await sql`ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS calendar_token text`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token text`;
  } catch {}

  if (coordId) {
    let rows = await sql`SELECT calendar_token FROM coordinators WHERE id=${parseInt(coordId)} LIMIT 1`;
    if (!rows[0]?.calendar_token) {
      await sql`UPDATE coordinators SET calendar_token=encode(gen_random_bytes(24),'hex') WHERE id=${parseInt(coordId)}`;
      rows = await sql`SELECT calendar_token FROM coordinators WHERE id=${parseInt(coordId)} LIMIT 1`;
    }
    return NextResponse.json({ token: rows[0]?.calendar_token });
  }

  if (userId) {
    let rows = await sql`SELECT calendar_token FROM users WHERE id=${parseInt(userId)} LIMIT 1`;
    if (!rows[0]?.calendar_token) {
      await sql`UPDATE users SET calendar_token=encode(gen_random_bytes(24),'hex') WHERE id=${parseInt(userId)}`;
      rows = await sql`SELECT calendar_token FROM users WHERE id=${parseInt(userId)} LIMIT 1`;
    }
    return NextResponse.json({ token: rows[0]?.calendar_token });
  }

  return NextResponse.json({ token: null });
}
