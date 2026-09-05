import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { verifyAdviseeSession, ADVISEE_SESSION_COOKIE } from "@/lib/advisee-session";

export async function GET(req: NextRequest) {
  const session = await verifyAdviseeSession(req.cookies.get(ADVISEE_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const [c] = await sql`SELECT * FROM leads WHERE id=${session.caseId} AND deleted_at IS NULL`;
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const referrals = await sql`
    SELECT r.status, o.name AS organization_name
    FROM referrals r JOIN organizations o ON o.id = r.organization_id
    WHERE r.case_id=${c.id} AND r.status NOT IN ('לא התקבל','נשר','הסתיים')
    ORDER BY r.created_at DESC`;

  return NextResponse.json({ name: c.name, advisor_status: c.advisor_status, owner_name: c.owner_name, referrals });
}

export async function POST(req: NextRequest) {
  const session = await verifyAdviseeSession(req.cookies.get(ADVISEE_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const d = await req.json();
  if (!d.message) return NextResponse.json({ error: "missing message" }, { status: 400 });

  const [c] = await sql`SELECT id, name, owner_name FROM leads WHERE id=${session.caseId} AND deleted_at IS NULL`;
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  await sql`INSERT INTO case_interactions (case_id, type, summary, created_by) VALUES (${c.id}, 'portal_message', ${d.message}, ${c.name})`;
  await sql`
    INSERT INTO tasks (contact_id, case_id, title, details, type, assignees, status, priority)
    VALUES (${null}, ${c.id}, ${`הודעה מהנועץ: ${c.name}`}, ${d.message}, 'call', ${c.owner_name ? [c.owner_name] : []}, 'todo', 'normal')`;

  return NextResponse.json({ ok: true });
}
