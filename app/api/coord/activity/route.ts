import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  if (!cid) return NextResponse.json({ tasks:[], leads:[], interactions:[], reports:[], events:[] });
  const id = parseInt(cid);

  // Get coordinator name first
  const coordRows = await sql`SELECT name FROM coordinators WHERE id = ${id} LIMIT 1`;
  const coordName = coordRows[0]?.name || "";

  const [tasks, leads, interactions, reports] = await Promise.all([
    sql`SELECT t.*, e.name as event_name FROM tasks t LEFT JOIN events e ON e.id=t.event_id WHERE ${coordName}=ANY(t.assignees) OR t.coordinator_id=${id} ORDER BY t.created_at DESC LIMIT 50`,
    sql`SELECT * FROM leads WHERE coordinator_id=${id} ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT i.*, c.name as contact_name FROM interactions i LEFT JOIN contacts c ON c.id=i.contact_id WHERE i.coordinator_id=${id} ORDER BY i.date DESC LIMIT 50`,
    sql`SELECT * FROM weekly_reports WHERE coordinator_id=${id} ORDER BY submitted_at DESC LIMIT 12`,
  ]);

  return NextResponse.json({ tasks, leads, interactions, reports });
}
