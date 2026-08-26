import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { randomBytes } from "crypto";

function makeToken() {
  return randomBytes(24).toString("hex");
}

async function ensureColumns() {
  try {
    await sql`ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS calendar_token text`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token text`;
  } catch {}
}

export async function GET(req: NextRequest) {
  const coordId  = req.nextUrl.searchParams.get("coordinator_id");
  const email    = req.nextUrl.searchParams.get("email");
  const userId   = req.nextUrl.searchParams.get("user_id");

  await ensureColumns();

  // ── By coordinator_id ──────────────────────────────────────────
  if (coordId && coordId !== "0") {
    const rows = await sql`SELECT id, calendar_token FROM coordinators WHERE id=${parseInt(coordId)} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ token: null });
    if (!rows[0].calendar_token) {
      const t = makeToken();
      await sql`UPDATE coordinators SET calendar_token=${t} WHERE id=${parseInt(coordId)}`;
      return NextResponse.json({ token: t });
    }
    return NextResponse.json({ token: rows[0].calendar_token });
  }

  // ── By email ───────────────────────────────────────────────────
  if (email) {
    const rows = await sql`SELECT id, calendar_token FROM users WHERE email=${email} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ token: null });
    if (!rows[0].calendar_token) {
      const t = makeToken();
      await sql`UPDATE users SET calendar_token=${t} WHERE email=${email}`;
      return NextResponse.json({ token: t });
    }
    return NextResponse.json({ token: rows[0].calendar_token });
  }

  // ── By user_id ─────────────────────────────────────────────────
  if (userId && userId !== "0") {
    const rows = await sql`SELECT id, calendar_token FROM users WHERE id=${parseInt(userId)} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ token: null });
    if (!rows[0].calendar_token) {
      const t = makeToken();
      await sql`UPDATE users SET calendar_token=${t} WHERE id=${parseInt(userId)}`;
      return NextResponse.json({ token: t });
    }
    return NextResponse.json({ token: rows[0].calendar_token });
  }

  return NextResponse.json({ token: null });
}
