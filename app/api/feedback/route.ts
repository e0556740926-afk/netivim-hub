import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const [row] = await sql`SELECT id, responded_at FROM feedback_responses WHERE token=${token}`;
  if (!row) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  return NextResponse.json({ already_responded: !!row.responded_at });
}

/** { token, received_response, personalized_score, nps } */
export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.token) return NextResponse.json({ error: "missing token" }, { status: 400 });
  const [row] = await sql`SELECT id FROM feedback_responses WHERE token=${d.token}`;
  if (!row) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  await sql`
    UPDATE feedback_responses SET responded_at=now(), received_response=${!!d.received_response},
      personalized_score=${d.personalized_score || null}, nps=${d.nps ?? null}
    WHERE id=${row.id}`;
  return NextResponse.json({ ok: true });
}
