import { NextRequest, NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { claudeConfigured, claudeModel } from "@/lib/anthropic";
import { startKnowledgeRefresh, trackKnowledgeStatus } from "@/lib/tracks-knowledge";

/** Tracks-bot knowledge: what the bot knows from the knowledge center, and a refresh button. Admins only. */
async function guard(req: NextRequest) { const me = await currentUser(req); return me && isAdmin(me) ? me : null; }

export async function GET(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  return NextResponse.json({ configured: claudeConfigured(), model: claudeModel(), items: await trackKnowledgeStatus() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  if (!claudeConfigured()) return NextResponse.json({ error: "חסר מפתח ANTHROPIC_API_KEY במשתני הסביבה של Netlify" }, { status: 409 });
  const origin = (process.env.NEXTAUTH_URL || req.nextUrl.origin).replace(/\/$/, "");
  const started = await startKnowledgeRefresh(origin).catch(() => false);
  if (!started) return NextResponse.json({ error: "לא ניתן להפעיל את העדכון כרגע" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
