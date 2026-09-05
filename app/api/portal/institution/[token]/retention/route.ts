import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [auth] = await sql`SELECT organization_id FROM institution_users WHERE access_token=${token}`;
  if (!auth) return NextResponse.json({ error: "invalid link" }, { status: 404 });
  const [pending] = await sql`
    SELECT * FROM retention_confirmations
    WHERE organization_id=${auth.organization_id} AND confirmed_at IS NULL
    ORDER BY quarter DESC LIMIT 1`;
  const ourGuys = await sql`
    SELECT l.id, l.name FROM referrals r JOIN leads l ON l.id = r.case_id
    WHERE r.organization_id=${auth.organization_id} AND l.advisor_status IN ('התקבל למסגרת','שובץ במסגרת')`;
  return NextResponse.json({ pending: pending || null, our_guys: ourGuys });
}

/** { confirmation_id, all_still_here: boolean, left_case_ids?: number[] } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await req.json();
  const [auth] = await sql`SELECT organization_id, name FROM institution_users WHERE access_token=${token}`;
  if (!auth) return NextResponse.json({ error: "invalid link" }, { status: 404 });

  const [confirmation] = await sql`SELECT * FROM retention_confirmations WHERE id=${d.confirmation_id} AND organization_id=${auth.organization_id}`;
  if (!confirmation) return NextResponse.json({ error: "not found" }, { status: 404 });

  await sql`
    UPDATE retention_confirmations SET confirmed_at=now(), confirmed_by=${auth.name}, method='portal',
      details=${JSON.stringify({ all_still_here: !!d.all_still_here, left_case_ids: d.left_case_ids || [] })}::jsonb
    WHERE id=${d.confirmation_id}`;

  if (Array.isArray(d.left_case_ids)) {
    for (const caseId of d.left_case_ids) {
      await sql`UPDATE leads SET advisor_status='לא פעיל', inactive_reason='נשר ממסגרת' WHERE id=${caseId}`;
    }
  }
  return NextResponse.json({ ok: true });
}
