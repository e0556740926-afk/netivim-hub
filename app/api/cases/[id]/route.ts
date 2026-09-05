import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = Number(id);
  const [caseRow] = await sql`SELECT * FROM leads WHERE id=${caseId}`;
  if (!caseRow) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [extended, protectedInfo, referrals, history, customValues] = await Promise.all([
    sql`SELECT * FROM case_extended WHERE case_id=${caseId}`,
    sql`SELECT case_id, last_accessed_by, last_accessed_at FROM case_protected WHERE case_id=${caseId}`, // sensitive_data withheld unless explicitly opened, see POST /open-protected
    sql`SELECT r.*, o.name AS organization_name, p.name AS program_name
        FROM referrals r
        LEFT JOIN organizations o ON o.id = r.organization_id
        LEFT JOIN org_programs p ON p.id = r.program_id
        WHERE r.case_id=${caseId} ORDER BY r.created_at DESC`,
    sql`SELECT * FROM case_status_history WHERE case_id=${caseId} ORDER BY changed_at DESC`,
    sql`SELECT cv.field_id, cv.value, cf.label, cf.field_type
        FROM case_custom_values cv JOIN custom_field_defs cf ON cf.id = cv.field_id
        WHERE cv.case_id=${caseId}`,
  ]);

  return NextResponse.json({
    case: caseRow,
    extended: extended[0] || null,
    protected_meta: protectedInfo[0] || null,
    referrals, history, custom_values: customValues,
  });
}

/**
 *   { action: "update_extended", ...fields }
 *   { action: "open_protected" }                       — logged access, returns sensitive_data
 *   { action: "update_protected", sensitive_data }
 *   { action: "set_triage", triage_color }              — "red" auto-escalates to Rav Obermeister
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = Number(id);
  const d = await req.json();
  const me = await currentUser(req);

  if (d.action === "update_extended") {
    await sql`
      INSERT INTO case_extended (case_id, education_background, army_status, family_status, aspirations, skills)
      VALUES (${caseId}, ${d.education_background || null}, ${d.army_status || null}, ${d.family_status || null}, ${d.aspirations || null}, ${d.skills || null})
      ON CONFLICT (case_id) DO UPDATE SET
        education_background=EXCLUDED.education_background, army_status=EXCLUDED.army_status,
        family_status=EXCLUDED.family_status, aspirations=EXCLUDED.aspirations, skills=EXCLUDED.skills`;
    return NextResponse.json({ ok: true });
  }

  if (d.action === "open_protected") {
    // Opening protected info is itself a logged, deliberate action (spec §6.1).
    const [row] = await sql`
      INSERT INTO case_protected (case_id, sensitive_data, last_accessed_by, last_accessed_at)
      VALUES (${caseId}, '{}'::jsonb, ${me?.name || null}, now())
      ON CONFLICT (case_id) DO UPDATE SET last_accessed_by=${me?.name || null}, last_accessed_at=now()
      RETURNING sensitive_data`;
    logAudit({ entityType: "case_protected", entityId: caseId, action: "view", actorName: me?.name, actorEmail: me?.email, summary: "נפתח מידע מוגן" });
    return NextResponse.json({ sensitive_data: row.sensitive_data });
  }

  if (d.action === "update_protected") {
    await sql`
      INSERT INTO case_protected (case_id, sensitive_data, last_accessed_by, last_accessed_at)
      VALUES (${caseId}, ${JSON.stringify(d.sensitive_data || {})}::jsonb, ${me?.name || null}, now())
      ON CONFLICT (case_id) DO UPDATE SET sensitive_data=${JSON.stringify(d.sensitive_data || {})}::jsonb, last_accessed_by=${me?.name || null}, last_accessed_at=now()`;
    logAudit({ entityType: "case_protected", entityId: caseId, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "מידע מוגן עודכן" });
    return NextResponse.json({ ok: true });
  }

  if (d.action === "set_triage") {
    if (!["red", "yellow", "green"].includes(d.triage_color)) {
      return NextResponse.json({ error: "invalid triage_color" }, { status: 400 });
    }
    await sql`UPDATE leads SET triage_color=${d.triage_color} WHERE id=${caseId}`;
    if (d.triage_color === "red") {
      // Red flag -> opens a task for the Rav, per spec §6.2. Kept simple:
      // assigns to any user with role='rav' if one exists; otherwise just
      // logs it so a manager notices and can assign manually — this route
      // deliberately doesn't invent a rav user if none is configured.
      const [rav] = await sql`SELECT name FROM users WHERE role='rav' LIMIT 1`;
      const [caseRow] = await sql`SELECT name FROM leads WHERE id=${caseId}`;
      await sql`
        INSERT INTO tasks (contact_id, title, details, type, assignees, status, priority)
        VALUES (${null}, ${`אסקלציה: ${caseRow?.name || 'תיק #' + caseId}`}, ${'תיק סווג אדום — מורכבות גבוהה, דורש טיפול הרב'}, 'backoffice', ${rav ? [rav.name] : []}, 'todo', 'urgent')`;
      logAudit({ entityType: "case", entityId: caseId, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "סווג אדום — נפתחה פנייה לרב" });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
