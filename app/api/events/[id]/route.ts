import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendEmail, eventApprovedEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { sendWhatsApp, eventApprovedMsg } from "@/lib/whatsapp";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";

/**
 * Standard pre-event checklist, auto-created once per event on
 * approval (guarded by events.checklist_created so re-approving or
 * re-saving never duplicates it). Reuses the plain `tasks` table
 * rather than the separate task_templates system — that system is
 * for admin-authored, manually-applied sequences; this one needs to
 * fire automatically with dates computed relative to a specific
 * event date, which templates don't support.
 */
async function createEventChecklist(eid: number, eventDateStr: string | null, coordName: string | null) {
  const eventDate = eventDateStr ? new Date(eventDateStr) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  const dueFor = (daysBefore: number) => {
    if (!eventDate) return today.toISOString().slice(0,10);
    const d = new Date(eventDate); d.setDate(d.getDate() - daysBefore);
    return (d < today ? today : d).toISOString().slice(0,10);
  };
  const items: { title: string; type: string; daysBefore: number }[] = [
    { title: "לוודא הזמנת אולם/מיקום", type: "other", daysBefore: 14 },
    { title: "להכין ולהדפיס חומרי שיווק", type: "other", daysBefore: 7 },
    { title: "לתאם עם השותף/הספק המארח", type: "call", daysBefore: 5 },
    { title: "לשלוח תזכורת השתתפות לנרשמים", type: "whatsapp", daysBefore: 1 },
    { title: "להביא ציוד לאיסוף לידים (טופס/קישור QR)", type: "other", daysBefore: 0 },
  ];
  const assignees = coordName ? [coordName] : [];
  for (const item of items) {
    await sql`INSERT INTO tasks (title, type, assignees, due_date, status, event_id)
      VALUES (${item.title}, ${item.type}, ${assignees}, ${dueFor(item.daysBefore)}, 'todo', ${eid})`;
  }
  await sql`UPDATE events SET checklist_created=true WHERE id=${eid}`;
}

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
        SELECT e.name, e.date, e.location, e.checklist_created, c.name as coord_name, u.email, COALESCE(c.phone, u.phone) as phone
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
        await sendPush(r.email, { title: "🎉 האירוע שלך אושר", body: p.eventName, url: "/coord/events" });
      }
      if (r?.phone) await sendWhatsApp(r.phone, eventApprovedMsg(p));
      if (!r?.checklist_created) {
        await createEventChecklist(eid, r?.date ? String(r.date).slice(0,10) : null, r?.coord_name || null);
      }
    } catch (e) { console.error("[notify event]", e); }
  } else if (d.results) {
    // Update results only. actual_attendees/leads_collected here are a
    // manual override — the primary numbers shown in the UI are the
    // real counts from event_attendees / leads.event_id (see GET
    // /api/events). This stays for the rare case those aren't in use yet.
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
      capacity=${d.capacity||null},
      partner_contact_id=${d.partner_contact_id||null},
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
