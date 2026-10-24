import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { isBlockedEmail } from "@/lib/user-status";

export async function GET() {
  const c = await cookies();
  const user = await verifySession(c.get(SESSION_COOKIE)?.value);
  // A user deleted or deactivated after signing in is signed out on the next load.
  if (user && (await isBlockedEmail(user.email))) {
    const res = NextResponse.json({ user: null });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  return NextResponse.json({ user });
}
