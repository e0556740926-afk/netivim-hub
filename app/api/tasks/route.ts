import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  const name = req.nextUrl.searchParams.get("name");
  if (name) {
    const rows = await sql`SELECT * FROM tasks WHERE ${name} = ANY(assignees) AND status != 'done' ORDER BY due_date LIMIT 10`;
    return NextResponse.json({ tasks: rows });
  }
  if (cid) {
    const rows = await sql`SELECT * FROM tasks WHERE coordinator_id = ${parseInt(cid)} ORDER BY due_date`;
    return NextResponse.json({ tasks: rows });
  }
  const rows = await sql`SELECT * FROM tasks ORDER BY due_date`;
  return NextResponse.json({ tasks: rows });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  await sql`UPDATE tasks SET status = ${status} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
