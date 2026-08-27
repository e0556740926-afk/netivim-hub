import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendEmail, newLeadEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  // Auto-add owner_name column
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_name text default ''`; } catch {}
  if (!cid) {
    const all = await sql`
      SELECT l.*, COALESCE(c.name, l.owner_name) as owner_display
      FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id
      ORDER BY l.created_at DESC`;
    return NextResponse.json({ leads: all });
  }
  const leads = await sql`
    SELECT l.*, c.name as owner_display
    FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id
    WHERE l.coordinator_id = ${parseInt(cid)}
    ORDER BY l.created_at DESC`;
  return NextResponse.json({ leads });
}


function scoreLead(d: any): number {
  let score = 5;
  if (d.age) {
    const age = +d.age;
    if (age >= 16 && age <= 20) score += 3;
    else if (age >= 14 && age <= 22) score += 1;
    else score -= 1;
  }
  if (d.interest === 'military') score += 2;
  else if (d.interest === 'training') score += 1;
  if (d.source === 'link') score += 1;
  else if (d.source === 'event') score += 2;
  const hotCities = ['ירושלים','בני ברק','מודיעין עילית','ביתר עילית'];
  if (d.city && hotCities.some((c: string) => d.city.includes(c))) score += 1;
  return Math.max(1, Math.min(10, score));
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  // Check for duplicate phone
  if (d.phone) {
    const dup = await sql`SELECT id, name FROM leads WHERE phone = ${d.phone} LIMIT 1`;
    if (dup.length) return NextResponse.json({ error: "כפילות", duplicate: dup[0] }, { status: 409 });
  }
  const score = scoreLead(d);
  // Auto-add id_number column if not exists
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS id_number text default ''`; } catch {}
  const notes_full = [d.notes, "ציון: " + score].filter(Boolean).join(" | ");
  const rows = await sql`
    INSERT INTO leads (coordinator_id, name, phone, city, age, interest, source, status, event_id, notes, id_number)
    VALUES (${d.coordinator_id}, ${d.name}, ${d.phone}, ${d.city||''}, ${d.age||null}, ${d.interest||'training'}, ${d.source||'manual'}, 'new', ${d.event_id||null}, ${notes_full}, ${d.id_number||''})
    RETURNING *
  `;
  // Notify coordinator when lead comes from their public link
  if (d.source === "link" && d.coordinator_id) {
    try {
      const cr = await sql`
        SELECT c.name, u.email FROM coordinators c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = ${d.coordinator_id} LIMIT 1`;
      const c: any = cr[0];
      if (c?.email) {
        const { subject, html } = newLeadEmail({
          coordName: c.name, leadName: d.name, leadPhone: d.phone, leadAge: d.age,
        });
        await sendEmail({ to: c.email, subject, html });
      }
    } catch (e) { console.error("[notify lead]", e); }
  }
  return NextResponse.json({ lead: rows[0], score });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  await sql`UPDATE leads SET status = ${status} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
