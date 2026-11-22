import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { canTouchEvent } from "@/lib/event-access";
import { hasColumn } from "@/lib/schema";

/** Event info sheet for the WhatsApp event bot and the day-before message: address, parking, program… */
const BOT_INFO_FIELDS = ["address", "nav", "parking", "transport", "program", "access", "contact", "extra"] as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!(await canTouchEvent(req, id)).ok) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  if (!(await hasColumn("events", "bot_info"))) return NextResponse.json({ info: {}, available: false });
  const [e] = await sql`SELECT bot_info, location FROM events WHERE id=${id}`;
  return NextResponse.json({ info: e?.bot_info || {}, location: e?.location || "", available: true });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!(await canTouchEvent(req, id)).ok) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const d = await req.json().catch(() => ({}));
  const info: Record<string, string> = {};
  for (const k of BOT_INFO_FIELDS) { const v = String(d?.[k] ?? "").trim().slice(0, 1500); if (v) info[k] = v; }
  await sql`UPDATE events SET bot_info=${JSON.stringify(info)}::jsonb WHERE id=${id}`;
  return NextResponse.json({ info });
}
