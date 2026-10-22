import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Two-way WhatsApp task reminders (bot v2), once a day at the hour set in
 * the bot settings screen (default 10:00 Israel time).
 *
 * Runs at 06/07/08 UTC so one of the runs lands on the chosen Israeli hour
 * in both summer and winter time; the others exit immediately, and
 * last_reminder_date stops a double send. Never on Shabbat.
 *
 * Per person with tasks due today or overdue:
 *   ≤ 5 tasks → one message per task with [✅ בוצע] [⏰ מחר] [📅 תאריך אחר];
 *               the message id → task id is stored in whatsapp_outbound so
 *               the webhook knows which task a tap belongs to.
 *   > 5 tasks (or buttons off/failing) → one numbered digest; the list is
 *               written into the person's bot session so "בוצע 1 3" works.
 *
 * Also does the bot's daily housekeeping (log retention, stale drafts).
 *
 * Self-contained on purpose: Netlify functions build in a separate esbuild
 * context, so no "@/lib/*" imports. Button ids must match lib/whatsapp-bot/bot.ts.
 */

const sql = neon(process.env.DATABASE_URL!);
const GREENAPI_ID = process.env.GREENAPI_ID_INSTANCE;
const GREENAPI_TOKEN = process.env.GREENAPI_API_TOKEN;
const MAX_PER_TASK = 5;
const GAP_MS = 700;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function toChatId(phone?: string | null): string | null {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (p.startsWith("972")) { /* ok */ }
  else if (p.startsWith("0")) p = "972" + p.slice(1);
  else if (p.length === 9) p = "972" + p;
  else return null;
  return p.length >= 11 && p.length <= 15 ? p + "@c.us" : null;
}

async function green(method: string, body: any): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!GREENAPI_ID || !GREENAPI_TOKEN) return { ok: false, error: "no_config" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${(process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "")}/waInstance${GREENAPI_ID}/${method}/${GREENAPI_TOKEN}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    const data: any = await res.json().catch(() => null);
    return res.ok && data?.idMessage ? { ok: true, id: data.idMessage } : { ok: false, error: `${res.status} ${JSON.stringify(data)}` };
  } catch (e: any) {
    return { ok: false, error: String(e?.name === "AbortError" ? "timeout" : e) };
  } finally {
    clearTimeout(t);
  }
}

function israelNow(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(d).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday as string };
}

const HEB_DAY = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
function dueLabel(due: string, today: string): string {
  if (due === today) return "היום";
  const d = new Date(due + "T12:00:00Z");
  const days = Math.round((new Date(today + "T12:00:00Z").getTime() - d.getTime()) / 864e5);
  if (days === 1) return "באיחור מאתמול";
  return `באיחור מיום ${HEB_DAY[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

async function logOut(phone: string, body: string, id: string | undefined, ok: boolean, kind: string) {
  await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status, kind)
    VALUES (${phone}, ${null}, 'out', ${body.slice(0, 2000)}, ${id || null}, 'בוט · תזכורת', ${ok ? "sent" : "failed"}, ${kind})`.catch(() => {});
}

export default async (req: Request) => {
  const results = { ran: false, reason: "", people: 0, perTask: 0, digests: 0, failures: 0, cleaned: {} as Record<string, number> };
  const force = new URL(req.url).searchParams.get("force") === "1";
  const now = israelNow();

  let settings: any;
  try {
    [settings] = await sql`SELECT * FROM whatsapp_bot_settings WHERE id = 1`;
  } catch {
    results.reason = "no settings table yet";
    return Response.json(results);
  }
  if (!settings) { results.reason = "no settings row"; return Response.json(results); }

  const hour = Number(settings.reminder_hour) || 10;
  const lastDate = settings.last_reminder_date ? new Date(settings.last_reminder_date).toISOString().slice(0, 10) : null;
  if (!force) {
    if (now.hour !== hour) { results.reason = `not ${hour}:00 in Israel (now ${now.hour})`; return Response.json(results); }
    if (lastDate === now.date) { results.reason = "already ran today"; return Response.json(results); }
  }
  await sql`UPDATE whatsapp_bot_settings SET last_reminder_date = ${now.date} WHERE id = 1`;

  // ── housekeeping (daily, even when reminders are off) ──
  try {
    const a = await sql`DELETE FROM whatsapp_messages WHERE case_id IS NULL AND status IN ('bot','sent','failed') AND created_at < now() - interval '90 days' RETURNING 1`;
    const b = await sql`DELETE FROM whatsapp_outbound WHERE created_at < now() - interval '30 days' RETURNING 1`;
    const c = await sql`UPDATE whatsapp_sessions SET state = 'idle', draft = (draft - 'lead' - 'task' - 'suspended' - 'leadHits'), updated_at = updated_at
      WHERE updated_at < now() - interval '24 hours' AND (draft ? 'lead' OR draft ? 'task' OR draft ? 'suspended') RETURNING 1`;
    results.cleaned = { messages: a.length, outbound: b.length, drafts: c.length };
  } catch (e: any) {
    console.error("[wa-reminders] cleanup", e);
  }

  if (process.env.WHATSAPP_BOT_ENABLED !== "true" || !settings.enabled || !settings.reminders_enabled) {
    results.reason = "reminders off";
    return Response.json(results);
  }
  if (now.weekday === "Sat" && !force) { results.reason = "שבת"; return Response.json(results); }
  results.ran = true;

  const tasks = await sql`SELECT id, title, due_date::text AS due_date, assignees, priority FROM tasks
    WHERE status <> 'done' AND due_date IS NOT NULL AND due_date <= ${now.date}
    ORDER BY due_date, id`;
  const byName = new Map<string, any[]>();
  for (const t of tasks as any[]) {
    for (const raw of t.assignees || []) {
      const name = String(raw).replace(/\s*👑\s*/g, "").trim();
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(t);
    }
  }
  if (!byName.size) return Response.json(results);

  const names = [...byName.keys()];
  const rows = await sql`SELECT u.id, u.name, COALESCE(NULLIF(c.phone,''), u.phone) AS phone FROM users u
    LEFT JOIN coordinators c ON c.user_id = u.id WHERE u.status = 'active' AND u.name = ANY(${names})`;
  let buttonsOn = !!settings.buttons_enabled;

  for (const u of rows as any[]) {
    const chatId = toChatId(u.phone);
    const list = byName.get(u.name) || [];
    if (!chatId || !list.length) continue;
    const phoneKey = chatId.replace("@c.us", "");
    results.people++;
    let sentAll = false;

    if (buttonsOn && list.length <= MAX_PER_TASK) {
      sentAll = true;
      for (const t of list) {
        const body = `⏰ *תזכורת למשימה*\n\n*${t.title}*\n📅 ${dueLabel(t.due_date, now.date)}${t.priority === "urgent" ? " · 🔴 דחוף" : ""}`;
        const r = await green("sendInteractiveButtonsReply", {
          chatId, body, footer: "אפשר גם לענות: בוצע / מחר",
          buttons: [
            { buttonId: `rem_done:${t.id}`, buttonText: "✅ בוצע" },
            { buttonId: `rem_tomorrow:${t.id}`, buttonText: "⏰ מחר" },
            { buttonId: `rem_other:${t.id}`, buttonText: "📅 תאריך אחר" },
          ],
        });
        await logOut(phoneKey, `${body}\n[✅ בוצע | ⏰ מחר | 📅 תאריך אחר]`, r.id, r.ok, "button");
        if (!r.ok) {
          console.error("[wa-reminders] buttons failed", r.error);
          results.failures++;
          if (results.failures >= 3) {
            buttonsOn = false;
            await sql`UPDATE whatsapp_bot_settings SET buttons_enabled = false, auto_disabled_at = now() WHERE id = 1`.catch(() => {});
          }
          sentAll = false;
          break;
        }
        await sql`INSERT INTO whatsapp_outbound (wa_message_id, user_id, phone, task_id, kind) VALUES (${r.id}, ${u.id}, ${phoneKey}, ${t.id}, 'reminder') ON CONFLICT DO NOTHING`.catch(() => {});
        results.perTask++;
        await sleep(GAP_MS);
      }
    }
    if (sentAll) continue;

    // Digest: a numbered list, wired into the bot session so "בוצע 1 3" works.
    const lines = list.slice(0, 15).map((t, i) => `${i + 1}. ${t.priority === "urgent" ? "🔴 " : ""}${t.title} — ${dueLabel(t.due_date, now.date)}`);
    const text = `⏰ *${list.length} משימות לטיפול היום*\n\n${lines.join("\n")}\n\nכתבו *בוצע 1 3* או *דחה 2 מחר*`;
    const buttons = [{ id: "my_tasks", label: "✅ המשימות שלי" }, { id: "rem_all_tomorrow", label: "⏰ דחה הכל למחר" }];
    let r = buttonsOn
      ? await green("sendInteractiveButtonsReply", { chatId, body: text, buttons: buttons.map(b => ({ buttonId: b.id, buttonText: b.label })) })
      : { ok: false } as { ok: boolean; id?: string };
    const mode = r.ok ? "button" : "text";
    if (!r.ok) r = await green("sendMessage", { chatId, message: `${text}\n\n*1* המשימות שלי  ·  *2* דחה הכל למחר` });
    await logOut(phoneKey, text, r.id, r.ok, mode);
    if (r.ok) {
      results.digests++;
      // Only take over the session when the person isn't in the middle of something.
      await sql`INSERT INTO whatsapp_sessions (phone, user_id, state, draft, updated_at)
        VALUES (${phoneKey}, ${u.id}, 'task_list', ${JSON.stringify({ list: list.slice(0, 15).map(t => Number(t.id)), choices: buttons, digits: mode === "text" ? buttons : null })}::jsonb, now())
        ON CONFLICT (phone) DO UPDATE SET state = 'task_list', draft = whatsapp_sessions.draft || EXCLUDED.draft, updated_at = now()
        WHERE whatsapp_sessions.state IN ('', 'idle', 'welcome', 'actions', 'task_list') OR whatsapp_sessions.updated_at < now() - interval '30 minutes'`.catch(e => console.error("[wa-reminders] session", e));
    }
    await sleep(GAP_MS);
  }

  console.log("[wa-task-reminders]", JSON.stringify(results));
  return Response.json(results);
};

export const config: Config = {
  schedule: "0 6,7,8 * * *",
};
