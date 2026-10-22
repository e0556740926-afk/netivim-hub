import {
  addDays, commandOf, emptyLead, extractDate, fmtDue, keyOf, leadSummary, listOpOf, maskId, mergeLead,
  looksLikeWeekQuery, missingLeadFields, nextWeekday, normalize, parseLead, parseLeadQuery, parseTask, resolveName, resolvePerson,
  shortcutOf, statusFromWord, todayIL, TASK_STATUS_LABEL,
  type Command, type LeadDraft, type Person, type TagResolution, type TaskStatus,
} from "./parse";
import type { BotReply, Button } from "./types";

/**
 * Internal WhatsApp bot, v2 — buttons for closed choices, free text for content.
 * Spec: "אפיון בוט וואטסאפ נתיבים — גרסה 2" (claude.ai artifact 8vyVqWCdvcxeV4MiHAviBP).
 *
 * This file is the conversation only. Everything that touches the DB or the
 * network comes in through `BotDeps` (real implementation: bot-db.ts), so the
 * whole state machine runs in unit tests against in-memory fakes.
 * Replies are returned as BotReply[]; the webhook sends them.
 */

export type BotUser = { id: number; name: string; role: string; coordinator_id: number | null };
export type BotInput = { text: string; buttonId?: string | null; stanzaId?: string | null };
export type Session = { state: string; draft: Draft; updatedAt: number } | null;

export type TaskRow = { id: number; title: string; status: string; due_date: string | null; priority?: string | null; details?: string | null };
export type LeadRow = {
  id: number; name: string; phone: string; city?: string | null; created_at?: string | null; id_number?: string | null;
  sf_status?: string | null; sf_sub_status?: string | null; sf_light?: string | null; sf_advisor?: string | null;
  sf_framework?: string | null; sf_inactive_reason?: string | null; sf_updated_at?: string | null; advisor_status?: string | null;
};
export type EventRow = { name: string; date: string; time?: string | null; location?: string | null; status?: string | null; coord?: string | null };

export interface BotDeps {
  now(): Date;
  getSession(phone: string): Promise<Session>;
  setSession(phone: string, userId: number, state: string, draft: Draft): Promise<void>;
  /** Atomic state hand-off (UPDATE … WHERE state = from). False = someone else got there first. */
  claimState(phone: string, from: string, to: string): Promise<boolean>;
  people(): Promise<Person[]>;
  cities(): Promise<string[]>;
  findLeadDuplicate(user: BotUser, phone: string, idNumber: string): Promise<{ name: string; mine: boolean } | null>;
  createLead(user: BotUser, lead: LeadDraft): Promise<{ id?: number; duplicate?: { name: string; mine: boolean } }>;
  searchLeads(user: BotUser, q: { phone?: string; idNumber?: string; name?: string }): Promise<LeadRow[]>;
  openTasks(user: BotUser): Promise<TaskRow[]>;
  getTask(user: BotUser, id: number): Promise<TaskRow | null>;
  updateTask(user: BotUser, id: number, patch: { status?: TaskStatus; due_date?: string }): Promise<void>;
  createTask(user: BotUser, t: TaskDraft): Promise<{ id: number; notified: string[] }>;
  week(user: BotUser, from: string, to: string): Promise<{ events: EventRow[]; tasks: TaskRow[] }>;
  /** task id behind an outgoing reminder message (whatsapp_outbound), for taps that only carry the quoted message id */
  outboundTask(stanzaId: string): Promise<number | null>;
  notifySupport(user: BotUser, context: string): Promise<boolean>;
}

export type TaskDraft = {
  title: string;
  due: string | null;
  noDate: boolean;
  status: TaskStatus;
  urgent: boolean;
  assignees: Person[];
  unknown: string[];
  queue: TagResolution[];
};

export type Draft = {
  /** buttons of the last prompt — a tap or the typed label maps back to an id */
  choices?: Button[];
  /** choices a bare digit maps to (null when digits mean something else, e.g. a task list) */
  digits?: Button[] | null;
  lead?: LeadDraft;
  task?: TaskDraft;
  /** task ids of the last "המשימות שלי" list, so "בוצע 2" maps to a real id */
  list?: number[];
  taskId?: number;
  leadHits?: LeadRow[];
  suspended?: { state: string; lead?: LeadDraft; task?: TaskDraft };
  /** last time the bot answered "לא הבנתי" — one hint per HINT_COOLDOWN_MS, then silence */
  hintAt?: number;
};

export const DRAFT_TTL_MS = 30 * 60 * 1000;
export const RESUME_TTL_MS = 24 * 3600 * 1000;
export const WELCOME_AFTER_MS = 12 * 3600 * 1000;
export const HINT_COOLDOWN_MS = 30 * 60 * 1000;

/** "תודה", "סבבה", "🙏", ".", "חחח" — acknowledgements and chatter that need no answer. */
export function isChatter(text: string): boolean {
  const k = keyOf(text);
  if (!/\p{L}|\d/u.test(k)) return true; // only emoji / punctuation
  return /^(תודה( רבה)?|תנקס|סבבה|סבבה תודה|אחלה|יופי|מעולה|מצוין|מצויין|טוב|בסדר|אוקי|אוקיי|ok|קיבלתי|הבנתי|נהדר|כל הכבוד|ח+|ה+ה+|lol|דיי+( ח+)?|יאללה ביי|ביי|לילה טוב|שבוע טוב|שבת שלום|בהצלחה)$/u.test(k);
}

// ── buttons ───────────────────────────────────────────────────────
const B = {
  actions: { id: "actions", label: "⚡ פעולות" },
  toActions: { id: "actions", label: "⚡ לפעולות" },
  help: { id: "help", label: "❓ עזרה" },
  support: { id: "support", label: "🙋 תמיכה" },
  leadNew: { id: "lead_new", label: "📥 ליד חדש" },
  leadMore: { id: "lead_new", label: "📥 ליד נוסף" },
  leadOther: { id: "lead_new", label: "📥 ליד אחר" },
  taskNew: { id: "task_new", label: "📝 משימה חדשה" },
  taskMore: { id: "task_new", label: "📝 משימה נוספת" },
  myTasks: { id: "my_tasks", label: "✅ המשימות שלי" },
  leadStatus: { id: "lead_status", label: "🔎 סטטוס ליד" },
  leadSearchAgain: { id: "lead_status", label: "🔎 חיפוש נוסף" },
  week: { id: "week", label: "📅 השבוע שלי" },
  save: { id: "save", label: "✅ שמור" },
  edit: { id: "edit", label: "✏️ תקן" },
  cancel: { id: "cancel", label: "✖️ בטל" },
  back: { id: "back", label: "↩️ חזור" },
  saveNoId: { id: "save_no_id", label: "💾 שמור בלי ת.ז" },
  today: { id: "date_today", label: "היום" },
  tomorrow: { id: "date_tomorrow", label: "מחר" },
  noDate: { id: "date_none", label: "בלי תאריך" },
  tDone: { id: "t_done", label: "✅ בוצע" },
  tProgress: { id: "t_progress", label: "🔄 בטיפול" },
  tWaiting: { id: "t_waiting", label: "⏳ ממתין" },
  tPostpone: { id: "t_postpone", label: "⏰ דחה" },
  ppTomorrow: { id: "pp_tomorrow", label: "מחר" },
  ppSunday: { id: "pp_sunday", label: "יום ראשון" },
  ppOther: { id: "pp_other", label: "📅 תאריך אחר" },
  resume: { id: "resume", label: "▶️ המשך" },
  restart: { id: "restart", label: "🆕 התחל מחדש" },
  noTag: { id: "pick:none", label: "🚫 בלי תיוג" },
} satisfies Record<string, Button>;

/** Ids that work from any state (menu-level navigation). */
const GLOBAL_IDS = new Set(["actions", "help", "support", "menu", "lead_new", "task_new", "my_tasks", "lead_status", "week", "cancel"]);

const ACTIONS: Button[] = [B.leadNew, B.taskNew, B.myTasks, B.leadStatus, B.week, B.help];

/** States that expect free text as content (a typed "ליד" there is data, not a menu choice). */
const FREE_TEXT_STATES = new Set(["awaiting_lead", "lead_missing", "lead_edit", "awaiting_task", "task_edit", "task_need_date", "awaiting_lead_query", "task_postpone_date"]);
const LEAD_STATES = new Set(["awaiting_lead", "lead_missing", "confirm_lead", "lead_edit"]);
const TASK_STATES = new Set(["awaiting_task", "task_pick_person", "task_need_date", "confirm_task", "task_edit"]);

const firstName = (n: string) => (n || "").split(" ")[0] || n;
const label = (b: Button) => normalize(b.label);
const truncate = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join("") + "…");
const iso10 = (d: any) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);

// ── texts ─────────────────────────────────────────────────────────
export const TEXT = {
  welcome: (name: string) => [
    `שלום ${firstName(name)} 👋`,
    "הגעת לבוט של *נתיבים*.",
    "כאן מכניסים לידים, מנהלים משימות ורואים מה מחכה לך השבוע — ישר מהוואטסאפ.",
    "",
    "מה תרצה לעשות?",
  ].join("\n"),
  actions: [
    "*מה עושים?* לחצו על כפתור או כתבו מספר:",
    "",
    "1  📥 ליד חדש",
    "2  📝 משימה חדשה",
    "3  ✅ המשימות שלי",
    "4  🔎 סטטוס ליד",
    "5  📅 השבוע שלי",
    "6  ❓ עזרה",
  ].join("\n"),
  help: [
    "*איך עושים* 👇",
    "",
    "*📥 ליד חדש* — הכול בהודעה אחת:",
    "משה כהן 123456782 0521234567 בן 19 מבני ברק הערות: מעוניין בהסדר",
    "_חובה: שם, ת.ז, טלפון · רשות: עיר, גיל, הערות_",
    "",
    "*📝 משימה חדשה*",
    "להתקשר לרב כהן @חיים עד יום שלישי דחוף",
    "_תאריכים: היום, מחר, יום ראשון, שבוע הבא, 25.11_",
    "",
    "*✅ המשימות שלי* — רשימה ממוספרת. כתבו מספר כדי לעדכן, או *בוצע 1 3*",
    "",
    "*🔎 סטטוס ליד* — לפי טלפון, ת.ז או שם",
    "",
    "*📅 השבוע שלי* — אירועים ומשימות ל-7 ימים",
    "",
    "בכל שלב: *תפריט* · *ביטול* · *עזרה*",
  ].join("\n"),
  leadTemplate: [
    "📥 *ליד חדש*",
    "שלחו בהודעה אחת:",
    "*חובה:* שם · ת.ז · טלפון",
    "*רשות:* עיר · גיל · הערות",
    "",
    "לדוגמה:",
    "משה כהן 123456782 0521234567 בן 19 מבני ברק הערות: מעוניין בהסדר",
  ].join("\n"),
  taskTemplate: [
    "📝 *משימה חדשה*",
    "שלחו בהודעה אחת:",
    "*חובה:* מה צריך לעשות",
    "*רשות:* @תיוג · תאריך יעד · סטטוס · דחוף",
    "",
    "לדוגמה:",
    "להתקשר לרב כהן מישיבת מאור @חיים עד יום שלישי דחוף",
  ].join("\n"),
  leadQuery: "🔎 *סטטוס ליד*\nשלחו טלפון, ת.ז או שם של הליד.",
};

const FIELD_HE: Record<string, string> = { name: "שם", idNumber: "ת.ז", phone: "טלפון" };

function heList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("")
  return `${xs.slice(0, -1).join(", ")} ו${xs[xs.length - 1]}`
}

// ── the conversation ──────────────────────────────────────────────

export async function handleMessage(deps: BotDeps, user: BotUser, phone: string, input: BotInput): Promise<BotReply[]> {
  const now = deps.now();
  const today = todayIL(now);
  const sess = await deps.getSession(phone);
  const age = sess ? now.getTime() - sess.updatedAt : Infinity;
  const fresh = age < DRAFT_TTL_MS;
  let state = sess?.state || "idle";
  let draft: Draft = { ...(sess?.draft || {}) };
  const replies: BotReply[] = [];
  const text = String(input.text || "");
  const isCoord = user.role === "coordinator" && !!user.coordinator_id;

  // ── helpers bound to this turn ──
  const say = (r: BotReply) => { replies.push(r); };
  /** Ends the turn on a prompt: sets the next state and which taps/digits it accepts. */
  const ask = (next: string, r: BotReply, digits: Button[] | null = r.numbered ? null : (r.buttons || null)) => {
    state = next;
    draft.choices = r.buttons || [];
    draft.digits = digits;
    replies.push(r);
  };
  const finish = async () => {
    // "saving" means another request holds the save — leave its session alone.
    if (state !== "saving") await deps.setSession(phone, user.id, state, draft);
    return replies;
  };
  const clearFlow = () => { delete draft.lead; delete draft.task; delete draft.taskId; delete draft.leadHits; };

  const welcome = () => {
    const sus = draft.suspended;
    const extra = sus ? `\n\nיש לך ${sus.lead ? `ליד פתוח${sus.lead.name ? ` (${sus.lead.name})` : ""}` : `משימה פתוחה${sus.task?.title ? ` (${truncate(sus.task.title, 30)})` : ""}`} — *המשך* כדי לחזור אליו.` : "";
    ask("welcome", { text: TEXT.welcome(user.name) + extra, buttons: sus ? [B.actions, B.help, B.resume] : [B.actions, B.help] });
  };
  const actionsMenu = () => ask("actions", { text: TEXT.actions, buttons: [B.leadNew, B.taskNew, B.myTasks], numbered: true }, ACTIONS);
  const suspendFlow = () => {
    if (LEAD_STATES.has(state) && draft.lead) draft.suspended = { state, lead: draft.lead };
    else if (TASK_STATES.has(state) && draft.task) draft.suspended = { state, task: draft.task };
    clearFlow();
  };

  // ── 1. which button / choice is this? ──
  const choices = fresh || state === "welcome" || state === "actions" ? draft.choices || [] : [];
  let choice: string | null = null;
  if (input.buttonId) {
    choice = String(input.buttonId);
    // Some clients report the button's position ("1") or drop our id — fall back to the label / index.
    const known = GLOBAL_IDS.has(choice) || choices.some(b => b.id === choice) || /^rem_/.test(choice);
    if (!known) {
      const byLabel = choices.find(b => keyOf(b.label) === keyOf(text));
      const byIndex = /^\d$/.test(choice) ? choices[Number(choice) - 1] : undefined;
      if (byLabel || byIndex) choice = (byLabel || byIndex)!.id;
    }
  } else {
    const k = keyOf(text);
    const byLabel = choices.find(b => keyOf(b.label) === k);
    if (byLabel) choice = byLabel.id;
    else if (/^\d$/.test(k) && draft.digits?.length && (fresh || state === "actions")) {
      const b = draft.digits[Number(k) - 1];
      if (b) choice = b.id;
    }
  }

  // ── 2. reminder taps (valid in any state) ──
  let rem = choice?.match(/^rem_(done|tomorrow|other):(\d+)$/) || null;
  if (!rem && input.stanzaId && !choice?.startsWith("rem_")) {
    const tid = await deps.outboundTask(input.stanzaId);
    if (tid) {
      const c = commandOf(text);
      const kind = c === "t_done" ? "done" : c === "date_tomorrow" || c === "pp_tomorrow" ? "tomorrow" : c === "pp_other" ? "other" : null;
      if (kind) rem = [`rem_${kind}:${tid}`, kind, String(tid)] as any;
    }
  }
  if (rem) {
    const [, kind, idStr] = rem;
    const t = await deps.getTask(user, Number(idStr));
    if (!t) { say({ text: "המשימה הזו כבר לא משויכת אליך או נמחקה." }); return finish(); }
    if (t.status === "done" && kind === "done") { say({ text: `המשימה כבר מסומנת כבוצעה ✅\n${t.title}` }); return finish(); }
    if (kind === "done") { await deps.updateTask(user, t.id, { status: "done" }); say({ text: `✅ סומן כבוצע: ${t.title}` }); return finish(); }
    if (kind === "tomorrow") { const d = addDays(today, 1); await deps.updateTask(user, t.id, { due_date: d }); say({ text: `⏰ נדחה למחר: ${t.title}` }); return finish(); }
    clearFlow();
    draft.taskId = t.id;
    ask("task_postpone_date", { text: `לאיזה תאריך לדחות את *${t.title}*?\nכתבו למשל *יום שלישי*, *25.11* או *בעוד 3 ימים*.`, buttons: [B.cancel] });
    return finish();
  }
  if (choice === "rem_all_tomorrow") {
    const ids = draft.list || [];
    let n = 0;
    for (const id of ids) {
      const t = await deps.getTask(user, id);
      if (t && t.status !== "done") { await deps.updateTask(user, id, { due_date: addDays(today, 1) }); n++; }
    }
    say({ text: n ? `⏰ ${n} משימות נדחו למחר.` : "אין משימות פתוחות לדחייה." });
    return finish();
  }

  // ── 3. stale button: a tap on a prompt that's no longer current ──
  if (input.buttonId && !GLOBAL_IDS.has(choice!) && !choices.some(b => b.id === choice)) {
    say({ text: "הכפתור הזה כבר לא פעיל 🙂" });
    welcome();
    return finish();
  }

  // ── 4. expired flow → offer to resume ──
  if (!fresh && sess && (LEAD_STATES.has(state) || TASK_STATES.has(state)) && (draft.lead || draft.task)) {
    const cmd = choice || commandOf(text);
    if (age < RESUME_TTL_MS && !shortcutOf(text) && !cmd) {
      suspendFlow();
      const sus = draft.suspended!;
      const what = sus.lead ? `ליד פתוח${sus.lead.name ? ` (${sus.lead.name})` : ""}` : `משימה פתוחה${sus.task?.title ? ` (${truncate(sus.task.title, 30)})` : ""}`;
      ask("resume_offer", { text: `היה לך ${what} — להמשיך מאיפה שעצרנו?`, buttons: [B.resume, B.restart, B.cancel] });
      return finish();
    }
    if (age >= RESUME_TTL_MS) delete draft.suspended;
    suspendFlow();
    state = "idle";
  }
  if (!fresh && !["idle", "welcome", "actions", "resume_offer"].includes(state)) { clearFlow(); state = "idle"; }

  let cmd: Command | string | null = choice || (FREE_TEXT_STATES.has(state) ? freeTextCommand(text) : commandOf(text));
  if (!cmd && ["idle", "welcome", "actions", "task_list", "resume_offer"].includes(state) && looksLikeWeekQuery(text)) cmd = "week";

  // ── 5. global commands ──
  if (cmd === "cancel") {
    const had = !!(draft.lead || draft.task || draft.taskId || draft.suspended);
    clearFlow(); delete draft.suspended;
    ask("idle", { text: had ? "בוטל ✋ לא נשמר כלום." : "אין כרגע משהו לבטל 🙂", buttons: [B.actions, B.help] });
    return finish();
  }
  if (cmd === "menu") { suspendFlow(); welcome(); return finish(); }
  if (cmd === "help") { suspendFlow(); ask("idle", { text: TEXT.help, buttons: [B.toActions, B.support] }); return finish(); }
  if (cmd === "actions") { suspendFlow(); actionsMenu(); return finish(); }
  if (cmd === "support") {
    const ok = await deps.notifySupport(user, describeContext(state, draft));
    ask("idle", { text: ok ? "שלחתי לאלעזר שביקשת עזרה 🙏\nהוא יחזור אליך בהקדם." : "לא הצלחתי להעביר את הבקשה כרגע. נסו שוב בעוד רגע.", buttons: [B.actions] });
    return finish();
  }
  if (cmd === "resume" || cmd === "restart") {
    const sus = draft.suspended;
    delete draft.suspended;
    if (!sus) { welcome(); return finish(); }
    if (cmd === "restart") {
      if (sus.lead) { draft.lead = emptyLead(); ask("awaiting_lead", { text: TEXT.leadTemplate, buttons: [B.cancel] }); }
      else { delete draft.task; ask("awaiting_task", { text: TEXT.taskTemplate, buttons: [B.cancel] }); }
      return finish();
    }
    if (sus.lead) { draft.lead = sus.lead; await evaluateLead(sus.state === "confirm_lead"); }
    else if (sus.task) { draft.task = sus.task; advanceTask(); }
    return finish();
  }

  // ── 6. list shortcuts: "בוצע 1 3", "דחה 2 ליום ראשון" ──
  if (!FREE_TEXT_STATES.has(state) && !choice) {
    const op = listOpOf(text, today);
    if (op) { await applyListOp(op); return finish(); }
  }

  // ── 7. typed shortcuts with content: "ליד: …", "משימה: …", "סטטוס …" ──
  if (!choice) {
    const sc = shortcutOf(text);
    // In free-text states only the explicit "ליד:" / "משימה:" form switches flows — anything else is content.
    const explicit = /^\s*(?:ליד|משימה)(?:\s+חדשה?)?\s*:/u.test(text);
    if (sc && (!FREE_TEXT_STATES.has(state) || explicit)) {
      suspendFlow(); delete draft.suspended;
      if (sc.kind === "lead") { await leadText(sc.body, emptyLead(), false); return finish(); }
      if (sc.kind === "task") { await taskText(sc.body); return finish(); }
      await leadQuery(sc.body); return finish();
    }
  }

  // ── 8. menu actions ──
  if (cmd === "lead_new") { suspendFlow(); delete draft.suspended; draft.lead = emptyLead(); ask("awaiting_lead", { text: TEXT.leadTemplate, buttons: [B.cancel] }); return finish(); }
  if (cmd === "task_new") { suspendFlow(); delete draft.suspended; ask("awaiting_task", { text: TEXT.taskTemplate, buttons: [B.cancel] }); return finish(); }
  if (cmd === "my_tasks") { clearFlow(); await showTasks(); return finish(); }
  if (cmd === "lead_status") { clearFlow(); ask("awaiting_lead_query", { text: TEXT.leadQuery, buttons: [B.cancel] }); return finish(); }
  if (cmd === "week") { clearFlow(); await showWeek(); return finish(); }

  // ── 9. state-specific handling ──
  switch (state) {
    case "awaiting_lead":
      await leadText(text, draft.lead || emptyLead(), false);
      return finish();

    case "lead_missing":
      if (cmd === "save_no_id") {
        const l = draft.lead;
        if (!l || missingLeadFields(l).some(f => f !== "idNumber")) { await evaluateLead(false); return finish(); }
        await saveLead("lead_missing");
        return finish();
      }
      await leadText(text, draft.lead || emptyLead(), false);
      return finish();

    case "confirm_lead":
      if (cmd === "save") { await saveLead("confirm_lead"); return finish(); }
      if (cmd === "edit") {
        ask("lead_edit", { text: "מה לתקן?\nכתבו למשל *עיר: אלעד* או *ת.ז: 123456782* — אפשר כמה שורות.\nאו שלחו את כל הפרטים מחדש.", buttons: [B.back, B.cancel] });
        return finish();
      }
      // free text here is treated as a correction
      await leadText(text, draft.lead || emptyLead(), true);
      return finish();

    case "lead_edit":
      if (cmd === "back") { await evaluateLead(true); return finish(); }
      await leadText(text, draft.lead || emptyLead(), true);
      return finish();

    case "awaiting_task":
      await taskText(text);
      return finish();

    case "task_pick_person": {
      const t = draft.task;
      if (!t) { welcome(); return finish(); }
      const head = t.queue[0];
      let picked: Person | null | undefined;
      if (cmd?.startsWith("pick:")) {
        const id = cmd.slice(5);
        picked = id === "none" ? null : (head?.kind === "ambiguous" ? head.options : head?.kind === "suggest" ? [head.person] : []).find(p => String(p.id) === id);
      } else if (cmd === "save") picked = head?.kind === "suggest" ? head.person : undefined;
      else if (head) {
        const r = resolveName(text, head.kind === "ambiguous" ? head.options : await deps.people());
        if (r.kind === "match") picked = r.person;
      }
      if (picked === undefined) { advanceTask("לא זיהיתי — בחרו מהכפתורים או כתבו שם מלא."); return finish(); }
      t.queue.shift();
      if (picked && !t.assignees.some(a => a.id === picked!.id)) t.assignees.push(picked);
      advanceTask();
      return finish();
    }

    case "task_need_date": {
      const t = draft.task;
      if (!t) { welcome(); return finish(); }
      if (cmd === "date_today") t.due = today;
      else if (cmd === "date_tomorrow") t.due = addDays(today, 1);
      else if (cmd === "date_none") t.noDate = true;
      else {
        const d = extractDate(text, today);
        if (!d.found) { advanceTask("לא זיהיתי תאריך. כתבו למשל *יום שלישי* או *25.11*, או לחצו על כפתור."); return finish(); }
        t.due = d.due;
      }
      advanceTask();
      return finish();
    }

    case "confirm_task":
      if (cmd === "save") { await saveTask(); return finish(); }
      if (cmd === "edit") {
        ask("task_edit", { text: "מה לתקן? למשל:\n*תאריך: מחר* · *תיוג: שלמה* · *סטטוס: בטיפול* · *כותרת: …*\nאו שלחו את המשימה מחדש.", buttons: [B.back, B.cancel] });
        return finish();
      }
      await taskEdit(text);
      return finish();

    case "task_edit":
      if (cmd === "back") { advanceTask(); return finish(); }
      await taskEdit(text);
      return finish();

    case "task_list": {
      const k = keyOf(text);
      if (/^\d{1,2}$/.test(k)) { await openCard(Number(k)); return finish(); }
      break;
    }

    case "task_card": {
      const id = draft.taskId;
      if (!id) break;
      if (cmd === "t_done" || cmd === "t_progress" || cmd === "t_waiting") {
        const status: TaskStatus = cmd === "t_done" ? "done" : cmd === "t_progress" ? "inprogress" : "waiting";
        const t = await deps.getTask(user, id);
        if (!t) { say({ text: "המשימה הזו כבר לא משויכת אליך." }); await showTasks(); return finish(); }
        await deps.updateTask(user, id, { status });
        say({ text: status === "done" ? `✅ סומן כבוצע: ${t.title}` : `🔄 ${t.title} — ${TASK_STATUS_LABEL[status]}` });
        delete draft.taskId;
        await showTasks();
        return finish();
      }
      if (cmd === "t_postpone") {
        ask("task_postpone", { text: "לאן לדחות?", buttons: [B.ppTomorrow, B.ppSunday, B.ppOther] });
        return finish();
      }
      const k = keyOf(text);
      if (/^\d{1,2}$/.test(k)) { await openCard(Number(k)); return finish(); }
      break;
    }

    case "task_postpone":
    case "task_postpone_date": {
      const id = draft.taskId;
      if (!id) break;
      let due: string | null = null;
      if (cmd === "pp_tomorrow" || cmd === "date_tomorrow") due = addDays(today, 1);
      else if (cmd === "pp_sunday") due = nextWeekday(today, 0);
      else if (cmd === "pp_other") {
        ask("task_postpone_date", { text: "כתבו תאריך — למשל *יום שלישי*, *25.11* או *בעוד 3 ימים*.", buttons: [B.cancel] });
        return finish();
      } else {
        const d = extractDate(text, today);
        if (d.found) due = d.due;
      }
      if (!due) {
        ask(state, { text: "לא זיהיתי תאריך. כתבו למשל *יום שלישי* או *25.11*.", buttons: state === "task_postpone" ? [B.ppTomorrow, B.ppSunday, B.ppOther] : [B.cancel] });
        return finish();
      }
      const t = await deps.getTask(user, id);
      if (!t) { say({ text: "המשימה הזו כבר לא משויכת אליך." }); delete draft.taskId; state = "idle"; return finish(); }
      await deps.updateTask(user, id, { due_date: due });
      say({ text: `📅 נדחה ל${fmtDue(due, today)}: ${t.title}` });
      delete draft.taskId;
      if (draft.list?.length) await showTasks(); else state = "idle";
      return finish();
    }

    case "awaiting_lead_query":
      await leadQuery(text);
      return finish();

    case "lead_pick": {
      const k = keyOf(text);
      const hit = /^\d$/.test(k) ? draft.leadHits?.[Number(k) - 1] : undefined;
      if (hit) {
        delete draft.leadHits;
        ask("idle", { text: leadCard(hit, today), buttons: [B.leadSearchAgain, B.actions] });
        return finish();
      }
      await leadQuery(text);
      return finish();
    }
  }

  // ── 10. nothing matched ──
  // A message with a mobile number in it is almost always a lead — take it as one.
  if (/(?:\+?972[-\s]?|0)5\d(?:[-\s]?\d){7}/.test(text) && /\p{L}{2,}/u.test(text)) {
    await leadText(text, emptyLead(), false);
    return finish();
  }
  const greeted = sess && age < WELCOME_AFTER_MS && ["welcome", "idle", "actions", "task_list"].includes(sess.state);
  // Chatter ("תודה", "🙏", ".") and repeated misses get silence, not a hint per message:
  // people also forward voice notes, photos and side remarks — one nudge is enough.
  if (greeted && isChatter(text)) return finish();
  if (greeted && draft.hintAt && now.getTime() - draft.hintAt < HINT_COOLDOWN_MS) return finish();
  if (!greeted) { if (isChatter(text) && sess) return finish(); welcome(); return finish(); }
  draft.hintAt = now.getTime();
  ask(state === "actions" ? "actions" : "idle", {
    text: state === "actions" ? "לא הבנתי 🙂 כתבו מספר מ-1 עד 6, או לחצו על כפתור." : "לא הבנתי 🙂\nלחצו על *פעולות*, או כתבו מה תרצו — ליד, משימה, יומן.",
    buttons: state === "actions" ? [B.leadNew, B.taskNew, B.myTasks] : [B.actions, B.help],
    numbered: state === "actions",
  }, state === "actions" ? ACTIONS : undefined);
  return finish();

  // ════ flows (function declarations — hoisted, share this turn's state) ════

  async function leadText(raw: string, base: LeadDraft, override: boolean) {
    const p = parseLead(raw, await deps.cities());
    const lead = override
      ? mergeLead(base, { ...p, labeled: (Object.keys(p.lead) as (keyof LeadDraft)[]).filter(f => p.lead[f] !== null && p.lead[f] !== "") })
      : mergeLead(base, p);
    const errors: string[] = [];
    if (p.invalid.idNumber) { errors.push(`⚠️ הת.ז ${p.invalid.idNumber} לא תקינה (ספרת ביקורת שגויה).`); if (!p.lead.idNumber) lead.idNumber = base.idNumber && !override ? base.idNumber : ""; }
    if (p.invalid.phone) errors.push(`⚠️ "${p.invalid.phone}" הוא לא נייד — צריך מספר שמתחיל ב-05.`);
    if (p.invalid.age) errors.push(`⚠️ הגיל "${p.invalid.age}" לא נראה תקין, לא נשמר.`);
    draft.lead = lead;
    await evaluateLead(false, errors);
  }

  /** Decides the next lead step: ask for what's missing, warn on duplicate, or confirm. */
  async function evaluateLead(_fromConfirm: boolean, errors: string[] = []) {
    const lead = draft.lead || emptyLead();
    const missing = missingLeadFields(lead);
    const head = errors.length ? errors.join("\n") + "\n\n" : "";
    const hard = missing.filter(f => f !== "idNumber");
    if (hard.length) {
      const got = (["name", "idNumber", "phone"] as const).filter(f => !missing.includes(f)).map(f => FIELD_HE[f]);
      const need = hard.map(f => FIELD_HE[f]);
      const idNote = missing.includes("idNumber") ? "\n_ת.ז — אם יש, אפשר לשלוח יחד._" : "";
      ask("lead_missing", {
        text: `${head}${got.length ? `קיבלתי ${heList(got)} ✅\n` : ""}חסר: *${heList(need)}* — שלחו ${need.length > 1 ? "אותם" : "רק אותו"}.${idNote}`,
        buttons: [B.cancel],
      });
      return;
    }
    if (missing.includes("idNumber")) {
      ask("lead_missing", {
        text: `${head}קיבלתי שם וטלפון ✅\nחסרה *ת.ז* — שלחו אותה, או שמרו בלי ת.ז.`,
        buttons: [B.saveNoId, B.cancel],
      });
      return;
    }
    const dup = await deps.findLeadDuplicate(user, lead.phone, lead.idNumber);
    if (dup) {
      delete draft.lead;
      ask("idle", {
        text: `${head}⚠️ הליד כבר קיים במערכת${dup.mine ? ` (${dup.name})` : " (אצל רכז אחר)"} — לא נשמר שוב.`,
        buttons: [B.leadOther, B.actions],
      });
      return;
    }
    ask("confirm_lead", {
      text: `${head}*ליד חדש — לאשר?*\n\n${leadSummary(lead)}\n\n_אחרי השמירה הליד יישלח לסילפורס._`,
      buttons: [B.save, B.edit, B.cancel],
    });
  }

  async function saveLead(from: string) {
    const lead = draft.lead;
    if (!lead) { welcome(); return; }
    if (from === "lead_missing") {
      const dup = await deps.findLeadDuplicate(user, lead.phone, "");
      if (dup) {
        delete draft.lead;
        ask("idle", { text: `⚠️ הליד כבר קיים במערכת${dup.mine ? ` (${dup.name})` : " (אצל רכז אחר)"} — לא נשמר שוב.`, buttons: [B.leadOther, B.actions] });
        return;
      }
    }
    if (!(await deps.claimState(phone, from, "saving"))) { say({ text: "השמירה כבר בתהליך ⏳" }); state = "saving"; return; }
    try {
      const r = await deps.createLead(user, lead);
      delete draft.lead;
      if (r.duplicate) {
        ask("idle", { text: `⚠️ הליד כבר קיים במערכת${r.duplicate.mine ? ` (${r.duplicate.name})` : " (אצל רכז אחר)"} — לא נשמר שוב.`, buttons: [B.leadOther, B.actions] });
        return;
      }
      ask("idle", {
        text: `✅ הליד נשמר ונשלח לסילפורס\n${lead.name} · ${lead.phone}${lead.idNumber ? "" : "\n_נשמר בלי ת.ז_"}`,
        buttons: [B.leadMore, B.actions],
      });
    } catch (e) {
      console.error("[wa-bot] createLead failed", e);
      draft.lead = lead;
      ask(from, { text: "משהו השתבש בשמירה 😕 הפרטים שמורים — נסו שוב.", buttons: from === "confirm_lead" ? [B.save, B.edit, B.cancel] : [B.saveNoId, B.cancel] });
    }
  }

  async function taskText(raw: string) {
    const people = await deps.people();
    const p = parseTask(raw, today, people.map(x => x.name));
    if (!p.title) {
      ask("awaiting_task", { text: "מה המשימה? כתבו מה צריך לעשות, למשל:\n*להתקשר לרב כהן מחר*", buttons: [B.cancel] });
      return;
    }
    const t: TaskDraft = {
      title: p.title, due: p.due, noDate: p.noDate, status: p.status || "todo", urgent: p.urgent,
      assignees: [], unknown: [], queue: [],
    };
    queueTags(t, p.tags.map(x => resolvePerson(x.first, x.second, people)).concat(p.tagNames.map(n => resolveName(n, people))));
    draft.task = t;
    advanceTask();
  }

  function queueTags(t: TaskDraft, res: TagResolution[]) {
    for (const r of res) {
      if (r.kind === "match") { if (!t.assignees.some(a => a.id === r.person.id)) t.assignees.push(r.person); }
      else if (r.kind === "none") t.unknown.push(r.token);
      else t.queue.push(r);
    }
  }

  /** Next task step: resolve tags → ask for a date → confirm. */
  function advanceTask(note = "") {
    const t = draft.task;
    if (!t) { welcome(); return; }
    const pre = note ? note + "\n\n" : "";
    const head = t.queue[0];
    if (head?.kind === "ambiguous") {
      const opts = head.options.slice(0, 9);
      if (opts.length <= 2) {
        ask("task_pick_person", { text: `${pre}יש כמה *${head.token}* — למי התכוונת?`, buttons: [...opts.map(o => ({ id: `pick:${o.id}`, label: truncate(o.name, 25) })), B.noTag] });
      } else {
        const digits = [...opts.map(o => ({ id: `pick:${o.id}`, label: o.name })), B.noTag];
        ask("task_pick_person", {
          text: `${pre}יש כמה *${head.token}* — כתבו מספר:\n\n${digits.map((o, i) => `${i + 1}  ${normalize(o.label)}`).join("\n")}`,
          buttons: [B.noTag], numbered: true,
        }, digits);
      }
      return;
    }
    if (head?.kind === "suggest") {
      ask("task_pick_person", {
        text: `${pre}לא מצאתי *@${head.token}*. התכוונת ל*${head.person.name}*?`,
        buttons: [{ id: `pick:${head.person.id}`, label: truncate(`✅ ${head.person.name}`, 25) }, B.noTag],
      });
      return;
    }
    if (!t.due && !t.noDate) {
      ask("task_need_date", { text: `${pre}📝 ${t.title}\n\nעד מתי?`, buttons: [B.today, B.tomorrow, B.noDate] });
      return;
    }
    const who = t.assignees.length ? t.assignees.map(a => a.id === user.id ? `${a.name} (אני)` : a.name).join(", ") : `${user.name} (אני)`;
    ask("confirm_task", {
      text: [
        `${pre}*משימה חדשה — לאשר?*`,
        "",
        `📝 ${t.title}`,
        `👥 ${who}`,
        `📅 ${fmtDue(t.due, today)}`,
        `${t.urgent ? "🔴 דחוף · " : ""}סטטוס: ${TASK_STATUS_LABEL[t.status]}`,
        t.unknown.length ? `⚠️ לא נמצא במערכת: ${t.unknown.map(u => "@" + u).join(", ")}` : null,
      ].filter(x => x !== null).join("\n"),
      buttons: [B.save, B.edit, B.cancel],
    });
  }

  async function taskEdit(raw: string) {
    const t = draft.task;
    if (!t) { await taskText(raw); return; }
    const lines = raw.split("\n").map(normalize).filter(Boolean);
    const labeled = lines.filter(l => /^(כותרת|תיוג|מתויגים|תאריך|יעד|סטטוס|דחיפות)\s*[:\-–]/u.test(l));
    if (!labeled.length) {
      // a bare date / status word is a quick fix too
      const d = extractDate(normalize(raw), today);
      if (d.found && d.rest.length === 0) { t.due = d.due; t.noDate = false; advanceTask(); return; }
      const st = statusFromWord(raw);
      if (st) { t.status = st; advanceTask(); return; }
      await taskText(raw);
      return;
    }
    const people = await deps.people();
    for (const l of labeled) {
      const m = l.match(/^(כותרת|תיוג|מתויגים|תאריך|יעד|סטטוס|דחיפות)\s*[:\-–]\s*(.*)$/u)!;
      const [, k, v] = m;
      if (k === "כותרת" && v) t.title = v.slice(0, 200);
      else if (k === "תיוג" || k === "מתויגים") {
        t.assignees = []; t.unknown = []; t.queue = [];
        if (!/^(בלי|ללא|אני)$/u.test(v)) queueTags(t, v.split(/[,،]/).map(s => s.replace(/^@/, "").trim()).filter(Boolean).map(n => resolveName(n, people)));
      } else if (k === "תאריך" || k === "יעד") {
        if (/בלי|ללא/u.test(v)) { t.due = null; t.noDate = true; }
        else { const d = extractDate(v, today); if (d.found) { t.due = d.due; t.noDate = false; } }
      } else if (k === "סטטוס") { const st = statusFromWord(v); if (st) t.status = st; }
      else if (k === "דחיפות") t.urgent = /דחוף|גבוה|כן/u.test(v);
    }
    advanceTask();
  }

  async function saveTask() {
    const t = draft.task;
    if (!t) { welcome(); return; }
    if (!(await deps.claimState(phone, "confirm_task", "saving"))) { say({ text: "השמירה כבר בתהליך ⏳" }); state = "saving"; return; }
    try {
      const r = await deps.createTask(user, t);
      delete draft.task;
      ask("idle", {
        text: `✅ המשימה נשמרה\n${t.title} · ${fmtDue(t.due, today)}${r.notified.length ? `\n👥 נשלחה התראה ל${heList(r.notified)}` : ""}`,
        buttons: [B.taskMore, B.myTasks],
      });
    } catch (e) {
      console.error("[wa-bot] createTask failed", e);
      ask("confirm_task", { text: "משהו השתבש בשמירה 😕 המשימה שמורה כטיוטה — נסו שוב.", buttons: [B.save, B.edit, B.cancel] });
    }
  }

  async function showTasks() {
    const list = (await deps.openTasks(user)).slice(0, 10);
    draft.list = list.map(t => Number(t.id));
    delete draft.taskId;
    if (!list.length) { ask("idle", { text: "אין משימות פתוחות 🎉", buttons: [B.taskNew, B.actions] }); return; }
    const lines = list.map((t, i) => {
      const due = iso10(t.due_date);
      const late = due && due < today;
      return `${i + 1}. ${t.priority === "urgent" ? "🔴 " : ""}${t.title} — ${fmtDue(due, today)}${late ? " ⚠️" : ""}${t.status === "inprogress" || t.status === "waiting" ? ` _(${TASK_STATUS_LABEL[t.status as TaskStatus]})_` : ""}`;
    });
    ask("task_list", {
      text: [`*המשימות הפתוחות שלך* (${list.length})`, "", ...lines, "", "כתבו מספר כדי לעדכן משימה · או *בוצע 1 3*"].join("\n"),
      buttons: [B.taskNew, B.actions], numbered: true,
    }, null);
  }

  async function openCard(n: number) {
    const id = draft.list?.[n - 1];
    if (!id) { say({ text: "אין משימה במספר הזה." }); await showTasks(); return; }
    const t = await deps.getTask(user, id);
    if (!t) { say({ text: "המשימה הזו כבר לא משויכת אליך." }); await showTasks(); return; }
    draft.taskId = t.id;
    const due = iso10(t.due_date);
    ask("task_card", {
      text: [
        `*${t.title}*`,
        `📅 ${fmtDue(due, today)}${due && due < today ? " ⚠️ באיחור" : ""}`,
        `${t.priority === "urgent" ? "🔴 דחוף · " : ""}סטטוס: ${TASK_STATUS_LABEL[(t.status as TaskStatus)] || t.status}`,
        t.details && !/^נוצר מוואטסאפ/u.test(t.details) ? `_${truncate(t.details, 200)}_` : "",
      ].filter(Boolean).join("\n"),
      buttons: [B.tDone, t.status === "inprogress" ? B.tWaiting : B.tProgress, B.tPostpone],
    });
  }

  async function applyListOp(op: NonNullable<ReturnType<typeof listOpOf>>) {
    const ids = draft.list || [];
    if (!ids.length) { say({ text: "קודם צריך לפתוח את הרשימה." }); await showTasks(); return; }
    const done: string[] = [], missing: number[] = [];
    for (const n of op.indexes) {
      const id = ids[n - 1];
      const t = id ? await deps.getTask(user, id) : null;
      if (!t) { missing.push(n); continue; }
      if (op.op === "status") await deps.updateTask(user, t.id, { status: op.status });
      else await deps.updateTask(user, t.id, { due_date: op.due });
      done.push(t.title);
    }
    const verb = op.op === "status" ? (op.status === "done" ? "✅ סומן כבוצע" : `🔄 ${TASK_STATUS_LABEL[op.status]}`) : `📅 נדחה ל${fmtDue(op.due, today)}`;
    say({ text: [done.length ? `${verb}:\n${done.map(d => "• " + d).join("\n")}` : "", missing.length ? `לא מצאתי את ${missing.join(", ")} ברשימה.` : ""].filter(Boolean).join("\n\n") });
    await showTasks();
  }

  async function showWeek() {
    const end = addDays(today, 7);
    const { events, tasks } = await deps.week(user, today, end);
    const late = tasks.filter(t => { const d = iso10(t.due_date); return d && d < today; });
    const days = new Map<string, string[]>();
    const push = (d: string, line: string) => { if (!days.has(d)) days.set(d, []); days.get(d)!.push(line); };
    const EVENT_STATUS: Record<string, string> = { pending_approval: "ממתין לאישור", planning: "בתכנון" };
    for (const e of events) {
      const d = iso10(e.date)!;
      push(d, `• ${e.time ? e.time.slice(0, 5) + " " : ""}${e.name}${e.location ? " · " + e.location : ""}${e.coord ? " · " + e.coord : ""}${e.status && EVENT_STATUS[e.status] ? ` _(${EVENT_STATUS[e.status]})_` : ""}`);
    }
    for (const t of tasks) {
      const d = iso10(t.due_date);
      if (!d || d < today) continue;
      push(d, `• ${t.priority === "urgent" ? "🔴 " : "📝 "}${t.title}`);
    }
    const out: string[] = ["*📅 השבוע שלך*"];
    if (late.length) out.push("", `*באיחור* (${late.length})`, ...late.map(t => `• ⚠️ ${t.title}`));
    for (const d of [...days.keys()].sort()) out.push("", `*${fmtDue(d, today)}*`, ...days.get(d)!);
    if (out.length === 1) out.push("", "אין אירועים או משימות ב-7 הימים הקרובים 🙂");
    ask("idle", { text: out.join("\n"), buttons: [B.myTasks, B.actions] });
  }

  async function leadQuery(raw: string) {
    const q = parseLeadQuery(raw);
    if (!q.phone && !q.idNumber && !q.name) {
      ask("awaiting_lead_query", { text: "שלחו טלפון, ת.ז או שם (לפחות 2 אותיות).", buttons: [B.cancel] });
      return;
    }
    const hits = await deps.searchLeads(user, q);
    const what = q.phone ? `עם המספר ${q.phone}` : q.idNumber ? `עם הת.ז ${maskId(q.idNumber)}` : `בשם "${q.name}"`;
    if (!hits.length) {
      ask("idle", { text: `לא מצאתי ליד ${what}${isCoord ? " בלידים שלך" : ""}.`, buttons: [B.leadSearchAgain, B.actions] });
      return;
    }
    if (hits.length <= 3) {
      ask("idle", { text: hits.map(h => leadCard(h, today)).join("\n\n"), buttons: [B.leadSearchAgain, B.actions] });
      return;
    }
    const top = hits.slice(0, 9);
    draft.leadHits = top.map(h => ({ ...h }));
    ask("lead_pick", {
      text: `מצאתי ${hits.length} לידים ${what}. כתבו מספר:\n\n${top.map((h, i) => `${i + 1}  ${h.name} · ${h.phone}${h.city ? " · " + h.city : ""}`).join("\n")}${hits.length > 9 ? "\n\n_חפשו לפי טלפון לדיוק_" : ""}`,
      buttons: [B.leadSearchAgain, B.actions], numbered: true,
    }, null);
  }
}

/** In free-text states only navigation words count; anything else is content. */
function freeTextCommand(text: string): Command | null {
  const c = commandOf(text);
  return c && ["menu", "help", "actions", "cancel", "back", "support", "save_no_id", "date_today", "date_tomorrow", "date_none", "pp_other"].includes(c) ? c : null;
}

function describeContext(state: string, draft: Draft): string {
  if (draft.lead) return `באמצע הזנת ליד${draft.lead.name ? ` (${draft.lead.name})` : ""}`;
  if (draft.task) return `באמצע יצירת משימה (${truncate(draft.task.title, 40)})`;
  return state && state !== "idle" ? `מצב: ${state}` : "";
}

export function leadCard(r: LeadRow, today = todayIL()): string {
  const light: Record<string, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
  const created = iso10(r.created_at);
  const lines = [
    `*${r.name}* · ${r.phone}${r.city ? " · " + r.city : ""}`,
    `נקלט: ${created ? fmtDue(created, today) : "—"}${r.id_number ? ` · ת.ז ${maskId(String(r.id_number))}` : ""}`,
  ];
  if (r.sf_status || r.sf_sub_status) {
    lines.push(`סילפורס: ${[r.sf_status, r.sf_sub_status].filter(Boolean).join(" — ")} ${light[String(r.sf_light || "").toLowerCase()] || ""}`.trim());
    if (r.sf_advisor) lines.push(`יועץ: ${r.sf_advisor}`);
    if (r.sf_framework) lines.push(`מסגרת: ${r.sf_framework}`);
    if (r.sf_inactive_reason) lines.push(`סיבת אי-פעילות: ${r.sf_inactive_reason}`);
    const upd = iso10(r.sf_updated_at);
    if (upd) lines.push(`_עודכן ${fmtDue(upd, today)}_`);
  } else if (r.advisor_status) lines.push(`סטטוס: ${r.advisor_status}`);
  else lines.push("_עדיין לא התקבל עדכון מסילפורס_");
  return lines.join("\n");
}
