import { NextRequest, NextResponse } from "next/server";
import { realCurrentUser, VIEW_AS_COOKIE } from "@/lib/auth-server";

/** { role, team? } — starts a preview. Only a real chief admin (role=admin, no team) may call this. */
export async function POST(req: NextRequest) {
  const me = await realCurrentUser(req);
  if (!me || me.role !== "admin" || me.team) {
    return NextResponse.json({ error: "רק מנהל ראשי יכול להשתמש בתצוגת \"צפה כ...\"" }, { status: 403 });
  }
  const { role, team } = await req.json();
  if (!role) return NextResponse.json({ error: "missing role" }, { status: 400 });

  const res = NextResponse.json({ ok: true, role, team: team || null });
  res.cookies.set(VIEW_AS_COOKIE, JSON.stringify({ role, team: team || null }), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 4, // 4 hours — a preview session, not a permanent switch
  });
  return res;
}

/** Ends the preview and returns to the real chief-admin identity. */
export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(VIEW_AS_COOKIE);
  return res;
}

/** Reports whether a preview is currently active, and as what. */
export async function GET(req: NextRequest) {
  const raw = req.cookies.get(VIEW_AS_COOKIE)?.value;
  if (!raw) return NextResponse.json({ active: false });
  try {
    const { role, team } = JSON.parse(raw);
    return NextResponse.json({ active: true, role, team: team || null });
  } catch {
    return NextResponse.json({ active: false });
  }
}
