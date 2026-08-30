import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Runs once a day (06:00 UTC — before daily-reminders.mts at 07:00,
 * so a freshly-spawned occurrence due today is already in the
 * database by the time reminders go out).
 *
 * Self-contained for the same reason as daily-reminders.mts: Netlify
 * Scheduled Functions build in a separate esbuild context where the
 * "@/" path alias doesn't resolve, so this duplicates the small
 * pieces it needs rather than importing from lib/. Shares no file
 * with the Next.js app.
 *
 * Design: a recurring task's own row is never touched by this
 * function except to advance its `next_run` date. When `next_run`
 * arrives, a brand-new task row is created as the next occurrence —
 * the previous occurrence (whether the original row or an earlier
 * generated one) is left exactly as it was. An unfinished occurrence
 * therefore stays open indefinitely, and it is entirely normal for
 * two occurrences of the same recurring task to be open at once.
 */

const sql = neon(process.env.DATABASE_URL!);

const RESEND_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "נתיבים שטח <onboarding@resend.dev>";
const GREENAPI_ID = process.env.GREENAPI_ID_INSTANCE;
const GREENAPI_TOKEN = process.env.GREENAPI_API_TOKEN;
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const APP_URL = process.env.NEXTAUTH_URL || "https://ornate-caramel-83bd4f.netlify.app";

const TYPE_LABEL: Record<string, string> = {
  call: "📞 שיחה", meeting: "🤝 פגישה", materials: "📦 חומרים", backoffice: "💻 בק-אופיס",
};
const RECURRENCE_LABEL: Record<string, string> = { daily: "יומית", weekly: "שבועית", monthly: "חודשית" };

function addInterval(dateStr: string, recurrence: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
    });
  } catch (e) { console.error("[recurring] email failed:", e); }
}

function toChatId(phone?: string | null): string | null {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (p.startsWith("972")) { /* ok */ }
  else if (p.startsWith("0")) p = "972" + p.slice(1);
  else if (p.length === 9) p = "972" + p;
  else return null;
  return p.length >= 11 && p.length <= 15 ? p + "@c.us" : null;
}
async function sendWhatsApp(phone: string | null | undefined, message: string) {
  if (!GREENAPI_ID || !GREENAPI_TOKEN) return;
  const chatId = toChatId(phone);
  if (!chatId) return;
  try {
    await fetch(`https://api.green-api.com/waInstance${GREENAPI_ID}/sendMessage/${GREENAPI_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
  } catch (e) { console.error("[recurring] whatsapp failed:", e); }
}

async function ensureColumns() {
  try {
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence text`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_run date`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_series_id bigint`;
  } catch { /* migration may already have created these */ }
}

export default async () => {
  await ensureColumns();

  const results = { spawned: 0, errors: [] as string[] };

  try {
    const due = await sql`
      SELECT * FROM tasks
      WHERE recurrence IS NOT NULL AND next_run IS NOT NULL AND next_run <= CURRENT_DATE
    `;

    for (const master of due as any[]) {
      try {
        const seriesId = master.recurrence_series_id || master.id;

        // Create the next occurrence — a plain, non-recurring task.
        const inserted = await sql`
          INSERT INTO tasks (coordinator_id, event_id, contact_id, title, details, type, assignees, due_date, status, recurrence_series_id)
          VALUES (${master.coordinator_id}, ${master.event_id}, ${master.contact_id}, ${master.title}, ${master.details}, ${master.type}, ${master.assignees}, ${master.next_run}, 'todo', ${seriesId})
          RETURNING id
        `;

        // Advance the master's schedule so this date is never regenerated.
        const nextRun = addInterval(master.next_run, master.recurrence);
        await sql`UPDATE tasks SET next_run=${nextRun} WHERE id=${master.id}`;

        results.spawned++;

        // Notify assignees that a fresh occurrence is ready.
        const names: string[] = (master.assignees || []).map((n: string) => n.replace(/\s*👑\s*/g, "").trim()).filter(Boolean);
        if (names.length) {
          const [coordRows, userRows] = await Promise.all([
            sql`SELECT c.name, u.email, COALESCE(c.phone, u.phone) as phone FROM coordinators c JOIN users u ON u.id = c.user_id WHERE c.name = ANY(${names})`,
            sql`SELECT name, email, phone FROM users WHERE name = ANY(${names}) AND status='active'`,
          ]);
          const contact = new Map<string, { email?: string; phone?: string }>();
          for (const r of coordRows as any[]) contact.set(r.name, { email: r.email, phone: r.phone });
          for (const r of userRows as any[]) if (!contact.has(r.name)) contact.set(r.name, { email: r.email, phone: r.phone });

          for (const name of names) {
            const c = contact.get(name);
            if (!c) continue;
            const html = `<!DOCTYPE html><html dir="rtl" lang="he"><body style="margin:0;padding:24px 12px;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif;">
              <table style="width:100%;max-width:480px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border-collapse:collapse;">
                <tr><td style="background:#0D2744;padding:18px 22px;"><div style="color:#fff;font-size:16px;font-weight:800;">נתיבים שטח</div></td></tr>
                <tr><td style="padding:22px;">
                  <div style="font-size:16px;font-weight:700;color:#0D2744;margin-bottom:10px;">🔁 משימה חוזרת (${RECURRENCE_LABEL[master.recurrence] || master.recurrence})</div>
                  <div style="font-size:14px;color:#374151;">שלום ${name}, נפתחה עבורך משימה חוזרת חדשה:</div>
                  <div style="margin-top:10px;padding:12px;background:#F0F7FF;border-radius:9px;font-weight:700;color:#0D2744;">${master.title}</div>
                  <a href="${APP_URL}/coord/tasks" style="display:inline-block;margin-top:16px;background:#0D2744;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9px;font-size:13px;font-weight:700;">צפה במשימה</a>
                </td></tr>
              </table></body></html>`;
            if (c.email) await sendEmail(c.email, `🔁 משימה חוזרת: ${master.title}`, html);
            if (c.phone) await sendWhatsApp(c.phone, `🔁 *משימה חוזרת (${RECURRENCE_LABEL[master.recurrence] || master.recurrence})*\n\n${master.title}\n\n👈 ${APP_URL}/coord/tasks`);
          }
        }
      } catch (e: any) {
        results.errors.push(`task ${master.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    results.errors.push(`query: ${e.message}`);
  }

  console.log("[recurring-tasks]", JSON.stringify(results));
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
};

export const config: Config = {
  schedule: "0 6 * * *", // 06:00 UTC daily, an hour before daily-reminders
};
