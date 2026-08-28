import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Runs once a day (07:00 UTC / 09:00/10:00 Israel time depending on DST).
 *
 * Deliberately self-contained: Netlify Scheduled Functions build in a
 * separate esbuild context from the Next.js app, so the "@/lib/*" path
 * aliases used everywhere else do not resolve here. Rather than fight
 * the bundler, this file duplicates the small pieces it needs (DB
 * connection, email/WhatsApp senders) with relative imports only. It
 * touches no file the rest of the app depends on, so it cannot break
 * anything else — worst case, this one function fails to run.
 *
 * Sends three kinds of reminder, each independent of the others:
 *   1. Coordinators who haven't submitted a weekly report by Thursday
 *   2. Tasks overdue by 1+ days, to whoever is assigned
 *   3. Events that happened but still have no results recorded
 */

const sql = neon(process.env.DATABASE_URL!);

const RESEND_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "נתיבים שטח <onboarding@resend.dev>";
const GREENAPI_ID = process.env.GREENAPI_ID_INSTANCE;
const GREENAPI_TOKEN = process.env.GREENAPI_API_TOKEN;
const APP_URL = process.env.NEXTAUTH_URL || "https://ornate-caramel-83bd4f.netlify.app";

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
    });
  } catch (e) {
    console.error("[reminders] email failed:", e);
  }
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
  } catch (e) {
    console.error("[reminders] whatsapp failed:", e);
  }
}

function wrap(title: string, bodyHtml: string) {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="margin:0;padding:24px 12px;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif;">
    <table style="width:100%;max-width:480px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border-collapse:collapse;">
      <tr><td style="background:#0D2744;padding:18px 22px;"><div style="color:#fff;font-size:16px;font-weight:800;">נתיבים שטח</div></td></tr>
      <tr><td style="padding:22px;">
        <div style="font-size:16px;font-weight:700;color:#0D2744;margin-bottom:12px;">${title}</div>
        ${bodyHtml}
      </td></tr>
    </table></body></html>`;
}

export default async () => {
  const results = { missingReports: 0, overdueTasks: 0, undebriefed: 0, errors: [] as string[] };
  // Collected in parallel with the per-person reminders below, so managers
  // get one end-of-run digest instead of a separate flood of per-item mail.
  const digest = {
    missingReports: [] as string[],
    overdueByPerson: [] as { name: string; count: number }[],
    undebriefedEvents: [] as string[],
  };
  const today = new Date();
  const isThursdayOrLater = today.getDay() >= 4 || today.getDay() === 0; // Thu, Fri, Sat, Sun

  // ── 1. Missing weekly reports (only nag from Thursday onward) ──
  if (isThursdayOrLater) {
    try {
      const monday = new Date(today);
      const dow = monday.getDay();
      monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
      const weekStart = monday.toISOString().slice(0, 10);

      const coords = await sql`
        SELECT c.id, c.name, u.email, COALESCE(c.phone, u.phone) as phone
        FROM coordinators c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.id NOT IN (
          SELECT coordinator_id FROM weekly_reports WHERE week_start = ${weekStart}
        )`;

      for (const c of coords as any[]) {
        const html = wrap(
          "📝 תזכורת: דיווח שבועי",
          `<div style="font-size:14px;color:#374151;">שלום ${c.name}, טרם הגשת את הדיווח השבועי לשבוע הנוכחי.</div>
           <a href="${APP_URL}/coord/profile" style="display:inline-block;margin-top:16px;background:#0D2744;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9px;font-size:13px;font-weight:700;">מלא דיווח עכשיו</a>`
        );
        if (c.email) await sendEmail(c.email, "תזכורת: דיווח שבועי טרם הוגש", html);
        if (c.phone) await sendWhatsApp(c.phone, `📝 *תזכורת*\n\nשלום ${c.name}, טרם הגשת דיווח שבועי.\n👈 ${APP_URL}/coord/profile`);
        digest.missingReports.push(c.name);
        results.missingReports++;
      }
    } catch (e: any) {
      results.errors.push(`missingReports: ${e.message}`);
    }
  }

  // ── 2. Overdue tasks (skip weekends noise by capping frequency isn't
  //      needed here — the coordinator wants to know every day it's late) ──
  try {
    const overdue = await sql`
      SELECT t.id, t.title, t.due_date, t.assignees
      FROM tasks t
      WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE
    `;
    const byAssignee = new Map<string, any[]>();
    for (const t of overdue as any[]) {
      for (const raw of t.assignees || []) {
        const name = String(raw).replace(/\s*👑\s*/g, "").trim();
        if (!name) continue;
        if (!byAssignee.has(name)) byAssignee.set(name, []);
        byAssignee.get(name)!.push(t);
      }
    }
    if (byAssignee.size) {
      const names = [...byAssignee.keys()];
      const [coordRows, userRows] = await Promise.all([
        sql`SELECT c.name, u.email, COALESCE(c.phone,u.phone) as phone FROM coordinators c JOIN users u ON u.id=c.user_id WHERE c.name = ANY(${names})`,
        sql`SELECT name, email, phone FROM users WHERE name = ANY(${names}) AND status='active'`,
      ]);
      const contact = new Map<string, { email?: string; phone?: string }>();
      for (const r of coordRows as any[]) contact.set(r.name, { email: r.email, phone: r.phone });
      for (const r of userRows as any[]) if (!contact.has(r.name)) contact.set(r.name, { email: r.email, phone: r.phone });

      for (const [name, list] of byAssignee) {
        const c = contact.get(name);
        if (!c) continue;
        const items = list.map(t => `<li style="margin-bottom:4px;">${t.title}</li>`).join("");
        const html = wrap(
          `⏰ ${list.length} משימות באיחור`,
          `<div style="font-size:14px;color:#374151;margin-bottom:8px;">שלום ${name}, המשימות הבאות עברו את תאריך היעד:</div>
           <ul style="font-size:13px;color:#475569;padding-right:18px;margin:0;">${items}</ul>
           <a href="${APP_URL}/coord/tasks" style="display:inline-block;margin-top:16px;background:#960010;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9px;font-size:13px;font-weight:700;">צפה במשימות</a>`
        );
        if (c.email) await sendEmail(c.email, `⏰ ${list.length} משימות באיחור`, html);
        if (c.phone) await sendWhatsApp(c.phone, `⏰ *${list.length} משימות באיחור*\n\n${list.map(t=>"• "+t.title).join("\n")}\n\n👈 ${APP_URL}/coord/tasks`);
        digest.overdueByPerson.push({ name, count: list.length });
        results.overdueTasks++;
      }
    }
  } catch (e: any) {
    results.errors.push(`overdueTasks: ${e.message}`);
  }

  // ── 3. Events that happened but have no results recorded ───────
  try {
    const undebriefed = await sql`
      SELECT e.id, e.name, e.date, c.name as coord_name, u.email, COALESCE(c.phone,u.phone) as phone
      FROM events e
      LEFT JOIN coordinators c ON c.id = e.coordinator_id
      LEFT JOIN users u ON u.id = c.user_id
      WHERE e.status NOT IN ('done','cancelled')
        AND e.date IS NOT NULL AND e.date < CURRENT_DATE
        AND (e.actual_attendees IS NULL OR e.actual_attendees = 0)
    `;
    for (const e of undebriefed as any[]) {
      if (!e.coord_name) continue;
      const html = wrap(
        "📋 תחקיר אירוע ממתין",
        `<div style="font-size:14px;color:#374151;">שלום ${e.coord_name}, האירוע <b>${e.name}</b> חלף ועדיין לא עודכנו תוצאותיו.</div>
         <a href="${APP_URL}/coord/events" style="display:inline-block;margin-top:16px;background:#B45309;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9px;font-size:13px;font-weight:700;">עדכן תוצאות</a>`
      );
      if (e.email) await sendEmail(e.email, `תחקיר ממתין: ${e.name}`, html);
      if (e.phone) await sendWhatsApp(e.phone, `📋 *תחקיר אירוע ממתין*\n\n${e.name} — יש לעדכן תוצאות.\n👈 ${APP_URL}/coord/events`);
      results.undebriefed++;
      digest.undebriefedEvents.push(`${e.name} (${e.coord_name})`);
    }
  } catch (e: any) {
    results.errors.push(`undebriefed: ${e.message}`);
  }

  // ── 4. Manager digest — one email/WhatsApp summarising everything
  //      above, to every active admin, sent only if there's something
  //      to report (an empty inbox every day trains people to ignore it) ──
  try {
    const hasAny = digest.missingReports.length || digest.overdueByPerson.length || digest.undebriefedEvents.length;
    if (hasAny) {
      const admins = await sql`
        SELECT name, email, phone FROM users WHERE role='admin' AND status='active'`;

      const sections: string[] = [];
      if (digest.missingReports.length) {
        sections.push(`<div style="margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:#B45309;margin-bottom:6px;">📝 דיווח שבועי חסר (${digest.missingReports.length})</div>
          <div style="font-size:13px;color:#475569;">${digest.missingReports.join(", ")}</div>
        </div>`);
      }
      if (digest.overdueByPerson.length) {
        const items = digest.overdueByPerson.map(p => `<li>${p.name} — ${p.count} משימות</li>`).join("");
        sections.push(`<div style="margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:#960010;margin-bottom:6px;">⏰ משימות באיחור</div>
          <ul style="font-size:13px;color:#475569;padding-right:18px;margin:0;">${items}</ul>
        </div>`);
      }
      if (digest.undebriefedEvents.length) {
        sections.push(`<div>
          <div style="font-size:13px;font-weight:700;color:#5B21B6;margin-bottom:6px;">📋 תחקירי אירוע ממתינים (${digest.undebriefedEvents.length})</div>
          <div style="font-size:13px;color:#475569;">${digest.undebriefedEvents.join(" · ")}</div>
        </div>`);
      }

      const html = wrap(
        "📊 סיכום יומי — פריטים הדורשים תשומת לב",
        sections.join("") +
        `<a href="${APP_URL}/admin/dashboard" style="display:inline-block;margin-top:16px;background:#0D2744;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9px;font-size:13px;font-weight:700;">פתח את המערכת</a>`
      );

      const waLines = [
        digest.missingReports.length ? `📝 דיווח חסר: ${digest.missingReports.join(", ")}` : "",
        digest.overdueByPerson.length ? `⏰ באיחור: ${digest.overdueByPerson.map(p=>`${p.name} (${p.count})`).join(", ")}` : "",
        digest.undebriefedEvents.length ? `📋 תחקיר ממתין: ${digest.undebriefedEvents.join(", ")}` : "",
      ].filter(Boolean).join("\n");

      for (const a of admins as any[]) {
        if (a.email) await sendEmail(a.email, "📊 סיכום יומי — פריטים לטיפול", html);
        if (a.phone) await sendWhatsApp(a.phone, `📊 *סיכום יומי*\n\n${waLines}\n\n👈 ${APP_URL}/admin/dashboard`);
      }
    }
  } catch (e: any) {
    results.errors.push(`managerDigest: ${e.message}`);
  }

  console.log("[daily-reminders]", JSON.stringify(results));
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
};

export const config: Config = {
  schedule: "0 7 * * *", // 07:00 UTC daily
};
