import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";

/** ASCII-only slug for the event's public lead-capture link — same reasoning as coordinator slugs (fragile across share channels if non-Latin). */
function makeEventSlug(name: string, id: number): string {
  const base = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/\s+/g, "-").slice(0, 30);
  return `${base || "event"}-${id}`;
}

export async function GET() {
  const [events, expenses] = await Promise.all([
    sql`SELECT e.*, c.name as coordinator_name, p.name as partner_name,
          COALESCE((SELECT COUNT(*)::int FROM leads l WHERE l.event_id = e.id), 0) as leads_from_event,
          COALESCE((SELECT COUNT(*)::int FROM event_attendees a WHERE a.event_id = e.id AND NOT a.waitlisted), 0) as attendee_count,
          COALESCE((SELECT COUNT(*)::int FROM event_attendees a WHERE a.event_id = e.id AND a.checked_in), 0) as checked_in_count,
          COALESCE((SELECT COUNT(*)::int FROM event_attendees a WHERE a.event_id = e.id AND a.waitlisted), 0) as waitlist_count
        FROM events e
        LEFT JOIN coordinators c ON c.id = e.coordinator_id
        LEFT JOIN contacts p ON p.id = e.partner_contact_id
        ORDER BY e.date`,
    sql`SELECT event_id, amount FROM expenses`,
  ]);
  return NextResponse.json({ events, expenses });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO events (name, date, time, location, status, budget_planned, target_attendees, capacity, partner_contact_id, approved, coordinator_id)
    VALUES (${d.name}, ${d.date||null}, ${d.time||''}, ${d.location||''}, 'pending_approval', ${d.budget_planned||0}, ${d.target_attendees||0}, ${d.capacity||null}, ${d.partner_contact_id||null}, false, ${d.coordinator_id||null})
    RETURNING *
  `;
  const event = rows[0];
  const slug = makeEventSlug(event.name, event.id);
  await sql`UPDATE events SET slug=${slug} WHERE id=${event.id}`;
  event.slug = slug;

  const me = await currentUser(req);
  logAudit({ entityType:"event", entityId:event.id, action:"create", actorName:me?.name, actorEmail:me?.email, summary:`נוצר: ${event.name}` });
  return NextResponse.json({ event });
}
