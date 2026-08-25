import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const rows = await sql`
    SELECT * FROM users
    WHERE email = ${email} AND password = ${password} AND status = 'active'
    LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: "אימייל או סיסמה שגויים" }, { status: 401 });
  const user = rows[0];
  const res = NextResponse.json({ user });
  res.cookies.set("netivim_user", JSON.stringify(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 604800,
    path: "/",
  });
  return res;
}
