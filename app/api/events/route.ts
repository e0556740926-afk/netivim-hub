import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";

export async function GET() {
  const [events, expenses] = await Promise.all([
    sql`SELECT * FROM events ORDER BY date`,
    sql`SELECT event_id, amount FROM expenses`,
  ]);
  return NextResponse.json({ events, expenses });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO events (name, date, time, location, status, budget_planned, target_attendees, approved)
    VALUES (${d.name}, ${d.date||null}, ${d.time||''}, ${d.location||''}, 'pending_approval', ${d.budget_planned||0}, ${d.target_attendees||0}, false)
    RETURNING *
  `;
  const me = await currentUser(req);
  logAudit({ entityType:"event", entityId:rows[0].id, action:"create", actorName:me?.name, actorEmail:me?.email, summary:`נוצר: ${rows[0].name}` });
  return NextResponse.json({ event: rows[0] });
}
