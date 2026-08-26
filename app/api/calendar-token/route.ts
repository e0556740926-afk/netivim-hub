import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

async function ensureColumns() {
  try {
    await sql`ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS calendar_token text`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token text`;
  } catch {}
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const coordId = req.nextUrl.searchParams.get("coordinator_id");
  const email = req.nextUrl.searchParams.get("email");

  await ensureColumns();

  // By coordinator_id
  if (coordId && coordId !== "0") {
    let rows = await sql`SELECT calendar_token FROM coordinators WHERE id=${parseInt(coordId)} LIMIT 1`;
    if (!rows[0]?.calendar_token) {
      await sql`UPDATE coordinators SET calendar_token=encode(gen_random_bytes(24),'hex') WHERE id=${parseInt(coordId)}`;
      rows = await sql`SELECT calendar_token FROM coordinators WHERE id=${parseInt(coordId)} LIMIT 1`;
    }
    return NextResponse.json({ token: rows[0]?.calendar_token || null });
  }

  // By email
  if (email) {
    let rows = await sql`SELECT calendar_token FROM users WHERE email=${email} LIMIT 1`;
    if (!rows[0]?.calendar_token) {
      await sql`UPDATE users SET calendar_token=encode(gen_random_bytes(24),'hex') WHERE email=${email}`;
      rows = await sql`SELECT calendar_token FROM users WHERE email=${email} LIMIT 1`;
    }
    return NextResponse.json({ token: rows[0]?.calendar_token || null });
  }

  // By user_id (only if not 0)
  if (userId && userId !== "0") {
    let rows = await sql`SELECT calendar_token FROM users WHERE id=${parseInt(userId)} LIMIT 1`;
    if (!rows[0]?.calendar_token) {
      await sql`UPDATE users SET calendar_token=encode(gen_random_bytes(24),'hex') WHERE id=${parseInt(userId)}`;
      rows = await sql`SELECT calendar_token FROM users WHERE id=${parseInt(userId)} LIMIT 1`;
    }
    return NextResponse.json({ token: rows[0]?.calendar_token || null });
  }

  return NextResponse.json({ token: null });
}
