import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendEmail, taskAssignedEmail } from "@/lib/email";
import { sendWhatsApp, taskAssignedMsg } from "@/lib/whatsapp";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const cid = req.nextUrl.searchParams.get("coordinator_id");
  if (name) {
    const rows = await sql`SELECT * FROM tasks WHERE ${name}=ANY(assignees) AND status!='done' ORDER BY due_date LIMIT 10`;
    return NextResponse.json({ tasks: rows });
  }
  if (cid) {
    const rows = await sql`SELECT * FROM tasks WHERE coordinator_id=${parseInt(cid)} ORDER BY due_date`;
    return NextResponse.json({ tasks: rows });
  }
  const rows = await sql`SELECT * FROM tasks ORDER BY due_date`;
  return NextResponse.json({ tasks: rows });
}

// Look up emails for a list of assignee names
async function getEmailsFor(names: string[]) {
  if (!names?.length) return [];
  const clean = names.map(n => n.replace(/\s*👑\s*/g, "").trim()).filter(Boolean);
  if (!clean.length) return [];

  try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text`; } catch {}

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

// Fire-and-forget notifications
async function notifyAssignees(task: any, newAssignees: string[], assignedBy?: string) {
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
        jobs.push(sendEmail({ to: r.email, subject, html }));
      }
      if (r.phone) {
        jobs.push(sendWhatsApp(r.phone, taskAssignedMsg(payload(r))));
      }
      return jobs;
    }));
  } catch (e) {
    console.error("[notify] failed:", e);
  }
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const rows = await sql`
    INSERT INTO tasks (coordinator_id,event_id,contact_id,title,details,type,assignees,due_date,status)
    VALUES (${d.coordinator_id||null},${d.event_id||null},${d.contact_id||null},${d.title},${d.details||''},${d.type||'call'},${d.assignees||[]},${d.due_date||null},${d.status||'todo'})
    RETURNING *`;

  const task = rows[0];
  if (d.notify !== false && d.assignees?.length) {
    await notifyAssignees(task, d.assignees, d.assigned_by);
  }
  return NextResponse.json({ task });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (d.status_only) {
    await sql`UPDATE tasks SET status=${d.status} WHERE id=${d.id}`;
    return NextResponse.json({ ok: true });
  }

  // Find newly-added assignees so we only email them
  const before = await sql`SELECT assignees FROM tasks WHERE id=${d.id} LIMIT 1`;
  const prev: string[] = (before[0] as any)?.assignees || [];
  const next: string[] = d.assignees || [];
  const added = next.filter(n => !prev.includes(n));

  await sql`UPDATE tasks SET title=${d.title},details=${d.details||''},type=${d.type},assignees=${next},due_date=${d.due_date||null},status=${d.status},event_id=${d.event_id||null},contact_id=${d.contact_id||null} WHERE id=${d.id}`;

  if (d.notify !== false && added.length) {
    await notifyAssignees(
      { title: d.title, type: d.type, due_date: d.due_date, details: d.details },
      added,
      d.assigned_by
    );
  }
  return NextResponse.json({ ok: true, notified: added.length });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM tasks WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
