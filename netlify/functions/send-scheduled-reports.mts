import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Runs daily; each report_schedules row decides for itself whether it's
 * "due" today based on its own frequency and last_run_at — the schedule
 * itself lives in the DB, editable from /admin/report-builder, not
 * hardcoded here. Self-contained like the other scheduled functions in
 * this repo (see daily-reminders.mts) — no "@/lib/*" imports, since
 * Netlify Functions build in a separate esbuild context.
 */
const sql = neon(process.env.DATABASE_URL!);
const RESEND_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "נתיבים שטח <onboarding@resend.dev>";

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
  } catch (e) { console.error("[send-scheduled-reports] email failed:", e); }
}

function isDue(frequency: string, lastRunAt: string | null): boolean {
  if (!lastRunAt) return true;
  const days = (Date.now() - new Date(lastRunAt).getTime()) / 864e5;
  if (frequency === "daily") return days >= 1;
  if (frequency === "weekly") return days >= 7;
  if (frequency === "monthly") return days >= 28;
  return false;
}

async function buildAnomaliesReport(): Promise<string> {
  const rows = await sql`
    SELECT c.name AS coordinator_name, to_char(l.created_at, 'YYYY-MM') AS month,
      count(*)::int AS leads,
      count(*) FILTER (WHERE l.advisor_status IN ('שובץ במסגרת','הסתיים בהצלחה'))::int AS placed
    FROM coordinators c JOIN leads l ON l.coordinator_id = c.id
    WHERE l.deleted_at IS NULL GROUP BY c.name, 2 ORDER BY c.name, 2`;

  const byCoord = new Map<string, { month: string; rate: number }[]>();
  for (const r of rows as any[]) {
    const rate = r.leads > 0 ? r.placed / r.leads : 0;
    if (!byCoord.has(r.coordinator_name)) byCoord.set(r.coordinator_name, []);
    byCoord.get(r.coordinator_name)!.push({ month: r.month, rate });
  }
  const lines: string[] = [];
  for (const [name, months] of byCoord) {
    if (months.length <= 2) continue;
    const current = months[months.length - 1];
    const history = months.slice(0, -1);
    const avg = history.reduce((s, m) => s + m.rate, 0) / history.length;
    if (avg === 0) continue;
    const deviation = (current.rate - avg) / avg;
    if (Math.abs(deviation) >= 0.5) {
      lines.push(`<li><b>${name}</b> — ${current.month}: שיעור המרה ${Math.round(current.rate * 100)}% מול ממוצע ${Math.round(avg * 100)}% (${deviation > 0 ? "+" : ""}${Math.round(deviation * 100)}%)</li>`);
    }
  }
  return lines.length ? `<ul>${lines.join("")}</ul>` : "<p>אין חריגות משמעותיות השבוע.</p>";
}

export default async () => {
  const schedules = await sql`SELECT * FROM report_schedules WHERE active = true`;
  const results: any[] = [];

  for (const s of schedules as any[]) {
    if (!isDue(s.frequency, s.last_run_at)) continue;
    let html = "<p>סוג דוח לא מוכר.</p>";
    if (s.report_type === "anomalies") html = await buildAnomaliesReport();

    for (const recipient of s.recipients || []) {
      await sendEmail(recipient, `דוח אוטומטי: ${s.name}`, html);
    }
    await sql`UPDATE report_schedules SET last_run_at = now() WHERE id = ${s.id}`;
    results.push({ schedule: s.name, sent_to: (s.recipients || []).length });
  }

  console.log("[send-scheduled-reports]", JSON.stringify(results));
  return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
};

export const config: Config = {
  schedule: "0 6 * * *", // 06:00 UTC daily — each schedule row decides if it's actually due
};
