import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { signInstitutionSession, INSTITUTION_SESSION_COOKIE } from "@/lib/institution-session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "נדרש דוא\"ל וסיסמה" }, { status: 400 });

  const [row] = await sql`SELECT * FROM institution_users WHERE email=${email}`;
  if (!row || !row.password_hash) {
    return NextResponse.json({ error: "פרטי התחברות שגויים, או שהחשבון עדיין לא הוגדר — פנה לנתיבים" }, { status: 401 });
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return NextResponse.json({ error: "פרטי התחברות שגויים" }, { status: 401 });

  await sql`UPDATE institution_users SET last_login_at = now() WHERE id=${row.id}`;
  const token = await signInstitutionSession({ id: row.id, organizationId: row.organization_id, name: row.name, email: row.email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(INSTITUTION_SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(INSTITUTION_SESSION_COOKIE);
  return res;
}
