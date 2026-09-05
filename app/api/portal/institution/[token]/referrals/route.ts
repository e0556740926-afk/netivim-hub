import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";

const ALLOWED = ["הוזמן לראיון", "התקבל", "לא התקבל", "נכנס בפועל", "נשר"];
const STATUS_MAP: Record<string, string> = {
  "הוזמן לראיון": "הוזמן לראיון",
  "התקבל": "התקבל",
  "לא התקבל": "לא התקבל",
  "נכנס בפועל": "התקבל", // case advisor_status handles the "actually enrolled" transition separately
  "נשר": "נשר",
};

/**
 *   { referral_id, status, reason?, date? }
 * Scoped to the calling institution's own organization_id via the token —
 * a referral_id belonging to a different institution is rejected even if
 * guessed, since the WHERE clause checks organization_id too.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await req.json();
  const [auth] = await sql`SELECT organization_id, name FROM institution_users WHERE access_token=${token}`;
  if (!auth) return NextResponse.json({ error: "invalid link" }, { status: 404 });
  if (!d.referral_id || !ALLOWED.includes(d.status)) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const [ref] = await sql`SELECT * FROM referrals WHERE id=${d.referral_id} AND organization_id=${auth.organization_id}`;
  if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

  const mapped = STATUS_MAP[d.status];
  await sql`
    UPDATE referrals SET status=${mapped}, status_date=now(),
      rejection_reason=${d.status === "לא התקבל" ? d.reason || null : ref.rejection_reason},
      dropout_reason=${d.status === "נשר" ? d.reason || null : ref.dropout_reason},
      dropout_date=${d.status === "נשר" ? d.date || null : ref.dropout_date}
    WHERE id=${d.referral_id}`;

  if (mapped === "התקבל") await sql`UPDATE leads SET advisor_status='התקבל למסגרת' WHERE id=${ref.case_id}`;
  if (d.status === "נכנס בפועל") await sql`UPDATE leads SET advisor_status='שובץ במסגרת' WHERE id=${ref.case_id}`;
  if (mapped === "לא התקבל") await sql`UPDATE leads SET advisor_status='בתהליך ייעוץ' WHERE id=${ref.case_id}`;
  if (mapped === "נשר") await sql`UPDATE leads SET advisor_status='לא פעיל', inactive_reason='נשר ממסגרת' WHERE id=${ref.case_id}`;

  logAudit({ entityType: "referral", entityId: d.referral_id, action: "update", actorName: `${auth.name} (פורטל מוסד)`, summary: `עודכן דרך פורטל המוסד: ${d.status}` });
  return NextResponse.json({ ok: true });
}
