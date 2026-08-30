import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Runs once a day at 05:00 UTC — before daily-reminders (07:00 UTC),
 * so a task generated as "due today" is already in the database when
 * that function checks for tasks due today.
 *
 * Self-contained for the same reason as daily-reminders.mts: this
 * builds in a separate esbuild context from the Next.js app where the
 * "@/lib/*" aliases don't resolve, so it gets its own DB connection
 * rather than importing shared code.
 *
 * Deliberately does NOT check whether the previous occurrence of a
 * recurring task was completed — a new instance is created on
 * schedule regardless, so the same task can legitimately be open
 * twice (this was an explicit requirement, not an oversight).
 * Idempotency is handled separately via last_generated_date, which
 * only guards against the function firing more than once on the same
 * calendar day (e.g. a manual re-run) — not against back-to-back
 * occurrences on different days.
 */

const sql = neon(process.env.DATABASE_URL!);

/** Last valid day of the month containing `d`. */
function lastDayOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function shouldFireToday(t: any, today: Date): boolean {
  if (t.frequency === "daily") return true;

  if (t.frequency === "weekly") {
    return today.getDay() === t.day_of_week;
  }

  if (t.frequency === "monthly") {
    // Clamp: a template set for the 31st fires on the last day of a
    // shorter month instead of never firing that month.
    const target = Math.min(t.day_of_month, lastDayOfMonth(today));
    return today.getDate() === target;
  }

  return false;
}

export default async () => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const results = { checked: 0, generated: 0, errors: [] as string[] };

  try {
    const templates = await sql`SELECT * FROM recurring_tasks WHERE active = true`;
    results.checked = templates.length;

    for (const t of templates as any[]) {
      try {
        // Already generated today — guards against the function
        // firing twice in one day, not against consecutive days.
        if (t.last_generated_date && String(t.last_generated_date).slice(0, 10) === todayStr) {
          continue;
        }
        if (!shouldFireToday(t, today)) continue;

        await sql`
          INSERT INTO tasks (title, type, details, assignees, coordinator_id, due_date, status, recurring_task_id)
          VALUES (${t.title}, ${t.type || "call"}, ${t.details || ""}, ${t.assignees || []},
                  ${t.coordinator_id}, ${todayStr}, 'todo', ${t.id})
        `;
        await sql`UPDATE recurring_tasks SET last_generated_date = ${todayStr} WHERE id = ${t.id}`;
        results.generated++;
      } catch (e: any) {
        results.errors.push(`template ${t.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    // Table likely doesn't exist yet (migration not applied) — not an
    // error worth alarming over, just nothing to do this run.
    results.errors.push(`load templates: ${e.message}`);
  }

  console.log("[recurring-tasks]", JSON.stringify(results));
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
};

export const config: Config = {
  schedule: "0 5 * * *", // 05:00 UTC daily
};
