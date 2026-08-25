import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const d = await req.json();
  await sql`
    UPDATE events SET
      status = 'done',
      actual_attendees = ${d.actual_attendees || 0},
      leads_collected = ${d.leads_collected || 0},
      summary = ${d.summary || ''}
    WHERE id = ${d.id}
  `;

  // Auto-create debrief tasks if needed
  if (d.follow_up) {
    await sql`
      INSERT INTO tasks (title, type, assignees, due_date, status, event_id, details)
      VALUES ('מעקב אחר לידים מ' || ${d.event_name || 'האירוע'}, 'call',
        ${d.assignees || ['']}, NOW() + INTERVAL '3 days', 'todo', ${d.id}, ${d.follow_up})
    `;
  }
  return NextResponse.json({ ok: true });
}
