import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { signSession, toSessionUser, SESSION_COOKIE } from "@/lib/session";
import { verifyPassword, isHashed, hashPassword } from "@/lib/password";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "אימייל וסיסמה נדרשים" }, { status: 400 });
  }

  const rows = await sql`
    SELECT * FROM users WHERE email = ${email} AND status = 'active' LIMIT 1
  `;
  if (!rows.length) {
    return NextResponse.json({ error: "אימייל או סיסמה שגויים" }, { status: 401 });
  }

  const row: any = rows[0];
  const ok = await verifyPassword(password, row.password);
  if (!ok) {
    return NextResponse.json({ error: "אימייל או סיסמה שגויים" }, { status: 401 });
  }

  // Transparently upgrade legacy plaintext passwords to a hash
  if (!isHashed(row.password)) {
    try {
      const hashed = await hashPassword(password);
      await sql`UPDATE users SET password = ${hashed} WHERE id = ${row.id}`;
    } catch (e) { console.error("[pw upgrade]", e); }
  }

  const user = toSessionUser(row);
  const token = await signSession(user);
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${row.id}`;

  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 604800,
    path: "/",
  });
  // clear the old insecure cookie if present
  res.cookies.set("netivim_user", "", { maxAge: 0, path: "/" });
  return res;
}
