import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const c = await cookies();
  const user = await verifySession(c.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ user });
}
