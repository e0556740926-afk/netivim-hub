import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [c] = await sql`SELECT * FROM leads WHERE advisee_access_token=${token} AND deleted_at IS NULL`;
  if (!c) return NextResponse.json({ error: "invalid link" }, { status: 404 });

  const referrals = await sql`
    SELECT r.status, o.name AS organization_name
    FROM referrals r JOIN organizations o ON o.id = r.organization_id
    WHERE r.case_id=${c.id} AND r.status NOT IN ('לא התקבל','נשר','הסתיים')
    ORDER BY r.created_at DESC`;

  return NextResponse.json({
    name: c.name, advisor_status: c.advisor_status, owner_name: c.owner_name, referrals,
  });
}

/** { message: string } — logs to case_interactions and opens a task for the case owner. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await req.json();
  const [c] = await sql`SELECT id, name, owner_name FROM leads WHERE advisee_access_token=${token} AND deleted_at IS NULL`;
  if (!c) return NextResponse.json({ error: "invalid link" }, { status: 404 });
  if (!d.message) return NextResponse.json({ error: "missing message" }, { status: 400 });

  await sql`
    INSERT INTO case_interactions (case_id, type, summary, created_by)
    VALUES (${c.id}, 'portal_message', ${d.message}, ${c.name})`;

  await sql`
    INSERT INTO tasks (contact_id, title, details, type, assignees, status, priority)
    VALUES (${null}, ${`הודעה מהנועץ: ${c.name}`}, ${d.message}, 'call', ${c.owner_name ? [c.owner_name] : []}, 'todo', 'normal')`;

  return NextResponse.json({ ok: true });
}
