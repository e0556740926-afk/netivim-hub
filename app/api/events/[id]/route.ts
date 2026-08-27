import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendEmail, eventApprovedEmail } from "@/lib/email";
import { sendWhatsApp, eventApprovedMsg } from "@/lib/whatsapp";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await req.json();
  const eid = parseInt(id);
  const me = await currentUser(req);

  if (d.approve) {
    await sql`UPDATE events SET approved=true, status='marketing' WHERE id=${eid}`;
    logAudit({ entityType:"event", entityId:eid, action:"update", actorName:me?.name, actorEmail:me?.email, summary:"אושר" });
    // Notify the coordinator
    try {
      const rows = await sql`
        SELECT e.name, e.date, e.location, c.name as coord_name, u.email, COALESCE(c.phone, u.phone) as phone
        FROM events e
        LEFT JOIN coordinators c ON c.id = e.coordinator_id
        LEFT JOIN users u ON u.id = c.user_id
        WHERE e.id = ${eid} LIMIT 1`;
      const r: any = rows[0];
      const p = {
        coordName: r?.coord_name || "",
        eventName: r?.name,
        eventDate: r?.date ? String(r.date).slice(0,10) : undefined,
        location: r?.location,
      };
      if (r?.email) {
        const { subject, html } = eventApprovedEmail(p);
        await sendEmail({ to: r.email, subject, html });
      }
      if (r?.phone) await sendWhatsApp(r.phone, eventApprovedMsg(p));
    } catch (e) { console.error("[notify event]", e); }
  } else if (d.results) {
    // Update results only
    await sql`UPDATE events SET
      actual_attendees=${d.actual_attendees||0},
      leads_collected=${d.leads_collected||0},
      summary=${d.summary||''} 
      WHERE id=${eid}`;
    logAudit({ entityType:"event", entityId:eid, action:"update", actorName:me?.name, actorEmail:me?.email, summary:`תוצאות: ${d.actual_attendees||0} משתתפים, ${d.leads_collected||0} לידים` });
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
    logAudit({ entityType:"event", entityId:eid, action:"update", actorName:me?.name, actorEmail:me?.email, summary:`עודכן: ${d.name}` });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = await currentUser(req);
  await sql`DELETE FROM events WHERE id=${parseInt(id)}`;
  logAudit({ entityType:"event", entityId:parseInt(id), action:"delete", actorName:me?.name, actorEmail:me?.email });
  return NextResponse.json({ ok: true });
}
