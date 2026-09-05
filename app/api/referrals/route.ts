import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/** Creates a referral. Enforces the "up to 3 concurrent" rule from spec §7.1. */
export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.case_id || !d.organization_id) {
    return NextResponse.json({ error: "missing case_id/organization_id" }, { status: 400 });
  }
  const [{ count }] = await sql`
    SELECT count(*)::int FROM referrals
    WHERE case_id=${d.case_id} AND status NOT IN ('לא התקבל','נשר','הסתיים')` as any[];
  if (count >= 3) {
    return NextResponse.json({ error: "כבר קיימות 3 הפניות פעילות לתיק זה" }, { status: 400 });
  }

  const me = await currentUser(req);
  // group_id links this referral to any existing active siblings for the
  // same case, so accepting one can prompt closing the others together.
  const [existing] = await sql`
    SELECT group_id FROM referrals
    WHERE case_id=${d.case_id} AND status NOT IN ('לא התקבל','נשר','הסתיים') AND group_id IS NOT NULL
    LIMIT 1` as any[];
  const groupId = existing?.group_id || d.case_id; // fall back to case_id as a stable group key

  const rows = await sql`
    INSERT INTO referrals (case_id, organization_id, program_id, group_id, status, summary_text, created_by, sent_at)
    VALUES (${d.case_id}, ${d.organization_id}, ${d.program_id || null}, ${groupId}, 'ממתין', ${d.summary_text || null}, ${me?.name || null}, now())
    RETURNING *`;

  // Moving a case into "הופנה למסגרת" requires an active referral (spec
  // §6.3) — this route is the only way a referral gets created, so it's
  // safe to also advance the case status here if it isn't already ahead.
  await sql`
    UPDATE leads SET advisor_status='הופנה למסגרת'
    WHERE id=${d.case_id} AND advisor_status IN ('פנייה חדשה','בתהליך ייעוץ')`;

  logAudit({ entityType: "referral", entityId: rows[0].id, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `הפניה נשלחה` });
  return NextResponse.json({ referral: rows[0] });
}

/**
 *   { id, status, rejection_reason?, dropout_reason?, dropout_date? }
 *   When status='התקבל' (accepted), siblings in the same group are offered
 *   for closing by the caller (returned in `siblings_to_close`), not closed
 *   automatically — the UI shows them with a reason picker, per spec §7.1.
 */
export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id || !d.status) return NextResponse.json({ error: "missing id/status" }, { status: 400 });

  const me = await currentUser(req);
  await sql`
    UPDATE referrals SET status=${d.status}, status_date=now(),
      rejection_reason=${d.rejection_reason || null},
      dropout_reason=${d.dropout_reason || null},
      dropout_date=${d.dropout_date || null}
    WHERE id=${d.id}`;

  const [ref] = await sql`SELECT * FROM referrals WHERE id=${d.id}`;
  let siblingsToClose: any[] = [];

  if (d.status === "התקבל") {
    siblingsToClose = await sql`
      SELECT * FROM referrals WHERE group_id=${ref.group_id} AND id != ${d.id} AND status NOT IN ('לא התקבל','נשר','הסתיים')`;
    await sql`UPDATE leads SET advisor_status='התקבל למסגרת' WHERE id=${ref.case_id}`;
  }

  if (d.status === "לא התקבל") {
    // Not accepted -> case returns to consultation, per spec §7.1 ("לא נסגר").
    await sql`UPDATE leads SET advisor_status='בתהליך ייעוץ' WHERE id=${ref.case_id}`;
    await sql`
      INSERT INTO tasks (contact_id, title, details, type, status, priority)
      VALUES (${null}, ${'למצוא מסגרת חלופית'}, ${`הפניה #${d.id} לא התקבלה: ${d.rejection_reason || ''}`}, 'backoffice', 'todo', 'normal')`;
  }

  if (d.status === "נשר") {
    // Dropout reported (institution portal or manual) — jumps the case
    // straight to the follow-up column instead of waiting for the next
    // scheduled check-in, per spec §5 column 4.
    await sql`UPDATE leads SET advisor_status='לא פעיל', inactive_reason='נשר ממסגרת' WHERE id=${ref.case_id}`;
  }

  logAudit({ entityType: "referral", entityId: d.id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `סטטוס הפניה → ${d.status}` });
  return NextResponse.json({ ok: true, siblings_to_close: siblingsToClose });
}
