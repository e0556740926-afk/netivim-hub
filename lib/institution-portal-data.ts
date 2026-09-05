import sql from "@/lib/db";

export async function getInstitutionDashboard(orgId: number, contactName: string) {
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
  return { organization: org, contact_name: contactName, pending, active, history };
}

const ALLOWED_REFERRAL_STATUSES = ["הוזמן לראיון", "התקבל", "לא התקבל", "נכנס בפועל", "נשר"];
const STATUS_MAP: Record<string, string> = {
  "הוזמן לראיון": "הוזמן לראיון", "התקבל": "התקבל", "לא התקבל": "לא התקבל", "נכנס בפועל": "התקבל", "נשר": "נשר",
};

export async function updateInstitutionReferral(orgId: number, referralId: number, status: string, reason?: string, date?: string) {
  if (!ALLOWED_REFERRAL_STATUSES.includes(status)) return { error: "invalid request" as const };
  const [ref] = await sql`SELECT * FROM referrals WHERE id=${referralId} AND organization_id=${orgId}`;
  if (!ref) return { error: "not found" as const };

  const mapped = STATUS_MAP[status];
  await sql`
    UPDATE referrals SET status=${mapped}, status_date=now(),
      rejection_reason=${status === "לא התקבל" ? reason || null : ref.rejection_reason},
      dropout_reason=${status === "נשר" ? reason || null : ref.dropout_reason},
      dropout_date=${status === "נשר" ? date || null : ref.dropout_date}
    WHERE id=${referralId}`;

  if (mapped === "התקבל") await sql`UPDATE leads SET advisor_status='התקבל למסגרת' WHERE id=${ref.case_id}`;
  if (status === "נכנס בפועל") await sql`UPDATE leads SET advisor_status='שובץ במסגרת' WHERE id=${ref.case_id}`;
  if (mapped === "לא התקבל") {
    await sql`UPDATE leads SET advisor_status='בתהליך ייעוץ' WHERE id=${ref.case_id}`;
    await sql`INSERT INTO tasks (contact_id, title, details, type, status, priority) VALUES (${null}, 'למצוא מסגרת חלופית', ${`הפניה #${referralId} לא התקבלה: ${reason || ""}`}, 'backoffice', 'todo', 'normal')`;
  }
  if (mapped === "נשר") await sql`UPDATE leads SET advisor_status='לא פעיל', inactive_reason='נשר ממסגרת' WHERE id=${ref.case_id}`;
  return { ok: true as const };
}

export async function getRetentionPending(orgId: number) {
  const [pending] = await sql`SELECT * FROM retention_confirmations WHERE organization_id=${orgId} AND confirmed_at IS NULL ORDER BY quarter DESC LIMIT 1`;
  const ourGuys = await sql`
    SELECT l.id, l.name FROM referrals r JOIN leads l ON l.id = r.case_id
    WHERE r.organization_id=${orgId} AND l.advisor_status IN ('התקבל למסגרת','שובץ במסגרת')`;
  return { pending: pending || null, our_guys: ourGuys };
}

export async function confirmRetention(orgId: number, confirmationId: number, confirmedBy: string, allStillHere: boolean, leftCaseIds: number[], method: "portal" | "whatsapp" = "portal") {
  const [confirmation] = await sql`SELECT * FROM retention_confirmations WHERE id=${confirmationId} AND organization_id=${orgId}`;
  if (!confirmation) return { error: "not found" as const };
  await sql`
    UPDATE retention_confirmations SET confirmed_at=now(), confirmed_by=${confirmedBy}, method=${method},
      details=${JSON.stringify({ all_still_here: allStillHere, left_case_ids: leftCaseIds })}::jsonb
    WHERE id=${confirmationId}`;
  for (const caseId of leftCaseIds) {
    await sql`UPDATE leads SET advisor_status='לא פעיל', inactive_reason='נשר ממסגרת' WHERE id=${caseId}`;
  }
  return { ok: true as const };
}
