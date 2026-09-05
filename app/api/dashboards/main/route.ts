import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAutomationSettings } from "@/lib/automation-settings";

export async function GET() {
  const settings = await getAutomationSettings();

  const [
    advisorPipeline, communityPulse, missingReports, budgetOverview,
    fundingUrgent, pendingApprovals, tasksBlock, adminBlock,
  ] = await Promise.all([
    sql`
      SELECT
        count(*) FILTER (WHERE advisor_status NOT IN ('לא פעיל','הסתיים בהצלחה'))::int AS active_cases,
        count(*) FILTER (WHERE advisor_status = 'פנייה חדשה')::int AS new_inquiries,
        count(*) FILTER (WHERE advisor_status = 'פנייה חדשה' AND first_touch_at IS NULL
          AND EXTRACT(EPOCH FROM (now() - created_at))/3600 >= ${settings.sla_hours})::int AS breaching_sla,
        count(*) FILTER (WHERE triage_color = 'red')::int AS red_flag_cases,
        (SELECT count(*)::int FROM case_status_history WHERE to_status='שובץ במסגרת' AND date_trunc('month', changed_at) = date_trunc('month', now())) AS placements_this_month,
        (SELECT count(*)::int FROM referrals WHERE status IN ('ממתין','הוזמן לראיון')) AS pending_institution_referrals
      FROM leads WHERE deleted_at IS NULL`,
    sql`
      SELECT
        (SELECT count(*)::int FROM leads WHERE date_trunc('month', created_at) = date_trunc('month', now()) AND deleted_at IS NULL) AS leads_this_month,
        (SELECT COALESCE(sum(target_leads), 0)::int FROM monthly_targets WHERE month = EXTRACT(MONTH FROM now())::int AND year = EXTRACT(YEAR FROM now())::int) AS target_this_month,
        (SELECT count(*)::int FROM events WHERE date_trunc('month', date) = date_trunc('month', now()) AND status != 'cancelled') AS events_this_month,
        (SELECT COALESCE(sum(amount), 0) FROM expenses WHERE status='paid' AND date_trunc('month', date) = date_trunc('month', now())) AS spend_this_month`,
    sql`
      SELECT count(*)::int AS total_coordinators,
        (SELECT count(DISTINCT coordinator_id)::int FROM weekly_reports WHERE week_start >= date_trunc('week', now())) AS reported_this_week
      FROM coordinators`,
    sql`SELECT COALESCE(sum(amount),0) AS total, (SELECT COALESCE(sum(e.amount),0) FROM expenses e WHERE e.status='paid') AS used FROM funding_sources`,
    sql`
      SELECT count(*)::int AS n FROM funding_sources fs
      WHERE fs.period_end IS NOT NULL AND fs.period_end - CURRENT_DATE <= 30
        AND (SELECT COALESCE(sum(e.amount),0) FROM expenses e WHERE e.funding_source_id = fs.id) < fs.amount * 0.5`,
    sql`
      SELECT
        (SELECT count(*)::int FROM expenses WHERE status='pending') AS expenses_pending,
        (SELECT count(*)::int FROM purchase_requests WHERE status='pending') AS requests_pending`,
    sql`
      SELECT
        count(*) FILTER (WHERE status != 'done' AND due_date < CURRENT_DATE)::int AS overdue_tasks,
        (SELECT count(*)::int FROM consultations_rav WHERE status='ממתין') AS open_rav_consultations
      FROM tasks`,
    sql`
      SELECT
        (SELECT count(*)::int FROM retention_confirmations WHERE confirmed_at IS NULL) AS pending_retention,
        (SELECT count(*)::int FROM institution_users WHERE migrated_at IS NULL) AS legacy_token_accounts,
        (SELECT count(*)::int FROM users WHERE status='active' AND (last_login_at IS NULL OR last_login_at < now() - interval '30 days')) AS inactive_users_30d
      FROM (SELECT 1) x`,
  ]);

  const ap = (advisorPipeline as any[])[0];
  const cp = (communityPulse as any[])[0];
  const mr = (missingReports as any[])[0];
  const bo = (budgetOverview as any[])[0];
  const pa = (pendingApprovals as any[])[0];
  const tb = (tasksBlock as any[])[0];
  const ab = (adminBlock as any[])[0];

  const recentSensitiveAudit = await sql`
    SELECT id, entity_type, entity_id, action, actor_name, summary, created_at FROM audit_log
    WHERE entity_type = 'case_protected' OR action = 'delete'
    ORDER BY created_at DESC LIMIT 5`;

  return NextResponse.json({
    advisor: {
      active_cases: ap.active_cases, new_inquiries: ap.new_inquiries, breaching_sla: ap.breaching_sla,
      red_flag_cases: ap.red_flag_cases, placements_this_month: ap.placements_this_month,
      pending_institution_referrals: ap.pending_institution_referrals,
    },
    community: {
      leads_this_month: cp.leads_this_month, target_this_month: cp.target_this_month,
      events_this_month: cp.events_this_month,
      cost_per_lead: cp.leads_this_month > 0 ? Math.round(Number(cp.spend_this_month) / cp.leads_this_month) : null,
      coordinators_missing_report: Math.max(0, mr.total_coordinators - mr.reported_this_week),
    },
    call_center: null, // no data source exists — honest, not zero
    budget: {
      utilization_pct: bo.total > 0 ? Math.round((Number(bo.used) / Number(bo.total)) * 100) : null,
      funding_sources_urgent: (fundingUrgent as any[])[0].n,
      pending_approvals: pa.expenses_pending + pa.requests_pending,
    },
    tasks: { overdue: tb.overdue_tasks, open_rav_consultations: tb.open_rav_consultations },
    admin: {
      pending_retention: ab.pending_retention, legacy_token_accounts: ab.legacy_token_accounts,
      inactive_users_30d: ab.inactive_users_30d, recent_sensitive_audit: recentSensitiveAudit,
    },
  });
}
