import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { normalizePhoneKey } from "@/lib/whatsapp";
import { parse, fmtDue, todayIL, HELP_TEXT, SHORT_HINT, welcomeText, leadSummary, findPhone, type LeadDraft } from "./parse";
import { createLead } from "@/lib/leads-create";

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
  const age = s ? Date.now() - new Date(s.updated_at).getTime() : Infinity;
  return { state: (s?.state || "") as string, draft: (s?.draft || {}) as any, fresh: age < DRAFT_TTL_MS, firstContact: age > 12 * 3600 * 1000 };
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
    ? await sql`SELECT id, title, status, due_date::text AS due_date, priority FROM tasks
        WHERE status <> 'done' AND (${user.name} = ANY(assignees) OR assigned_to = ${user.id})
        ORDER BY due_date NULLS LAST, id LIMIT 10`
    : await sql`SELECT id, title, status, due_date::text AS due_date FROM tasks
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


// ── leads ─────────────────────────────────────────────────────────
function missingLeadField(l: LeadDraft): "name" | "phone" | null {
  if (!l.name) return "name";
  if (!l.phone) return "phone";
  return null;
}

async function askOrConfirmLead(user: BotUser, phone: string, draft: any, lead: LeadDraft): Promise<string> {
  const missing = missingLeadField(lead);
  if (missing) {
    await setSession(phone, user.id, "lead_missing", { ...draft, lead });
    return missing === "name"
      ? `${lead.phone ? "קיבלתי את הטלפון. " : ""}מה השם של הליד?`
      : `מה מספר הנייד של ${lead.name}?`;
  }
  // Duplicate check against every stored format of the same number.
  const key = normalizePhoneKey(lead.phone);
  const rows = await sql`SELECT id, name, phone FROM leads WHERE deleted_at IS NULL AND COALESCE(phone,'') <> ''`;
  const dup = (rows as any[]).find(r => normalizePhoneKey(r.phone) === key);
  if (dup) {
    const { lead: _l, ...rest } = draft;
    await setSession(phone, user.id, "", rest);
    return `⚠️ המספר ${lead.phone} כבר קיים במערכת (ליד: ${dup.name}). לא נשמר שוב.`;
  }
  await setSession(phone, user.id, "confirm_lead", { ...draft, lead });
  return ["*ליד חדש — לאשר?*", "", leadSummary(lead), "", "לשמור ולשלוח לסילפורס? *כן* / *לא*", "_לתיקון: \"עיר: אלעד\", \"גיל: 19\", \"שם: ...\"_"].join("\n");
}

async function saveLead(user: BotUser, phone: string, draft: any): Promise<string> {
  const l: LeadDraft = draft.lead;
  const isCoord = user.role === "coordinator" && user.coordinator_id;
  const r = await createLead({
    name: l.name, phone: l.phone, age: l.age, city: l.city,
    notes: [l.notes, "נקלט מוואטסאפ"].filter(Boolean).join(" · "),
    source: "manual",
    coordinator_id: isCoord ? user.coordinator_id : null,
    owner_name: isCoord ? "" : user.name,
  }, { id: user.id, name: user.name });
  const { lead: _l, ...rest } = draft;
  await setSession(phone, user.id, "", rest);
  if (r.duplicate) return `⚠️ המספר כבר קיים במערכת (ליד: ${r.duplicate.name}). לא נשמר שוב.`;
  return `✅ הליד נשמר (#${r.lead.id}) ונשלח לסילפורס\n${l.name} · ${l.phone}`;
}

// ── events & lead status ──────────────────────────────────────────
const EVENT_STATUS: Record<string, string> = { pending_approval: "ממתין לאישור", planning: "בתכנון", approved: "מאושר", marketing: "בשיווק", done: "הסתיים", cancelled: "בוטל" };
const TASK_STATUS: Record<string, string> = { todo: "לביצוע", inprogress: "בטיפול", waiting: "ממתין לתשובה", done: "בוצע" };

async function weekAhead(user: BotUser, today: string): Promise<string> {
  const until = new Date(today + "T12:00:00Z"); until.setUTCDate(until.getUTCDate() + 7);
  const end = until.toISOString().slice(0, 10);
  const isCoord = user.role === "coordinator" && user.coordinator_id;
  const events = isCoord
    ? await sql`SELECT name, date::text AS date, COALESCE(time,'') AS time, COALESCE(location,'') AS location, status FROM events
        WHERE coordinator_id = ${user.coordinator_id} AND date >= ${today} AND date <= ${end} AND COALESCE(status,'') <> 'cancelled' ORDER BY date, time LIMIT 15`
    : await sql`SELECT e.name, e.date::text AS date, COALESCE(e.time,'') AS time, COALESCE(e.location,'') AS location, e.status, c.name AS coord FROM events e
        LEFT JOIN coordinators c ON c.id = e.coordinator_id
        WHERE e.date >= ${today} AND e.date <= ${end} AND COALESCE(e.status,'') <> 'cancelled' ORDER BY e.date, e.time LIMIT 15`;
  const tasks = (await openTasks(user)).filter(t => t.due_date && t.due_date <= end);
  const out = ["*📅 השבוע הקרוב*", ""];
  out.push(`*אירועים* (${events.length})`);
  if (!events.length) out.push("אין אירועים מתוכננים");
  for (const e of events as any[]) out.push(`• ${fmtDue(e.date, today)}${e.time ? " " + e.time : ""} — ${e.name}${e.location ? " · " + e.location : ""}${e.coord ? " · " + e.coord : ""}${e.status && e.status !== "approved" && e.status !== "marketing" ? ` (${EVENT_STATUS[e.status] || e.status})` : ""}`);
  out.push("", `*משימות לשבוע* (${tasks.length})`);
  if (!tasks.length) out.push("אין משימות עם יעד השבוע");
  for (const t of tasks) out.push(`• ${fmtDue(t.due_date, today)} — ${t.priority === "urgent" ? "🔴 " : ""}${t.title}${t.due_date < today ? " ⚠️ באיחור" : ""}`);
  out.push("", "*המשימות שלי* — לעדכון ודחייה");
  return out.join("\n");
}

async function leadStatus(user: BotUser, query: string): Promise<string> {
  const isCoord = user.role === "coordinator" && user.coordinator_id;
  const [hasSf, hasAdvisor] = await Promise.all([hasColumn("leads", "sf_status"), hasColumn("leads", "advisor_status")]);
  const rows = (isCoord
    ? await sql`SELECT * FROM leads WHERE deleted_at IS NULL AND coordinator_id = ${user.coordinator_id} ORDER BY created_at DESC LIMIT 2000`
    : await sql`SELECT * FROM leads WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5000`) as any[];
  const ph = findPhone(query).phone;
  const key = ph ? normalizePhoneKey(ph) : null;
  const q = query.replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const hits = key
    ? rows.filter(r => normalizePhoneKey(r.phone) === key)
    : rows.filter(r => q.length >= 2 && String(r.name || "").includes(q));
  if (!hits.length) return `לא מצאתי ליד ${key ? "עם המספר " + ph : "בשם \"" + q + "\""}${isCoord ? " בלידים שלך" : ""}.\nנסו לפי טלפון: *סטטוס 0521234567*`;
  const light: Record<string, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
  const blocks = hits.slice(0, 3).map(r => {
    const created = String(r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at || "").slice(0, 10);
    const lines = [`*${r.name}* · ${r.phone}${r.city ? " · " + r.city : ""}`, `נקלט: ${created ? created.split("-").reverse().join(".") : "—"}`];
    if (hasSf && (r.sf_status || r.sf_sub_status)) {
      lines.push(`סטטוס בסילפורס: ${[r.sf_status, r.sf_sub_status].filter(Boolean).join(" — ")} ${light[String(r.sf_light || "").toLowerCase()] || ""}`.trim());
      if (r.sf_advisor) lines.push(`יועץ: ${r.sf_advisor}`);
      if (r.sf_framework) lines.push(`מסגרת: ${r.sf_framework}`);
      if (r.sf_inactive_reason) lines.push(`סיבת אי-פעילות: ${r.sf_inactive_reason}`);
    } else if (hasAdvisor && r.advisor_status) lines.push(`סטטוס: ${r.advisor_status}`);
    else lines.push("סטטוס: עדיין לא התקבל עדכון מסילפורס");
    return lines.join("\n");
  });
  return [...blocks, hits.length > 3 ? `_ועוד ${hits.length - 3} תוצאות — חפשו לפי טלפון לדיוק_` : ""].filter(Boolean).join("\n\n");
}

const iso = (d: any) => (d ? (typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)) : null);

export async function handleMessage(user: BotUser, phone: string, text: string): Promise<string> {
  const today = todayIL();
  const intent = parse(text, today);
  const s = await getSession(phone);

  if (s.state === "lead_missing" && s.fresh && s.draft.lead && intent.kind === "unknown") {
    const lead: LeadDraft = { ...s.draft.lead };
    const ph = findPhone(text);
    if (!lead.phone && ph.phone) lead.phone = ph.phone;
    else if (!lead.name) lead.name = text.trim().split(/\s+/).slice(0, 4).join(" ");
    else return "לא זיהיתי מספר נייד. כתבו מספר כמו 0521234567, או *ביטול*.";
    return askOrConfirmLead(user, phone, s.draft, lead);
  }

  // First message after a long break (or ever): introduce the bot — unless
  // the person already wrote something actionable.
  if (s.firstContact && (intent.kind === "unknown" || intent.kind === "help" || intent.kind === "digit")) {
    await setSession(phone, user.id, "welcome", s.draft);
    return welcomeText(user.name.split(" ")[0]);
  }

  switch (intent.kind) {
    case "new_lead": {
      if (!intent.lead.name && !intent.lead.phone) return "כתבו את פרטי הליד, למשל:\n*ליד: משה כהן 0521234567 בן 19 מבני ברק*";
      return askOrConfirmLead(user, phone, s.draft, intent.lead);
    }

    case "fix": {
      if (!["confirm_lead", "lead_missing"].includes(s.state) || !s.fresh || !s.draft.lead) return "אין כרגע ליד פתוח לתיקון. התחילו ב: *ליד: ...*";
      const lead: LeadDraft = { ...s.draft.lead };
      if (intent.field === "phone") { const p = findPhone(intent.value).phone; if (!p) return "המספר לא נראה כמו נייד ישראלי (05X...)."; lead.phone = p; }
      else if (intent.field === "age") { const n = Number(intent.value.replace(/\D/g, "")); lead.age = n >= 10 && n <= 99 ? n : null; }
      else (lead as any)[intent.field] = intent.value.slice(0, intent.field === "notes" ? 500 : 80);
      return askOrConfirmLead(user, phone, s.draft, lead);
    }

    case "menu":
      await setSession(phone, user.id, "welcome", s.draft);
      return welcomeText(user.name.split(" ")[0]);

    case "help":
      await setSession(phone, user.id, "", s.draft);
      return HELP_TEXT;

    case "digit": {
      if (s.state !== "welcome") return `לא הבנתי 🙂\n${SHORT_HINT}`;
      await setSession(phone, user.id, "", s.draft);
      return intent.n === 1 ? HELP_TEXT : intent.n === 2 ? "מעולה 👍 כתבו מה שתרצו — ליד, משימה, סטטוס או *יומן*.\nבכל רגע *תפריט* חוזר לרשימה." : `לא הבנתי 🙂 כתבו *1* להסבר או *2* כדי להמשיך.`;
    }

    case "events":
      return weekAhead(user, today);

    case "lead_status":
      return leadStatus(user, intent.query);

    case "task_status": {
      const ids: number[] = s.draft.list || [];
      const id = ids[intent.index - 1];
      if (!id) return "לא מצאתי את המספר הזה. כתבו *המשימות שלי* ונסו שוב עם מספר מהרשימה.";
      const t = await ownTask(user, id);
      if (!t) return "המשימה הזו כבר לא משויכת אליך.";
      const hasChanged = await hasColumn("tasks", "status_changed_at");
      if (hasChanged) await sql`UPDATE tasks SET status = ${intent.status}, status_changed_at = now() WHERE id = ${id}`;
      else await sql`UPDATE tasks SET status = ${intent.status} WHERE id = ${id}`;
      return `🔄 ${t.title} — ${TASK_STATUS[intent.status]}`;
    }

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
      if (s.state === "confirm_lead" && s.fresh && s.draft.lead) return saveLead(user, phone, s.draft);
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
      if (s.state === "confirm_lead" || s.state === "lead_missing") {
        const { lead, ...rest } = s.draft;
        await setSession(phone, user.id, "", rest);
        return "בוטל, הליד לא נשמר.";
      }
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
      const lines = list.map((t, i) => `${i + 1}. ${t.priority === "urgent" ? "🔴 " : ""}${t.title} — ${fmtDue(iso(t.due_date), today)}${iso(t.due_date) && iso(t.due_date)! < today ? " ⚠️" : ""}${t.status === "inprogress" || t.status === "waiting" ? ` _(${TASK_STATUS[t.status]})_` : ""}`);
      return [`*המשימות הפתוחות שלך* (${list.length})`, "", ...lines, "", "*בוצע 1* · *בטיפול 1* · *ממתין 1* · *דחה 1 למחר*"].join("\n");
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
      return `לא הבנתי 🙂\n${SHORT_HINT}`;
  }
}
