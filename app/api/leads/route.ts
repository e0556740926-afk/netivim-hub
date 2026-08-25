import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  if (!cid) return NextResponse.json({ leads: [] });
  const leads = await sql`SELECT * FROM leads WHERE coordinator_id = ${parseInt(cid)} ORDER BY created_at DESC`;
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
  const rows = await sql`
    INSERT INTO leads (coordinator_id, name, phone, city, age, interest, source, status, event_id, notes)
    VALUES (${d.coordinator_id}, ${d.name}, ${d.phone}, ${d.city||''}, ${d.age||null}, ${d.interest||'training'}, ${d.source||'manual'}, 'new', ${d.event_id||null}, ${d.notes ? d.notes + ' | ציון: ' + score : 'ציון: ' + score})
    RETURNING *
  `;
  return NextResponse.json({ lead: rows[0], score });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  await sql`UPDATE leads SET status = ${status} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
