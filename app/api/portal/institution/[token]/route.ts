import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

async function resolveOrg(token: string) {
  const [row] = await sql`SELECT organization_id, name AS contact_name FROM institution_users WHERE access_token=${token}`;
  return row || null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const auth = await resolveOrg(token);
  if (!auth) return NextResponse.json({ error: "invalid link" }, { status: 404 });

  await sql`UPDATE institution_users SET last_login_at = now() WHERE access_token=${token}`;

  const orgId = auth.organization_id;
  const [org] = await sql`SELECT id, name, category, region FROM organizations WHERE id=${orgId}`;
  const [pending, active, history] = await Promise.all([
    sql`
      SELECT r.id, r.status, r.status_date, r.summary_text, l.name AS case_name, l.age AS case_age, l.interest,
        p.name AS program_name
      FROM referrals r JOIN leads l ON l.id = r.case_id LEFT JOIN org_programs p ON p.id = r.program_id
      WHERE r.organization_id=${orgId} AND r.status IN ('ממתין','הוזמן לראיון') ORDER BY r.created_at`,
    sql`
      SELECT r.id, r.status, r.sent_at, l.name AS case_name, l.age AS case_age
      FROM referrals r JOIN leads l ON l.id = r.case_id
      WHERE r.organization_id=${orgId} AND r.status = 'התקבל' AND l.advisor_status IN ('התקבל למסגרת','שובץ במסגרת')
      ORDER BY r.sent_at DESC`,
    sql`
      SELECT r.id, r.status, r.status_date, l.name AS case_name, l.age AS case_age
      FROM referrals r JOIN leads l ON l.id = r.case_id
      WHERE r.organization_id=${orgId} AND r.status IN ('לא התקבל','נשר','הסתיים') ORDER BY r.status_date DESC LIMIT 20`,
  ]);

  return NextResponse.json({ organization: org, contact_name: auth.contact_name, pending, active, history });
}
