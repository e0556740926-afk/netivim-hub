import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendEmail, eventApprovedEmail } from "@/lib/email";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await req.json();
  const eid = parseInt(id);

  if (d.approve) {
    await sql`UPDATE events SET approved=true, status='marketing' WHERE id=${eid}`;
    // Notify the coordinator
    try {
      const rows = await sql`
        SELECT e.name, e.date, e.location, c.name as coord_name, u.email
        FROM events e
        LEFT JOIN coordinators c ON c.id = e.coordinator_id
        LEFT JOIN users u ON u.id = c.user_id
        WHERE e.id = ${eid} LIMIT 1`;
      const r: any = rows[0];
      if (r?.email) {
        const { subject, html } = eventApprovedEmail({
          coordName: r.coord_name || "",
          eventName: r.name,
          eventDate: r.date ? String(r.date).slice(0,10) : undefined,
          location: r.location,
        });
        await sendEmail({ to: r.email, subject, html });
      }
    } catch (e) { console.error("[notify event]", e); }
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
