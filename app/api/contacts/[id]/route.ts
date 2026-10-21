import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn, ensureColumn } from "@/lib/schema";

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cid = parseInt(id);
  const hasLeadContact = await ensureColumn("leads", "contact_id",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_id integer REFERENCES contacts(id)");
  const [contact, interactions, tasks, leads] = await Promise.all([
    sql`SELECT * FROM contacts WHERE id=${cid} LIMIT 1`,
    sql`SELECT * FROM interactions WHERE contact_id=${cid} ORDER BY date DESC`,
    sql`SELECT * FROM tasks WHERE contact_id=${cid} AND status!='done' ORDER BY due_date`,
    // Leads linked to this contact: referred directly (leads.contact_id),
    // or collected at an event this contact partnered on (events.partner_contact_id).
    hasLeadContact
      ? sql`
        SELECT l.id, l.name, l.phone, l.city, l.status, l.created_at, l.event_id, e.name AS event_name,
               CASE WHEN l.contact_id=${cid} THEN 'direct' ELSE 'event' END AS via
        FROM leads l LEFT JOIN events e ON e.id=l.event_id
        WHERE l.deleted_at IS NULL AND (l.contact_id=${cid} OR e.partner_contact_id=${cid})
        ORDER BY l.created_at DESC LIMIT 100`
      : sql`
        SELECT l.id, l.name, l.phone, l.city, l.status, l.created_at, l.event_id, e.name AS event_name, 'event' AS via
        FROM leads l JOIN events e ON e.id=l.event_id
        WHERE l.deleted_at IS NULL AND e.partner_contact_id=${cid}
        ORDER BY l.created_at DESC LIMIT 100`,
  ]);
  return NextResponse.json({ contact: contact[0]||null, interactions, tasks, leads });
}
