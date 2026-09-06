import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Runs once a day (05:00 UTC). Self-contained on purpose — see the
 * comment in daily-reminders.mts for why: this file duplicates its own
 * DB connection rather than importing "@/lib/*", since scheduled
 * functions build in a separate esbuild context from the Next.js app.
 *
 * Implements the two remaining rule-based automations from the upgrade
 * proposal (§2.2) that are genuinely time-driven, not "on save":
 *   1. Escalation task if a new inquiry has had no first contact within
 *      the configured SLA window (reads the real threshold from
 *      app_settings — the same one already shown on the Advisor Desk —
 *      instead of a second hardcoded number).
 *   2. 30/90/180/365-day check-in tasks, opened automatically the day a
 *      case's history shows it reached "שובץ במסגרת".
 * Round-robin assignment and the 24h intake follow-up task are handled
 * synchronously in /api/leads POST instead, since those fire at the
 * moment of creation, not on a schedule.
 */
const sql = neon(process.env.DATABASE_URL!);

export default async () => {
  const results: any = { escalations_created: 0, checkins_created: 0, errors: [] as string[] };

  try {
    const [slaRow] = await sql`SELECT value FROM app_settings WHERE key='sla_hours'`;
    const slaHours = Number(slaRow?.value) || 24;

    const overdue = await sql`
      SELECT id, name, owner_name, coordinator_id FROM leads
      WHERE deleted_at IS NULL AND advisor_status = 'פנייה חדשה' AND first_touch_at IS NULL
        AND created_at < now() - (${slaHours} || ' hours')::interval`;

    for (const lead of overdue as any[]) {
      const title = `חריגת SLA — טרם נוצר קשר: ${lead.name}`;
      const [already] = await sql`SELECT id FROM tasks WHERE case_id=${lead.id} AND title=${title}`;
      if (already) continue;
      const assignee = lead.owner_name || null;
      await sql`
        INSERT INTO tasks (contact_id, case_id, title, details, type, assignees, due_date, status, priority)
        VALUES (${null}, ${lead.id}, ${title},
          ${`עברו יותר מ-${slaHours} שעות בלי מגע ראשוני — נפתח אוטומטית לפי הגדרת ה-SLA`},
          'call', ${assignee ? [assignee] : []}, ${new Date().toISOString().slice(0, 10)}, 'todo', 'urgent')`;
      results.escalations_created++;
    }
  } catch (e: any) {
    results.errors.push(`escalation: ${e.message}`);
  }

  try {
    const placements = await sql`
      SELECT DISTINCT ON (case_id) case_id, changed_at FROM case_status_history
      WHERE to_status = 'שובץ במסגרת' ORDER BY case_id, changed_at ASC`;

    for (const p of placements as any[]) {
      const daysSince = Math.floor((Date.now() - new Date(p.changed_at).getTime()) / 864e5);
      for (const milestone of [30, 90, 180, 365]) {
        if (daysSince !== milestone) continue;
        const [lead] = await sql`SELECT name, owner_name FROM leads WHERE id=${p.case_id}`;
        if (!lead) continue;
        const title = `מעקב ${milestone} יום — ${lead.name}`;
        const [already] = await sql`SELECT id FROM tasks WHERE case_id=${p.case_id} AND title=${title}`;
        if (already) continue;
        await sql`
          INSERT INTO tasks (contact_id, case_id, title, details, type, assignees, due_date, status, priority)
          VALUES (${null}, ${p.case_id}, ${title},
            ${`נפתח אוטומטית — עברו ${milestone} יום מאז השיבוץ במסגרת. לוודא שהבחור עדיין שם.`},
            'call', ${lead.owner_name ? [lead.owner_name] : []}, ${new Date().toISOString().slice(0, 10)}, 'todo', 'normal')`;
        results.checkins_created++;
      }
    }
  } catch (e: any) {
    results.errors.push(`checkins: ${e.message}`);
  }

  console.log("[case-automation]", JSON.stringify(results));
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
};

export const config: Config = {
  schedule: "0 5 * * *",
};
