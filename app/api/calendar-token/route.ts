import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { randomBytes } from "crypto";
import { currentUser, isAdmin } from "@/lib/auth-server";

const makeToken = () => randomBytes(24).toString("hex");

async function ensureColumns() {
  try {
    await sql`ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS calendar_token text`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token text`;
  } catch {}
}

async function tokenForCoordinator(id: number) {
  const rows = await sql`SELECT calendar_token FROM coordinators WHERE id=${id} LIMIT 1`;
  if (!rows.length) return null;
  if ((rows[0] as any).calendar_token) return (rows[0] as any).calendar_token;
  const t = makeToken();
  await sql`UPDATE coordinators SET calendar_token=${t} WHERE id=${id}`;
  return t;
}

async function tokenForUserEmail(email: string) {
  const rows = await sql`SELECT calendar_token FROM users WHERE email=${email} LIMIT 1`;
  if (!rows.length) return null;
  if ((rows[0] as any).calendar_token) return (rows[0] as any).calendar_token;
  const t = makeToken();
  await sql`UPDATE users SET calendar_token=${t} WHERE email=${email}`;
  return t;
}

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ token: null }, { status: 401 });

  await ensureColumns();

  const coordId = req.nextUrl.searchParams.get("coordinator_id");
  const admin = isAdmin(me);

  // ── Coordinator token ───────────────────────────────────────
  if (coordId && coordId !== "0") {
    const id = parseInt(coordId, 10);
    if (Number.isNaN(id)) return NextResponse.json({ token: null }, { status: 400 });

    if (!admin) {
      // A coordinator may only ask for their own record.
      const own = await sql`SELECT id FROM coordinators WHERE id=${id} AND (user_id=${me.id} OR email=${me.email}) LIMIT 1`;
      if (!own.length) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }
    return NextResponse.json({ token: await tokenForCoordinator(id) });
  }

  // ── User token ──────────────────────────────────────────────
  const askedEmail = req.nextUrl.searchParams.get("email");
  const askedUserId = req.nextUrl.searchParams.get("user_id");

  // Non-admins always get their own, whatever they asked for.
  if (!admin) return NextResponse.json({ token: await tokenForUserEmail(me.email) });

  if (askedEmail) return NextResponse.json({ token: await tokenForUserEmail(askedEmail) });
  if (askedUserId && askedUserId !== "0") {
    const rows = await sql`SELECT email FROM users WHERE id=${parseInt(askedUserId, 10)} LIMIT 1`;
    const e = (rows[0] as any)?.email;
    return NextResponse.json({ token: e ? await tokenForUserEmail(e) : null });
  }
  return NextResponse.json({ token: await tokenForUserEmail(me.email) });
}
