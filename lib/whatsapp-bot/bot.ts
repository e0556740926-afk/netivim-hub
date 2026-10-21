import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { normalizePhoneKey } from "@/lib/whatsapp";
import { parse, fmtDue, todayIL, HELP_TEXT } from "./parse";

/**
 * Internal WhatsApp bot, phase 1 — registered staff only.
 * Conversation state lives in whatsapp_sessions (one row per phone):
 *   state "confirm_task" + draft {title, due, urgent} — waiting for כן/לא
 *   draft.list — task ids from the last "המשימות שלי", so "בוצע 2" maps to a real id
 * Every reply is returned as text; the webhook sends it (best-effort).
 */

export type BotUser = { id: number; name: string; role: string; coordinator_id: number | null };

const DRAFT_TTL_MS = 30 * 60 * 1000;

/** Finds an active user whose phone (users.phone or their coordinators.phone) matches. */
export async function findUserByPhone(phoneKey: string): Promise<BotUser | null> {
  const rows = await sql`
    SELECT u.id, u.name, u.role, u.phone AS u_phone, c.id AS coordinator_id, c.phone AS c_phone
    FROM users u LEFT JOIN coordinators c ON c.user_id = u.id
    WHERE u.status = 'active' AND (COALESCE(u.phone,'') <> '' OR COALESCE(c.phone,'') <> '')`;
  const hit = (rows as any[]).find(r => normalizePhoneKey(r.u_phone) === phoneKey || normalizePhoneKey(r.c_phone) === phoneKey);
  return hit ? { id: Number(hit.id), name: hit.name, role: hit.role, coordinator_id: hit.coordinator_id ? Number(hit.coordinator_id) : null } : null;
}

async function getSession(phone: string) {
  const [s] = await sql`SELECT state, draft, updated_at FROM whatsapp_sessions WHERE phone = ${phone}`;
  return s ? { state: s.state as string, draft: (s.draft || {}) as any, fresh: Date.now() - new Date(s.updated_at).getTime() < DRAFT_TTL_MS } : { state: "", draft: {} as any, fresh: false };
}

async function setSession(phone: string, userId: number, state: string, draft: any) {
  await sql`INSERT INTO whatsapp_sessions (phone, user_id, state, draft, updated_at)
    VALUES (${phone}, ${userId}, ${state}, ${JSON.stringify(draft)}::jsonb, now())
    ON CONFLICT (phone) DO UPDATE SET user_id = EXCLUDED.user_id, state = EXCLUDED.state, draft = EXCLUDED.draft, updated_at = now()`;
}

function guessType(title: string): string {
  if (/התקשר|להתקשר|שיחה|לדבר עם|טלפון/.test(title)) return "call";
  if (/פגישה|להיפגש|מפגש/.test(title)) return "meeting";
  if (/חומרים|להדפיס|לשלוח|חוברות|פלאייר/.test(title)) return "materials";
  return "backoffice";
}

async function openTasks(user: BotUser) {
  const hasAssigned = await hasColumn("tasks", "assigned_to");
  const rows = hasAssigned
    ? await sql`SELECT id, title, due_date::text AS due_date, priority FROM tasks
        WHERE status <> 'done' AND (${user.name} = ANY(assignees) OR assigned_to = ${user.id})
        ORDER BY due_date NULLS LAST, id LIMIT 10`
    : await sql`SELECT id, title, due_date::text AS due_date FROM tasks
        WHERE status <> 'done' AND ${user.name} = ANY(assignees)
        ORDER BY due_date NULLS LAST, id LIMIT 10`;
  return rows as any[];
}

async function ownTask(user: BotUser, taskId: number) {
  const hasAssigned = await hasColumn("tasks", "assigned_to");
  const rows = hasAssigned
    ? await sql`SELECT id, title FROM tasks WHERE id = ${taskId} AND (${user.name} = ANY(assignees) OR assigned_to = ${user.id})`
    : await sql`SELECT id, title FROM tasks WHERE id = ${taskId} AND ${user.name} = ANY(assignees)`;
  return (rows as any[])[0] || null;
}

const iso = (d: any) => (d ? (typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)) : null);

export async function handleMessage(user: BotUser, phone: string, text: string): Promise<string> {
  const today = todayIL();
  const intent = parse(text, today);
  const s = await getSession(phone);

  switch (intent.kind) {
    case "help":
      return `שלום ${user.name.split(" ")[0]} 👋\n\n${HELP_TEXT}`;

    case "new_task": {
      if (intent.missingTitle) return "מה המשימה? למשל:\n*משימה: להתקשר לישיבת מאור מחר*";
      const draft = { ...s.draft, task: { title: intent.title, due: intent.due, urgent: intent.urgent } };
      await setSession(phone, user.id, "confirm_task", draft);
      return [
        "*משימה חדשה — לאשר?*",
        "",
        `📝 ${intent.title}`,
        `📅 ${fmtDue(intent.due, today)}`,
        intent.urgent ? "🔴 דחוף" : "",
        "",
        "לשמור? *כן* / *לא*",
        intent.due ? "" : "_אפשר לבטל ולכתוב שוב עם תאריך, למשל \"מחר\" או \"25.11\"_",
      ].filter(Boolean).join("\n");
    }

    case "yes": {
      if (s.state !== "confirm_task" || !s.fresh || !s.draft.task) return "אין כרגע משהו שממתין לאישור.\nכתבו *עזרה* לרשימת הפעולות.";
      const t = s.draft.task;
      const hasPriority = await hasColumn("tasks", "priority");
      const hasAssigned = await hasColumn("tasks", "assigned_to");
      const type = guessType(t.title);
      const details = "נוצר מוואטסאפ";
      const [row] = hasPriority && hasAssigned
        ? await sql`INSERT INTO tasks (coordinator_id, title, details, type, assignees, due_date, status, priority, assigned_to)
            VALUES (${user.coordinator_id}, ${t.title}, ${details}, ${type}, ${[user.name]}, ${t.due}, 'todo', ${t.urgent ? "urgent" : "normal"}, ${user.id}) RETURNING id`
        : await sql`INSERT INTO tasks (coordinator_id, title, details, type, assignees, due_date, status)
            VALUES (${user.coordinator_id}, ${t.title}, ${details}, ${type}, ${[user.name]}, ${t.due}, 'todo') RETURNING id`;
      const { task, ...rest } = s.draft;
      await setSession(phone, user.id, "", rest);
      return `✅ המשימה נשמרה (#${row.id})\n${t.title} · ${fmtDue(t.due, today)}\n\n*המשימות שלי* — לרשימה המלאה`;
    }

    case "no": {
      if (s.state === "confirm_task") {
        const { task, ...rest } = s.draft;
        await setSession(phone, user.id, "", rest);
        return "בוטל, לא נשמר כלום.";
      }
      return "אין כרגע משהו לבטל.";
    }

    case "my_tasks": {
      const list = await openTasks(user);
      await setSession(phone, user.id, s.state === "confirm_task" && s.fresh ? s.state : "", { ...s.draft, list: list.map(t => Number(t.id)) });
      if (!list.length) return "אין משימות פתוחות 🎉";
      const lines = list.map((t, i) => `${i + 1}. ${t.priority === "urgent" ? "🔴 " : ""}${t.title} — ${fmtDue(iso(t.due_date), today)}${iso(t.due_date) && iso(t.due_date)! < today ? " ⚠️" : ""}`);
      return [`*המשימות הפתוחות שלך* (${list.length})`, "", ...lines, "", "*בוצע 1* · *דחה 1 למחר*"].join("\n");
    }

    case "done":
    case "postpone": {
      const ids: number[] = s.draft.list || [];
      const id = ids[intent.index - 1];
      if (!id) return "לא מצאתי את המספר הזה. כתבו *המשימות שלי* ונסו שוב עם מספר מהרשימה.";
      const t = await ownTask(user, id);
      if (!t) return "המשימה הזו כבר לא משויכת אליך.";
      if (intent.kind === "done") {
        const hasChanged = await hasColumn("tasks", "status_changed_at");
        if (hasChanged) await sql`UPDATE tasks SET status = 'done', status_changed_at = now() WHERE id = ${id}`;
        else await sql`UPDATE tasks SET status = 'done' WHERE id = ${id}`;
        return `✅ סומן כבוצע: ${t.title}`;
      }
      await sql`UPDATE tasks SET due_date = ${intent.due} WHERE id = ${id}`;
      return `📅 נדחה ל${fmtDue(intent.due, today)}: ${t.title}`;
    }

    default:
      return `לא הבנתי 🙂\n\n${HELP_TEXT}`;
  }
}
