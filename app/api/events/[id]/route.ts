import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await req.json();
  const eid = parseInt(id);

  if (d.approve) {
    await sql`UPDATE events SET approved=true, status='marketing' WHERE id=${eid}`;
  } else if (d.results) {
    // Update results only
    await sql`UPDATE events SET
      actual_attendees=${d.actual_attendees||0},
      leads_collected=${d.leads_collected||0},
      summary=${d.summary||''} 
      WHERE id=${eid}`;
  } else {
    // Full edit
    await sql`UPDATE events SET
      name=${d.name},
      date=${d.date||null},
      time=${d.time||''},
      location=${d.location||''},
      status=${d.status},
      budget_planned=${d.budget_planned||0},
      target_attendees=${d.target_attendees||0},
      approved=${d.approved||false}
      WHERE id=${eid}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await sql`DELETE FROM events WHERE id=${parseInt(id)}`;
  return NextResponse.json({ ok: true });
}
