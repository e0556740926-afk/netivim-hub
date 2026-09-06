import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

/**
 * Advisor-facing consultation pipeline. Reads/writes the same `leads`
 * table the field-coordinator screens use, but through `advisor_status`
 * (the 7-stage enum from spec §6.3) rather than the coordinator's own
 * `status` field (new/contacted/advanced/irrelevant) — the two describe
 * different workflows for different roles and never overlap.
 *
 * Row-level scoping (permissions matrix §4, "cases" row): admin/ceo/
 * recruitment_manager see everything; advisor sees only cases they own
 * (owner_name match); rav sees only red-flagged cases or ones they have
 * an open consultation on; coordinator/field_manager/viewer get
 * status-only columns, never the full case content — this is a column
 * restriction, not just a row filter, per the matrix's footnote.
 */
export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("advisor_status");

  if (me.role === "advisor") {
    const rows = status
      ? await sql`SELECT * FROM leads WHERE advisor_status=${status} AND deleted_at IS NULL AND owner_name=${me.name} ORDER BY created_at DESC`
      : await sql`SELECT * FROM leads WHERE deleted_at IS NULL AND owner_name=${me.name} ORDER BY created_at DESC`;
    return NextResponse.json({ cases: rows });
  }

  if (me.role === "rav") {
    const rows = status
      ? await sql`
          SELECT * FROM leads WHERE deleted_at IS NULL AND advisor_status=${status}
            AND (triage_color = 'red' OR id IN (SELECT case_id FROM consultations_rav))
          ORDER BY created_at DESC`
      : await sql`
          SELECT * FROM leads WHERE deleted_at IS NULL
            AND (triage_color = 'red' OR id IN (SELECT case_id FROM consultations_rav))
          ORDER BY created_at DESC`;
    return NextResponse.json({ cases: rows });
  }

  if (me.role === "coordinator") {
    const [own] = await sql`SELECT id FROM coordinators WHERE user_id=${me.id}`;
    if (!own) return NextResponse.json({ cases: [], status_only: true });
    const rows = await sql`
      SELECT id, name, age, city, advisor_status, triage_color, created_at FROM leads
      WHERE deleted_at IS NULL AND coordinator_id=${own.id} ORDER BY created_at DESC`;
    return NextResponse.json({ cases: rows, status_only: true });
  }

  if (me.role === "field_manager" || me.role === "viewer") {
    const rows = await sql`
      SELECT id, name, age, city, advisor_status, triage_color, created_at FROM leads
      WHERE deleted_at IS NULL ORDER BY created_at DESC`;
    return NextResponse.json({ cases: rows, status_only: true });
  }

  // admin, ceo, recruitment_manager: full access, all cases.
  const rows = status
    ? await sql`SELECT * FROM leads WHERE advisor_status=${status} AND deleted_at IS NULL ORDER BY created_at DESC`
    : await sql`SELECT * FROM leads WHERE deleted_at IS NULL ORDER BY created_at DESC`;
  return NextResponse.json({ cases: rows });
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  "פנייה חדשה": ["בתהליך ייעוץ", "לא פעיל"],
  "בתהליך ייעוץ": ["הופנה למסגרת", "לא פעיל"],
  "הופנה למסגרת": ["התקבל למסגרת", "בתהליך ייעוץ", "לא פעיל"], // "לא התקבל" -> back to consultation, per §7.1
  "התקבל למסגרת": ["שובץ במסגרת", "לא פעיל"],
  "שובץ במסגרת": ["הסתיים בהצלחה", "לא פעיל"], // dropout reported by institution portal -> back to follow-up
  "לא פעיל": ["בתהליך ייעוץ"], // re-opened after the follow-up window
  "הסתיים בהצלחה": [],
};

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id || !d.advisor_status) return NextResponse.json({ error: "missing id/advisor_status" }, { status: 400 });

  const [current] = await sql`SELECT advisor_status FROM leads WHERE id=${d.id}`;
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const from = current.advisor_status;
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!d.force && !allowed.includes(d.advisor_status)) {
    return NextResponse.json({ error: `מעבר לא חוקי: ${from} → ${d.advisor_status}` }, { status: 400 });
  }

  // "לא פעיל" requires a reason (§6.3: blocks save without one).
  if (d.advisor_status === "לא פעיל" && !d.inactive_reason) {
    return NextResponse.json({ error: "נדרשת סיבה למעבר ל'לא פעיל'" }, { status: 400 });
  }

  const me = await currentUser(req);
  await sql`
    UPDATE leads SET advisor_status=${d.advisor_status},
      inactive_reason = CASE WHEN ${d.advisor_status} = 'לא פעיל' THEN ${d.inactive_reason} ELSE inactive_reason END,
      process_started_at = CASE WHEN ${d.advisor_status} = 'בתהליך ייעוץ' AND process_started_at IS NULL THEN now() ELSE process_started_at END,
      first_touch_at = COALESCE(first_touch_at, now())
    WHERE id=${d.id}`;

  await sql`
    INSERT INTO case_status_history (case_id, from_status, to_status, changed_by, reason)
    VALUES (${d.id}, ${from}, ${d.advisor_status}, ${me?.name || null}, ${d.reason || d.inactive_reason || null})`;

  logAudit({ entityType: "case", entityId: d.id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `סטטוס ייעוץ: ${from} → ${d.advisor_status}` });
  return NextResponse.json({ ok: true });
}
