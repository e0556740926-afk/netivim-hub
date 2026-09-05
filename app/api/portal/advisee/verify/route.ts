import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { signAdviseeSession, ADVISEE_SESSION_COOKIE } from "@/lib/advisee-session";

export async function POST(req: NextRequest) {
  const { phone, id_number, otp } = await req.json();
  if (!phone || !id_number || !otp) return NextResponse.json({ error: "חסרים פרטים" }, { status: 400 });

  const [c] = await sql`
    SELECT id, name, advisee_otp_code, advisee_otp_expires_at FROM leads
    WHERE phone=${phone} AND id_number=${id_number} AND deleted_at IS NULL`;
  if (!c || !c.advisee_otp_code || c.advisee_otp_code !== otp) {
    return NextResponse.json({ error: "קוד שגוי" }, { status: 401 });
  }
  if (!c.advisee_otp_expires_at || new Date(c.advisee_otp_expires_at) < new Date()) {
    return NextResponse.json({ error: "הקוד פג תוקף, בקש קוד חדש" }, { status: 401 });
  }

  await sql`UPDATE leads SET advisee_otp_code=NULL, advisee_otp_expires_at=NULL WHERE id=${c.id}`;
  const token = await signAdviseeSession({ caseId: c.id, name: c.name });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADVISEE_SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADVISEE_SESSION_COOKIE);
  return res;
}
