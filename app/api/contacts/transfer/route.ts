import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";
import { accessLevel } from "@/lib/permission-matrix";

/**
 * Hand all of one person's contacts over to someone else — typically when a
 * coordinator leaves. Every moved contact gets its own history entry
 * ("רכז: X → Y"), so the change shows in that contact's change history.
 *
 * GET  ?from=c:<coordinatorId> | o:<ownerName> | none   → preview count
 * POST { from, to, include_tasks }   to = c:<coordinatorId> | o:<managerName>
 *
 * Org-wide only: admins and roles with full contacts access (M).
 */
type Who = { kind: "c"; id: number } | { kind: "o"; name: string } | { kind: "none" };

function parseWho(v: unknown): Who | null {
  const s = String(v ?? "");
  if (s === "none") return { kind: "none" };
  if (s.startsWith("c:") && Number(s.slice(2)) > 0) return { kind: "c", id: Number(s.slice(2)) };
  if (s.startsWith("o:") && s.slice(2).trim()) return { kind: "o", name: s.slice(2).trim() };
  return null;
}

async function authorize(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return { error: NextResponse.json({ error: "לא מורשה" }, { status: 401 }) };
  const level = me.role === "admin" ? "M" : accessLevel({ id: me.id, role: me.role }, "contacts");
  if (level !== "M" || me.role === "coordinator") return { error: NextResponse.json({ error: "העברת אנשי קשר בין רכזים זמינה למנהלים בלבד" }, { status: 403 }) };
  return { me };
}

async function contactsOf(from: Who): Promise<{ id: number; name: string; owner: string }[]> {
  const soft = await hasColumn("contacts", "deleted_at");
  const rows = from.kind === "c"
    ? await sql`SELECT id, name, COALESCE(owner,'') AS owner, deleted_at FROM contacts WHERE coordinator_id = ${from.id}`
    : from.kind === "o"
      ? await sql`SELECT id, name, COALESCE(owner,'') AS owner, deleted_at FROM contacts WHERE coordinator_id IS NULL AND owner = ${from.name}`
      : await sql`SELECT id, name, COALESCE(owner,'') AS owner, deleted_at FROM contacts WHERE coordinator_id IS NULL AND COALESCE(owner,'') = ''`;
  return (rows as any[]).filter(r => !soft || !r.deleted_at).map(r => ({ id: Number(r.id), name: r.name, owner: r.owner }));
}

async function displayName(w: Who): Promise<string> {
  if (w.kind === "c") { const [c] = await sql`SELECT name FROM coordinators WHERE id = ${w.id}`; return (c as any)?.name || ""; }
  if (w.kind === "o") return w.name;
  return "";
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req); if (auth.error) return auth.error;
  const from = parseWho(req.nextUrl.searchParams.get("from"));
  if (!from) return NextResponse.json({ error: "יש לבחור ממי להעביר" }, { status: 400 });
  const list = await contactsOf(from);
  let tasks = 0;
  const name = await displayName(from);
  if (list.length && name) {
    const [t] = await sql`SELECT count(*)::int AS n FROM tasks WHERE status <> 'done' AND contact_id = ANY(${list.map(c => c.id)}) AND ${name} = ANY(assignees)`;
    tasks = (t as any).n;
  }
  return NextResponse.json({ count: list.length, tasks, sample: list.slice(0, 8).map(c => c.name) });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req); if (auth.error) return auth.error;
  const me = auth.me!;
  const d = await req.json().catch(() => ({}));
  const from = parseWho(d.from), to = parseWho(d.to);
  if (!from) return NextResponse.json({ error: "יש לבחור ממי להעביר" }, { status: 400 });
  if (!to || to.kind === "none") return NextResponse.json({ error: "יש לבחור למי להעביר" }, { status: 400 });
  if (JSON.stringify(from) === JSON.stringify(to)) return NextResponse.json({ error: "המקור והיעד זהים" }, { status: 400 });

  // Resolve the target and make sure it exists.
  let toCoordId: number | null = null, toName = "", toUserId: number | null = null;
  if (to.kind === "c") {
    const [c] = await sql`SELECT id, name, user_id FROM coordinators WHERE id = ${to.id}`;
    if (!c) return NextResponse.json({ error: "הרכז לא נמצא" }, { status: 400 });
    toCoordId = Number((c as any).id); toName = (c as any).name; toUserId = (c as any).user_id ? Number((c as any).user_id) : null;
  } else {
    const [u] = await sql`SELECT id, name FROM users WHERE name = ${to.name} AND status = 'active' LIMIT 1`;
    if (!u) return NextResponse.json({ error: "המשתמש לא נמצא" }, { status: 400 });
    toName = (u as any).name; toUserId = Number((u as any).id);
  }

  const list = await contactsOf(from);
  if (!list.length) return NextResponse.json({ ok: true, count: 0, tasks: 0 });
  const ids = list.map(c => c.id);
  const fromName = await displayName(from);

  await sql`UPDATE contacts SET coordinator_id = ${toCoordId}, owner = ${toName} WHERE id = ANY(${ids})`;

  // Optionally hand over the open follow-up tasks on those contacts.
  let tasksMoved = 0;
  if (d.include_tasks && fromName) {
    const hasAssigned = await hasColumn("tasks", "assigned_to");
    const moved = hasAssigned
      ? await sql`UPDATE tasks SET assignees = array_replace(assignees, ${fromName}, ${toName}),
            assigned_to = CASE WHEN assigned_to IS NOT NULL THEN ${toUserId} ELSE assigned_to END
          WHERE status <> 'done' AND contact_id = ANY(${ids}) AND ${fromName} = ANY(assignees) RETURNING id, title`
      : await sql`UPDATE tasks SET assignees = array_replace(assignees, ${fromName}, ${toName})
          WHERE status <> 'done' AND contact_id = ANY(${ids}) AND ${fromName} = ANY(assignees) RETURNING id, title`;
    tasksMoved = moved.length;
    for (const t of moved as any[]) {
      await logAudit({ entityType: "task", entityId: Number(t.id), action: "update", actorId: me.id, actorName: me.name, actorEmail: me.email, summary: `העברת משימה: ${fromName} → ${toName}` });
    }
  }

  const fromLabel = fromName || "ללא שיוך";
  for (const c of list) {
    await logAudit({ entityType: "contact", entityId: c.id, action: "update", actorId: me.id, actorName: me.name, actorEmail: me.email, summary: `רכז: ${c.owner || fromLabel} → ${toName} (העברת אנשי קשר)` });
  }
  return NextResponse.json({ ok: true, count: list.length, tasks: tasksMoved, from: fromLabel, to: toName });
}
