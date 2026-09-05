import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = Number(id);
  const [caseRow] = await sql`
    SELECT l.*, c.name AS coordinator_name
    FROM leads l LEFT JOIN coordinators c ON c.id = l.coordinator_id
    WHERE l.id=${caseId}`;
  if (!caseRow) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [extended, protectedInfo, referrals, history, customValues, interactions, caseTasks, documents, consultations] = await Promise.all([
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
    sql`SELECT * FROM case_interactions WHERE case_id=${caseId} ORDER BY created_at DESC`,
    sql`SELECT * FROM tasks WHERE case_id=${caseId} ORDER BY due_date NULLS LAST, created_at DESC`,
    sql`SELECT * FROM documents_case WHERE case_id=${caseId} ORDER BY uploaded_at DESC`,
    sql`SELECT * FROM consultations_rav WHERE case_id=${caseId} ORDER BY created_at DESC`,
  ]);

  return NextResponse.json({
    case: caseRow,
    extended: extended[0] || null,
    protected_meta: protectedInfo[0] || null,
    referrals, history, custom_values: customValues, interactions,
    tasks: caseTasks, documents, consultations,
  });
}

/**
 *   { action: "update_extended", ...fields }
 *   { action: "open_protected" }                       — logged access, returns sensitive_data
 *   { action: "update_protected", sensitive_data }
 *   { action: "set_triage", triage_color }              — "red" auto-escalates to Rav Obermeister
 *   { action: "log_interaction", type, summary, next_step }
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
      // Red flag -> opens a task for the Rav, per spec §6.2, PLUS a
      // consultations_rav row that the Case File's "התייעצות רב" tab
      // reads/updates directly — same event, not a separate mechanism
      // (per completion spec §7: "הטאב הזה הוא התצוגה/הממשק לאותה משימה").
      const [rav] = await sql`SELECT name FROM users WHERE role='rav' LIMIT 1`;
      const [caseRow] = await sql`SELECT name FROM leads WHERE id=${caseId}`;
      const details = [d.description, d.ask ? `נדרש מהרב: ${d.ask}` : null].filter(Boolean).join("\n") || "תיק סווג אדום — מורכבות גבוהה, דורש טיפול הרב";
      const [task] = await sql`
        INSERT INTO tasks (contact_id, case_id, title, details, type, assignees, status, priority)
        VALUES (${null}, ${caseId}, ${`אסקלציה לרב אוברמייסטר: ${caseRow?.name || 'תיק #' + caseId}`}, ${details}, 'backoffice', ${rav ? [rav.name] : []}, 'todo', ${d.urgency === 'low' ? 'normal' : d.urgency === 'medium' ? 'normal' : 'urgent'})
        RETURNING id`;
      await sql`
        INSERT INTO consultations_rav (case_id, description, urgency, request, task_id)
        VALUES (${caseId}, ${d.description || null}, ${d.urgency || null}, ${d.ask || null}, ${task.id})`;
      logAudit({ entityType: "case", entityId: caseId, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "סווג אדום — נפתחה פנייה לרב" });
    }
    return NextResponse.json({ ok: true });
  }

  if (d.action === "log_interaction") {
    const rows = await sql`
      INSERT INTO case_interactions (case_id, type, summary, next_step, created_by)
      VALUES (${caseId}, ${d.type || "call"}, ${d.summary || null}, ${d.next_step || null}, ${me?.name || null})
      RETURNING *`;
    logAudit({ entityType: "case", entityId: caseId, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "אינטראקציה תועדה" });
    return NextResponse.json({ interaction: rows[0] });
  }

  if (d.action === "add_document") {
    // Metadata-only: stores a link to a file already hosted elsewhere
    // (e.g. Google Drive) rather than accepting an upload — no object
    // storage is wired into this app yet, so this doesn't pretend to be
    // real file hosting.
    if (!d.file_url) return NextResponse.json({ error: "missing file_url" }, { status: 400 });
    const rows = await sql`
      INSERT INTO documents_case (case_id, file_url, doc_type, uploaded_by)
      VALUES (${caseId}, ${d.file_url}, ${d.doc_type || null}, ${me?.name || null})
      RETURNING *`;
    logAudit({ entityType: "case", entityId: caseId, action: "create", actorName: me?.name, actorEmail: me?.email, summary: "מסמך צורף לתיק" });
    return NextResponse.json({ document: rows[0] });
  }

  if (d.action === "respond_rav") {
    if (!d.consultation_id) return NextResponse.json({ error: "missing consultation_id" }, { status: 400 });
    await sql`UPDATE consultations_rav SET response=${d.response || null}, status='נענה', responded_at=now() WHERE id=${d.consultation_id} AND case_id=${caseId}`;
    logAudit({ entityType: "case", entityId: caseId, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "התייעצות רב — נענה" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
