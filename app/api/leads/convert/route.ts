import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const { lead_id, coordinator_name } = await req.json();
  const leads = await sql`SELECT * FROM leads WHERE id = ${lead_id} LIMIT 1`;
  if (!leads.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const lead = leads[0];
  // Check if contact with same phone already exists
  const existing = await sql`SELECT id FROM contacts WHERE phone = ${lead.phone} LIMIT 1`;
  if (existing.length) return NextResponse.json({ error: "איש קשר עם מספר זה כבר קיים", contact_id: existing[0].id }, { status: 409 });

  // Create contact from lead
  const coords = await sql`SELECT id FROM coordinators WHERE name = ${coordinator_name} LIMIT 1`;
  const coord_id = coords[0]?.id || null;

  const rows = await sql`
    INSERT INTO contacts (name, phone, type, status, potential, owner, coordinator_id, last_contact, notes)
    VALUES (${lead.name}, ${lead.phone}, 'lead', 'initial', 1, ${coordinator_name}, ${coord_id}, NOW()::date,
      'הומר מליד · עיר: ' || COALESCE(${lead.city}, '') || ' · עניין: ' || COALESCE(${lead.interest}, ''))
    RETURNING id
  `;

  // Update lead status
  await sql`UPDATE leads SET status = 'advanced' WHERE id = ${lead_id}`;

  // Add first interaction
  await sql`
    INSERT INTO interactions (contact_id, coordinator_id, date, type, summary)
    VALUES (${rows[0].id}, ${coord_id}, NOW()::date, 'call', 'ליד שהומר לאיש קשר ממערכת נתיבים שטח')
  `;

  return NextResponse.json({ contact_id: rows[0].id });
}
