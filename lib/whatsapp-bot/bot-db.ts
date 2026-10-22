import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { logAudit } from "@/lib/audit";
import { createLead } from "@/lib/leads-create";
import { normalizePhoneKey, sendWhatsApp } from "@/lib/whatsapp";
import { syncAssignedAndParticipants } from "@/lib/task-assignment";
import { notifyAssignees, persistNotifyLog } from "@/lib/task-notify";
import { CITIES, padId, type LeadDraft, type Person } from "./parse";
import { supportPhone } from "./settings";
import type { BotDeps, BotUser, Draft, EventRow, LeadRow, TaskRow } from "./bot";

/** Real (DB + network) implementation of BotDeps. */

/** Finds an active user whose phone (users.phone or their coordinators.phone) matches. */
export async function findUserByPhone(phoneKey: string): Promise<BotUser | null> {
  const rows = await sql`
    SELECT u.id, u.name, u.role, u.phone AS u_phone, c.id AS coordinator_id, c.phone AS c_phone
    FROM users u LEFT JOIN coordinators c ON c.user_id = u.id
    WHERE u.status = 'active' AND (COALESCE(u.phone,'') <> '' OR COALESCE(c.phone,'') <> '')`;
  const hit = (rows as any[]).find(r => normalizePhoneKey(r.u_phone) === phoneKey || normalizePhoneKey(r.c_phone) === phoneKey);
  return hit ? { id: Number(hit.id), name: hit.name, role: hit.role, coordinator_id: hit.coordinator_id ? Number(hit.coordinator_id) : null } : null;
}

const isCoord = (u: BotUser) => u.role === "coordinator" && !!u.coordinator_id;

/** Both stored spellings of an Israeli mobile, digits only: 05XXXXXXXX and 9725XXXXXXXX. */
function phoneForms(phone: string): string[] {
  const key = normalizePhoneKey(phone);
  return key ? [key, "0" + key.slice(3)] : [];
}

function guessType(title: string): string {
  if (/התקשר|להתקשר|שיחה|לדבר עם|טלפון/u.test(title)) return "call";
  if (/פגישה|להיפגש|מפגש/u.test(title)) return "meeting";
  if (/חומרים|להדפיס|לשלוח|חוברות|פלאייר/u.test(title)) return "materials";
  return "backoffice";
}

let citiesCache: { at: number; list: string[] } | null = null;
let channelId: { at: number; id: number | null } | null = null;

async function botArrivalChannelId(): Promise<number | null> {
  if (channelId && Date.now() - channelId.at < 10 * 60_000) return channelId.id;
  try {
    if (!(await hasColumn("leads", "arrival_channel_id"))) return null;
    await sql`INSERT INTO arrival_channels (label) VALUES ('בוט וואטסאפ') ON CONFLICT (label) DO NOTHING`;
    const [r] = await sql`SELECT id FROM arrival_channels WHERE label = 'בוט וואטסאפ' LIMIT 1`;
    channelId = { at: Date.now(), id: r ? Number(r.id) : null };
    return channelId.id;
  } catch (e) {
    console.error("[wa-bot] arrival channel", e);
    return null;
  }
}

async function ownTaskWhere(user: BotUser, id: number): Promise<TaskRow | null> {
  const hasAssigned = await hasColumn("tasks", "assigned_to");
  const rows = hasAssigned
    ? await sql`SELECT id, title, status, due_date::text AS due_date, priority, details FROM tasks
        WHERE id = ${id} AND (${user.name} = ANY(assignees) OR assigned_to = ${user.id})`
    : await sql`SELECT id, title, status, due_date::text AS due_date, NULL AS priority, details FROM tasks
        WHERE id = ${id} AND ${user.name} = ANY(assignees)`;
  const r = (rows as any[])[0];
  return r ? { ...r, id: Number(r.id) } : null;
}

async function openTasksFor(user: BotUser): Promise<TaskRow[]> {
  const [hasAssigned, hasPriority] = await Promise.all([hasColumn("tasks", "assigned_to"), hasColumn("tasks", "priority")]);
  const rows = hasAssigned && hasPriority
    ? await sql`SELECT id, title, status, due_date::text AS due_date, priority, details FROM tasks
        WHERE status <> 'done' AND (${user.name} = ANY(assignees) OR assigned_to = ${user.id})
        ORDER BY due_date NULLS LAST, (priority = 'urgent') DESC, id LIMIT 50`
    : await sql`SELECT id, title, status, due_date::text AS due_date, NULL AS priority, details FROM tasks
        WHERE status <> 'done' AND ${user.name} = ANY(assignees)
        ORDER BY due_date NULLS LAST, id LIMIT 50`;
  return (rows as any[]).map(r => ({ ...r, id: Number(r.id) }));
}

export function makeBotDeps(opts: { userPhone: string; instancePhone?: string | null }): BotDeps {
  let peopleCache: Person[] | null = null;

  return {
    now: () => new Date(),

    async getSession(phone) {
      const [s] = await sql`SELECT state, draft, updated_at FROM whatsapp_sessions WHERE phone = ${phone}`;
      if (!s) return null;
      return { state: s.state || "", draft: (s.draft || {}) as Draft, updatedAt: new Date(s.updated_at).getTime() };
    },

    async setSession(phone, userId, state, draft) {
      await sql`INSERT INTO whatsapp_sessions (phone, user_id, state, draft, updated_at)
        VALUES (${phone}, ${userId}, ${state}, ${JSON.stringify(draft)}::jsonb, now())
        ON CONFLICT (phone) DO UPDATE SET user_id = EXCLUDED.user_id, state = EXCLUDED.state, draft = EXCLUDED.draft, updated_at = now()`;
    },

    async claimState(phone, from, to) {
      const rows = await sql`UPDATE whatsapp_sessions SET state = ${to}, updated_at = now() WHERE phone = ${phone} AND state = ${from} RETURNING 1`;
      return rows.length > 0;
    },

    async people() {
      if (!peopleCache) {
        const rows = await sql`SELECT id, name FROM users WHERE status = 'active' AND COALESCE(name,'') <> '' ORDER BY name`;
        peopleCache = (rows as any[]).map(r => ({ id: Number(r.id), name: String(r.name) }));
      }
      return peopleCache;
    },

    async cities() {
      if (citiesCache && Date.now() - citiesCache.at < 10 * 60_000) return citiesCache.list;
      try {
        const rows = await sql`SELECT city FROM leads WHERE COALESCE(city,'') <> '' AND deleted_at IS NULL GROUP BY city HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 300`;
        const list = [...new Set([...CITIES, ...(rows as any[]).map(r => String(r.city).trim()).filter(c => c.length >= 2 && c.length <= 30)])];
        citiesCache = { at: Date.now(), list };
        return list;
      } catch {
        return CITIES;
      }
    },

    async findLeadDuplicate(user, phone, idNumber) {
      const forms = phoneForms(phone);
      const id = idNumber ? padId(idNumber) : "";
      const rows = await sql`
        SELECT id, name, coordinator_id FROM leads
        WHERE deleted_at IS NULL AND (
          (${forms.length > 0} AND regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = ANY(${forms}))
          OR (${id !== ""} AND COALESCE(id_number,'') <> '' AND lpad(regexp_replace(id_number, '\\D', '', 'g'), 9, '0') = ${id})
        ) LIMIT 1`;
      const r = (rows as any[])[0];
      if (!r) return null;
      return { name: r.name, mine: !isCoord(user) || Number(r.coordinator_id) === user.coordinator_id };
    },

    async createLead(user, l: LeadDraft) {
      const coord = isCoord(user);
      const r = await createLead({
        name: l.name, phone: l.phone, id_number: l.idNumber || "", age: l.age, city: l.city,
        notes: [l.notes, "נקלט מוואטסאפ"].filter(Boolean).join(" · "),
        source: "manual",
        coordinator_id: coord ? user.coordinator_id : null,
        owner_name: coord ? "" : user.name,
        arrival_channel_id: await botArrivalChannelId(),
      }, { id: user.id, name: user.name });
      if (r.duplicate) {
        const [d] = await sql`SELECT coordinator_id FROM leads WHERE id = ${r.duplicate.id}`;
        return { duplicate: { name: r.duplicate.name, mine: !coord || Number(d?.coordinator_id) === user.coordinator_id } };
      }
      return { id: Number(r.lead.id) };
    },

    async searchLeads(user, q) {
      const coord = isCoord(user);
      const cid = user.coordinator_id || 0;
      let rows: any[];
      if (q.phone) {
        const forms = phoneForms(q.phone);
        rows = await sql`SELECT * FROM leads WHERE deleted_at IS NULL AND (${!coord} OR coordinator_id = ${cid})
          AND regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = ANY(${forms}) ORDER BY created_at DESC LIMIT 20`;
      } else if (q.idNumber) {
        rows = await sql`SELECT * FROM leads WHERE deleted_at IS NULL AND (${!coord} OR coordinator_id = ${cid})
          AND COALESCE(id_number,'') <> '' AND lpad(regexp_replace(id_number, '\\D', '', 'g'), 9, '0') = ${padId(q.idNumber)}
          ORDER BY created_at DESC LIMIT 20`;
      } else {
        rows = await sql`SELECT * FROM leads WHERE deleted_at IS NULL AND (${!coord} OR coordinator_id = ${cid})
          AND name ILIKE ${"%" + (q.name || "").replace(/[%_]/g, "") + "%"} ORDER BY created_at DESC LIMIT 20`;
      }
      return rows.map(r => ({
        id: Number(r.id), name: r.name, phone: r.phone, city: r.city, created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        id_number: r.id_number || null, sf_status: r.sf_status, sf_sub_status: r.sf_sub_status, sf_light: r.sf_light,
        sf_advisor: r.sf_advisor, sf_framework: r.sf_framework, sf_inactive_reason: r.sf_inactive_reason,
        sf_updated_at: r.sf_updated_at ? new Date(r.sf_updated_at).toISOString() : null, advisor_status: r.advisor_status,
      })) as LeadRow[];
    },

    openTasks: openTasksFor,
    getTask: ownTaskWhere,

    async updateTask(user, id, patch) {
      if (patch.status) {
        const hasChanged = await hasColumn("tasks", "status_changed_at");
        if (hasChanged) await sql`UPDATE tasks SET status = ${patch.status}, status_changed_at = now() WHERE id = ${id}`;
        else await sql`UPDATE tasks SET status = ${patch.status} WHERE id = ${id}`;
        logAudit({ entityType: "task", entityId: id, action: "update", actorId: user.id, actorName: user.name, summary: `סטטוס → ${patch.status} (וואטסאפ)` });
      }
      if (patch.due_date) {
        await sql`UPDATE tasks SET due_date = ${patch.due_date} WHERE id = ${id}`;
        logAudit({ entityType: "task", entityId: id, action: "update", actorId: user.id, actorName: user.name, summary: `נדחה ל-${patch.due_date} (וואטסאפ)` });
      }
    },

    async createTask(user, t) {
      const names = t.assignees.length ? t.assignees.map(a => a.name) : [user.name];
      let coordinatorId = isCoord(user) ? user.coordinator_id : null;
      if (!coordinatorId && t.assignees.length) {
        const ids = t.assignees.map(a => a.id);
        const [c] = await sql`SELECT id FROM coordinators WHERE user_id = ANY(${ids}) ORDER BY array_position(${ids}::bigint[], user_id) LIMIT 1`;
        coordinatorId = c ? Number(c.id) : null;
      }
      const hasPriority = await hasColumn("tasks", "priority");
      const details = `נוצר מוואטסאפ ע״י ${user.name}`;
      const type = guessType(t.title);
      const [row] = hasPriority
        ? await sql`INSERT INTO tasks (coordinator_id, title, details, type, assignees, due_date, status, priority)
            VALUES (${coordinatorId}, ${t.title}, ${details}, ${type}, ${names}, ${t.due}, ${t.status}, ${t.urgent ? "urgent" : "normal"}) RETURNING *`
        : await sql`INSERT INTO tasks (coordinator_id, title, details, type, assignees, due_date, status)
            VALUES (${coordinatorId}, ${t.title}, ${details}, ${type}, ${names}, ${t.due}, ${t.status}) RETURNING *`;
      await syncAssignedAndParticipants(Number(row.id), names);
      const others = names.filter(n => n !== user.name);
      if (others.length) {
        const log = await notifyAssignees(row, others, user.name);
        await persistNotifyLog(Number(row.id), log);
      }
      logAudit({ entityType: "task", entityId: Number(row.id), action: "create", actorId: user.id, actorName: user.name, summary: `נוצרה מוואטסאפ: ${t.title}` });
      return { id: Number(row.id), notified: others };
    },

    async week(user, from, to) {
      const coord = isCoord(user);
      const events = coord
        ? await sql`SELECT name, date::text AS date, COALESCE(time,'') AS time, COALESCE(location,'') AS location, status FROM events
            WHERE coordinator_id = ${user.coordinator_id} AND date >= ${from} AND date <= ${to} AND COALESCE(status,'') <> 'cancelled'
            ORDER BY date, time LIMIT 25`
        : await sql`SELECT e.name, e.date::text AS date, COALESCE(e.time,'') AS time, COALESCE(e.location,'') AS location, e.status, c.name AS coord FROM events e
            LEFT JOIN coordinators c ON c.id = e.coordinator_id
            WHERE e.date >= ${from} AND e.date <= ${to} AND COALESCE(e.status,'') <> 'cancelled'
            ORDER BY e.date, e.time LIMIT 25`;
      const tasks = (await openTasksFor(user)).filter(t => t.due_date && String(t.due_date).slice(0, 10) <= to);
      return { events: events as EventRow[], tasks };
    },

    async outboundTask(stanzaId) {
      try {
        const [r] = await sql`SELECT task_id FROM whatsapp_outbound WHERE wa_message_id = ${stanzaId}`;
        return r?.task_id ? Number(r.task_id) : null;
      } catch {
        return null;
      }
    },

    async notifySupport(user, context) {
      const to = await supportPhone();
      if (!to) return false;
      const msg = [
        "🙋 *בקשת תמיכה מהבוט*",
        "",
        `${user.name} ביקש/ה עזרה.`,
        context ? `_${context}_` : "",
        `📞 ${"0" + (normalizePhoneKey(opts.userPhone) || "").slice(3)}`,
      ].filter(Boolean).join("\n");
      const r = await sendWhatsApp(to, msg);
      return !!r.ok;
    },
  };
}
