import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  const all = req.nextUrl.searchParams.get("all");
  if (name) {
    const rows = await sql`SELECT * FROM tasks WHERE ${name}=ANY(assignees) AND status!='done' ORDER BY due_date LIMIT 10`;
    return NextResponse.json({ tasks: rows });
  }
  if (cid) {
    const rows = await sql`SELECT * FROM tasks WHERE coordinator_id=${parseInt(cid)} ORDER BY due_date`;
    return NextResponse.json({ tasks: rows });
  }
  const rows = await sql`SELECT * FROM tasks ORDER BY due_date`;
  return NextResponse.json({ tasks: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO tasks (coordinator_id,event_id,contact_id,title,details,type,assignees,due_date,status)
    VALUES (${d.coordinator_id||null},${d.event_id||null},${d.contact_id||null},${d.title},${d.details||''},${d.type||'call'},${d.assignees||[]},${d.due_date||null},${d.status||'todo'})
    RETURNING *`;
  return NextResponse.json({ task: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (d.status_only) {
    await sql`UPDATE tasks SET status=${d.status} WHERE id=${d.id}`;
  } else {
    await sql`UPDATE tasks SET title=${d.title},details=${d.details||''},type=${d.type},assignees=${d.assignees||[]},due_date=${d.due_date||null},status=${d.status},event_id=${d.event_id||null},contact_id=${d.contact_id||null} WHERE id=${d.id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM tasks WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}