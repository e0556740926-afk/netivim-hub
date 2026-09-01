import { NextRequest, NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth-server";

/**
 * Temporary diagnostic — calls Resend's audience-creation endpoint
 * directly and returns the raw response, since Netlify function logs
 * aren't reachable from here. Delete once the real issue is found.
 */
export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ diagnosis: "RESEND_API_KEY is not set at all" });

  try {
    const res = await fetch("https://api.resend.com/audiences", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "diagnostic-check" }),
    });
    const body = await res.text();
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      body,
      keyPrefix: key.slice(0, 6) + "...",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
