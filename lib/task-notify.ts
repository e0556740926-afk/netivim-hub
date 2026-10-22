import sql from "@/lib/db";
import { sendEmail, taskAssignedEmail } from "@/lib/email";
import { sendWhatsApp, taskAssignedMsg } from "@/lib/whatsapp";
import { sendPush } from "@/lib/push";
import { hasColumn } from "@/lib/schema";

/**
 * Task-assignment notifications (email + push + WhatsApp) and their
 * per-channel delivery log. Shared by POST/PATCH /api/tasks and the
 * WhatsApp bot, so a task created from either place notifies the same way.
 */

// Look up emails for a list of assignee names
export async function getEmailsFor(names: string[]) {
  if (!names?.length) return [];
  const clean = names.map(n => n.replace(/\s*👑\s*/g, "").trim()).filter(Boolean);
  if (!clean.length) return [];


  const [coordRows, userRows] = await Promise.all([
    sql`SELECT c.name, u.email, COALESCE(c.phone, u.phone) as phone FROM coordinators c
        JOIN users u ON u.id = c.user_id
        WHERE c.name = ANY(${clean})`,
    sql`SELECT name, email, phone, role FROM users
        WHERE name = ANY(${clean}) AND status='active'`,
  ]);

  const map = new Map<string, { email?: string; phone?: string; isCoordinator: boolean }>();
  for (const r of coordRows as any[]) map.set(r.name, { email: r.email, phone: r.phone, isCoordinator: true });
  for (const r of userRows as any[]) {
    if (!map.has(r.name)) map.set(r.name, { email: r.email, phone: r.phone, isCoordinator: r.role === "coordinator" });
  }
  return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
}

/**
 * Fire-and-forget notifications. Also returns a small per-channel
 * delivery log ({channel, to, ok, reason, at}[]) so the caller can
 * persist it to tasks.notify_log — surfaced to managers because the
 * email channel is known-unreliable (no verified Resend domain) and
 * silently-failed mail was invisible before this.
 */
export async function notifyAssignees(task: any, newAssignees: string[], assignedBy?: string): Promise<any[]> {
  const log: any[] = [];
  try {
    const recipients = await getEmailsFor(newAssignees);
    const payload = (r: any) => ({
      assigneeName: r.name,
      taskTitle: task.title,
      taskType: task.type,
      dueDate: task.due_date ? String(task.due_date).slice(0, 10) : null,
      details: task.details,
      assignedBy,
      isCoordinator: r.isCoordinator,
    });
    await Promise.all(recipients.flatMap(r => {
      const jobs: Promise<any>[] = [];
      if (r.email) {
        const { subject, html } = taskAssignedEmail(payload(r));
        jobs.push(sendEmail({ to: r.email, subject, html }).then((res: any) => {
          log.push({ channel: "email", to: r.name, ok: !!res?.ok, reason: res?.ok ? undefined : res?.reason, at: new Date().toISOString() });
        }));
        jobs.push(sendPush(r.email, {
          title: "✅ משימה חדשה",
          body: task.title,
          url: r.isCoordinator ? "/coord/tasks" : "/admin/tasks",
        }));
      }
      if (r.phone) {
        jobs.push(sendWhatsApp(r.phone, taskAssignedMsg(payload(r))).then((res: any) => {
          log.push({ channel: "whatsapp", to: r.name, ok: !!res?.ok, reason: res?.ok ? undefined : res?.reason, at: new Date().toISOString() });
        }));
      }
      return jobs;
    }));
  } catch (e) {
    console.error("[notify] failed:", e);
  }
  return log;
}

/** Appends entries to tasks.notify_log, keeping the most recent 20. Never throws. */
export async function persistNotifyLog(taskId: number, entries: any[]) {
  if (!entries.length) return;
  try {
    if (!(await hasColumn("tasks", "notify_log"))) return;
    await sql`
      UPDATE tasks SET notify_log = (
        SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
          SELECT x FROM jsonb_array_elements(COALESCE(notify_log,'[]'::jsonb) || ${JSON.stringify(entries)}::jsonb) x
          ORDER BY (x->>'at') DESC LIMIT 20
        ) s
      )
      WHERE id=${taskId}`;
  } catch (e) {
    console.error("[notify_log] failed:", e);
  }
}

