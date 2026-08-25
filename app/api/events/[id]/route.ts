import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const d = await req.json();
  const eid = parseInt(id);
  if (d.approve) {
    await sql`UPDATE events SET approved = true, status = 'marketing' WHERE id = ${eid}`;
  } else {
    await sql`UPDATE events SET name=${d.name}, date=${d.date||null}, time=${d.time||''}, location=${d.location||''}, budget_planned=${d.budget_planned||0}, target_attendees=${d.target_attendees||0}, status=${d.status} WHERE id = ${eid}`;
  }
  return NextResponse.json({ ok: true });
}
