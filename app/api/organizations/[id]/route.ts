import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = Number(id);
  const [org] = await sql`
    SELECT o.*, c.name AS owner_name
    FROM organizations o LEFT JOIN coordinators c ON c.id = o.owner_id
    WHERE o.id=${orgId}`;
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [contacts, programs, referrals, retention, stats, orgInteractions, meetings] = await Promise.all([
    sql`SELECT * FROM contacts WHERE organization_id=${orgId} AND deleted_at IS NULL ORDER BY name`,
    sql`SELECT * FROM org_programs WHERE organization_id=${orgId} ORDER BY name`,
    sql`
      SELECT r.*, l.name AS case_name, l.age AS case_age, l.advisor_status AS case_status
      FROM referrals r LEFT JOIN leads l ON l.id = r.case_id
      WHERE r.organization_id=${orgId} ORDER BY r.created_at DESC`,
    sql`SELECT * FROM retention_confirmations WHERE organization_id=${orgId} ORDER BY quarter DESC`,
    sql`
      SELECT
        count(*)::int AS sent_count,
        count(*) FILTER (WHERE l.advisor_status IN ('התקבל למסגרת','שובץ במסגרת'))::int AS our_guys_now,
        count(*) FILTER (WHERE r.status = 'התקבל')::int AS ever_placed,
        count(*) FILTER (WHERE l.advisor_status = 'הסתיים בהצלחה')::int AS completed_successfully
      FROM referrals r LEFT JOIN leads l ON l.id = r.case_id
      WHERE r.organization_id=${orgId}`,
    sql`
      SELECT i.*, c.name AS contact_name
      FROM interactions i JOIN contacts c ON c.id = i.contact_id
      WHERE c.organization_id=${orgId} ORDER BY i.date DESC`,
    sql`SELECT * FROM org_meetings WHERE organization_id=${orgId} ORDER BY meeting_date DESC`,
  ]);

  const s = (stats as any[])[0];
  const retentionRate = s.ever_placed > 0 ? Math.round((s.completed_successfully / s.ever_placed) * 100) : null;

  return NextResponse.json({
    organization: org, contacts, programs, referrals, retention,
    interactions: orgInteractions, meetings,
    stats: { sent_count: s.sent_count, our_guys_now: s.our_guys_now, retention_rate: retentionRate },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await req.json();

  if (d.kind === "meeting") {
    if (!d.meeting_date) return NextResponse.json({ error: "missing meeting_date" }, { status: 400 });
    const rows = await sql`
      INSERT INTO org_meetings (organization_id, meeting_date, attendees, summary)
      VALUES (${Number(id)}, ${d.meeting_date}, ${d.attendees || null}, ${d.summary || null})
      RETURNING *`;
    return NextResponse.json({ meeting: rows[0] });
  }

  // Default: add a program (track) to this organization.
  if (!d.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const rows = await sql`
    INSERT INTO org_programs (organization_id, name, category, intake_dates, admission_conditions, age_min, age_max, capacity, current_count)
    VALUES (${Number(id)}, ${d.name}, ${d.category || null}, ${d.intake_dates || null}, ${d.admission_conditions || null}, ${d.age_min || null}, ${d.age_max || null}, ${d.capacity || null}, ${d.current_count || 0})
    RETURNING *`;
  return NextResponse.json({ program: rows[0] });
}
