import { beforeEach, describe, expect, it } from "vitest";
import { handleMessage, type BotDeps, type BotUser, type Draft, type TaskDraft, type TaskRow } from "../bot";
import { buttonsPayload, buttonsValid, renderAsText } from "../render";
import { extractInput } from "../extract";
import type { BotReply } from "../types";
import type { LeadDraft } from "../parse";

const PHONE = "972521111111";
const ELAZAR: BotUser = { id: 1, name: "אלעזר מיארה", role: "admin", coordinator_id: null };
const CHAIM: BotUser = { id: 3, name: "חיים שפר", role: "coordinator", coordinator_id: 1 };

type World = {
  now: Date;
  session: { state: string; draft: Draft; updatedAt: number } | null;
  leads: (LeadDraft & { id: number; coordinator_id: number | null })[];
  tasks: (TaskRow & { assignees: string[] })[];
  created: TaskDraft[];
  support: string[];
  outbound: Record<string, number>;
};

let w: World;
function deps(): BotDeps {
  return {
    now: () => w.now,
    getSession: async () => w.session,
    setSession: async (_p, _u, state, draft) => { w.session = { state, draft: JSON.parse(JSON.stringify(draft)), updatedAt: w.now.getTime() }; },
    claimState: async (_p, from, to) => { if (w.session?.state !== from) return false; w.session.state = to; return true; },
    people: async () => [{ id: 1, name: "אלעזר מיארה" }, { id: 3, name: "חיים שפר" }, { id: 4, name: "שלמה הלר" }, { id: 7, name: "משה כהן" }, { id: 8, name: "משה לוי" }],
    cities: async () => ["בני ברק", "אלעד", "ירושלים"],
    findLeadDuplicate: async (u, phone, id) => {
      const l = w.leads.find(x => x.phone === phone || (id && x.idNumber === id));
      return l ? { name: l.name, mine: u.role !== "coordinator" || l.coordinator_id === u.coordinator_id } : null;
    },
    createLead: async (u, l) => { const id = w.leads.length + 100; w.leads.push({ ...l, id, coordinator_id: u.coordinator_id }); return { id }; },
    searchLeads: async (_u, q) => w.leads.filter(l => (q.phone && l.phone === q.phone) || (q.name && l.name.includes(q.name)))
      .map(l => ({ id: l.id, name: l.name, phone: l.phone, city: l.city, id_number: l.idNumber })),
    openTasks: async u => w.tasks.filter(t => t.status !== "done" && t.assignees.includes(u.name)),
    getTask: async (u, id) => w.tasks.find(t => t.id === id && t.assignees.includes(u.name)) || null,
    updateTask: async (_u, id, p) => { const t = w.tasks.find(x => x.id === id)!; if (p.status) t.status = p.status; if (p.due_date) t.due_date = p.due_date; },
    createTask: async (u, t) => { w.created.push(t); return { id: 900, notified: t.assignees.filter(a => a.id !== u.id).map(a => a.name) }; },
    week: async (u, _from, to) => ({ events: [{ name: "ערב הורים", date: "2026-10-26", time: "18:00", location: "אלעד" }], tasks: w.tasks.filter(t => t.status !== "done" && t.assignees.includes(u.name) && (t.due_date || "") <= to) }),
    outboundTask: async s => w.outbound[s] ?? null,
    notifySupport: async (u, ctx) => { w.support.push(`${u.name}|${ctx}`); return true; },
  };
}

const say = (text: string, user = ELAZAR) => handleMessage(deps(), user, PHONE, { text });
const tap = (buttonId: string, label = "", user = ELAZAR, stanzaId: string | null = null) => handleMessage(deps(), user, PHONE, { text: label, buttonId, stanzaId });
const ids = (r: BotReply[]) => (r.at(-1)?.buttons || []).map(b => b.id);
const last = (r: BotReply[]) => r.at(-1)!.text;
const advance = (ms: number) => { w.now = new Date(w.now.getTime() + ms); };

beforeEach(() => {
  w = {
    now: new Date("2026-10-22T07:00:00Z"), // Thursday 10:00 in Israel
    session: null, leads: [], created: [], support: [], outbound: {},
    tasks: [
      { id: 11, title: "להתקשר לרב כהן", status: "todo", due_date: "2026-10-21", priority: "urgent", assignees: ["אלעזר מיארה"] },
      { id: 12, title: "להכין מצגת", status: "todo", due_date: "2026-10-22", priority: "normal", assignees: ["אלעזר מיארה"] },
      { id: 13, title: "משימה של חיים", status: "todo", due_date: "2026-10-23", priority: "normal", assignees: ["חיים שפר"] },
    ],
  };
});

describe("opening", () => {
  it("first message gets the welcome with פעולות / עזרה", async () => {
    const r = await say("בוקר טוב");
    expect(last(r)).toContain("הגעת לבוט של *נתיבים*");
    expect(ids(r)).toEqual(["actions", "help"]);
  });
  it("פעולות lists all six actions; digits and labels both work", async () => {
    await say("היי");
    const r = await tap("actions", "⚡ פעולות");
    expect(last(r)).toContain("6  ❓ עזרה");
    expect(ids(r)).toEqual(["lead_new", "task_new", "my_tasks"]);
    const r2 = await say("4");
    expect(last(r2)).toContain("סטטוס ליד");
    expect(w.session!.state).toBe("awaiting_lead_query");
  });
  it("עזרה shows examples and a support button that pings Elazar only", async () => {
    await say("היי");
    const r = await tap("help", "❓ עזרה");
    expect(last(r)).toContain("איך עושים");
    expect(ids(r)).toEqual(["actions", "support"]);
    const r2 = await tap("support", "🙋 תמיכה");
    expect(last(r2)).toContain("שלחתי לאלעזר");
    expect(w.support).toHaveLength(1);
  });
  it("an unknown message right after the welcome gets a short hint, not a loop", async () => {
    await say("היי");
    const r = await say("בלה בלה");
    expect(last(r)).toContain("לא הבנתי");
  });
  it("one 'not understood' hint per 30 minutes, then silence", async () => {
    await say("היי");
    expect(last(await say("אישר את זה הליצן"))).toContain("לא הבנתי");
    expect(await say("סתם ירד מהעץ")).toEqual([]);
    expect(await say("סיימתי")).toEqual([]);
    advance(31 * 60 * 1000);
    expect(last(await say("משהו אחר"))).toContain("לא הבנתי");
  });
  it("chatter gets no answer at all", async () => {
    await say("היי");
    for (const t of [".", "🙏", "תודה", "דייי חחח", "סבבה", "חחחח"]) expect(await say(t), t).toEqual([]);
  });
  it("a real command still works right after a silenced message", async () => {
    await say("היי");
    await say("בלה");
    await say("בלה בלה");
    const r = await say("המשימות שלי");
    expect(last(r)).toContain("המשימות הפתוחות שלך");
  });
});

describe("lead", () => {
  it("full lead in one message → confirm → save", async () => {
    await tap("lead_new", "📥 ליד חדש");
    expect(w.session!.state).toBe("awaiting_lead");
    const r = await say("משה כהן 123456782 0521234567 בן 19 מבני ברק הערות: מעוניין בהסדר");
    expect(last(r)).toContain("ליד חדש — לאשר?");
    expect(last(r)).toContain("123456782");
    expect(ids(r)).toEqual(["save", "edit", "cancel"]);
    const r2 = await tap("save", "✅ שמור");
    expect(last(r2)).toContain("הליד נשמר ונשלח לסילפורס");
    expect(w.leads).toHaveLength(1);
    expect(w.leads[0]).toMatchObject({ name: "משה כהן", idNumber: "123456782", phone: "0521234567", age: 19, city: "בני ברק" });
    expect(w.session!.state).toBe("idle");
  });
  it("asks only for what is missing, in one message", async () => {
    await tap("lead_new");
    const r = await say("יוסי לוי");
    expect(last(r)).toContain("חסר: *טלפון*");
    const r2 = await say("0547654321");
    expect(last(r2)).toContain("חסרה *ת.ז*");
    expect(ids(r2)).toEqual(["save_no_id", "cancel"]);
    const r3 = await say("000000018");
    expect(last(r3)).toContain("ליד חדש — לאשר?");
    expect(w.session!.draft.lead!.name).toBe("יוסי לוי");
  });
  it("lead without ID: שמור בלי ת.ז saves directly", async () => {
    await tap("lead_new");
    await say("יוסי לוי 0547654321");
    const r = await tap("save_no_id", "💾 שמור בלי ת.ז");
    expect(last(r)).toContain("נשמר בלי ת.ז");
    expect(w.leads[0].idNumber).toBe("");
  });
  it("a bad ID check digit is explained and dropped", async () => {
    await tap("lead_new");
    const r = await say("דוד לוי 123456789 0521234567");
    expect(last(r)).toContain("לא תקינה");
    expect(w.session!.draft.lead!.idNumber).toBe("");
  });
  it("תקן → field fix → back to the summary", async () => {
    await tap("lead_new");
    await say("משה כהן 123456782 0521234567");
    await tap("edit", "✏️ תקן");
    expect(w.session!.state).toBe("lead_edit");
    const r = await say("עיר: אלעד\nגיל: 20");
    expect(last(r)).toContain("📍 אלעד");
    expect(last(r)).toContain("גיל 20");
    expect(w.session!.state).toBe("confirm_lead");
  });
  it("duplicates are not saved and a coordinator doesn't see whose lead it is", async () => {
    w.leads.push({ id: 5, name: "ישן", idNumber: "", phone: "0521234567", age: null, city: "", notes: "", coordinator_id: 2 });
    await tap("lead_new", "", CHAIM);
    const r = await say("משה כהן 123456782 0521234567", CHAIM);
    expect(last(r)).toContain("כבר קיים במערכת (אצל רכז אחר)");
    expect(w.session!.draft.lead).toBeUndefined();
  });
  it("double tap on שמור saves once", async () => {
    await tap("lead_new");
    await say("משה כהן 123456782 0521234567");
    const d = deps();
    const save1 = handleMessage(d, ELAZAR, PHONE, { text: "", buttonId: "save" });
    const save2 = handleMessage(d, ELAZAR, PHONE, { text: "", buttonId: "save" });
    await Promise.all([save1, save2]);
    expect(w.leads).toHaveLength(1);
  });
  it("a typed 'ליד: …' shortcut skips the menu; a message with a phone is taken as a lead", async () => {
    let r = await say("ליד: אברהם 0521234567 123456782");
    expect(last(r)).toContain("ליד חדש — לאשר?");
    await say("ביטול");
    r = await say("שמעון 0529999999");
    expect(last(r)).toContain("חסרה *ת.ז*");
  });
  it("ביטול clears the draft", async () => {
    await tap("lead_new");
    await say("משה כהן 0521234567");
    const r = await say("ביטול");
    expect(last(r)).toContain("בוטל");
    expect(w.session!.draft.lead).toBeUndefined();
  });
});

describe("task", () => {
  it("full task → confirm → save, with tags and notification", async () => {
    await tap("task_new", "📝 משימה חדשה");
    const r = await say("להתקשר לרב כהן @חיים @שלמה עד יום שלישי דחוף");
    expect(last(r)).toContain("משימה חדשה — לאשר?");
    expect(last(r)).toContain("חיים שפר, שלמה הלר");
    expect(last(r)).toContain("יום שלישי 27.10");
    expect(last(r)).toContain("🔴 דחוף");
    const r2 = await tap("save");
    expect(last(r2)).toContain("המשימה נשמרה");
    expect(last(r2)).toContain("נשלחה התראה לחיים שפר ושלמה הלר");
    expect(w.created[0]).toMatchObject({ title: "להתקשר לרב כהן", due: "2026-10-27", urgent: true, status: "todo" });
    expect(w.created[0].assignees.map(a => a.id)).toEqual([3, 4]);
  });
  it("no date → asks with היום / מחר / בלי תאריך", async () => {
    await tap("task_new");
    const r = await say("לסדר את המחסן");
    expect(ids(r)).toEqual(["date_today", "date_tomorrow", "date_none"]);
    const r2 = await tap("date_tomorrow", "מחר");
    expect(last(r2)).toContain("📅 מחר");
    expect(last(r2)).toContain("אלעזר מיארה (אני)");
  });
  it("ambiguous tag → pick buttons; misspelling → suggestion", async () => {
    await tap("task_new");
    let r = await say("לשלוח חוברות @משה מחר");
    expect(last(r)).toContain("יש כמה *משה*");
    expect(ids(r)).toEqual(["pick:7", "pick:8", "pick:none"]);
    r = await tap("pick:8", "משה לוי");
    expect(last(r)).toContain("👥 משה לוי");
    await say("ביטול");
    await tap("task_new");
    r = await say("לשלוח חוברות @חיימי מחר");
    expect(last(r)).toContain("התכוונת ל*חיים שפר*");
    r = await say("כן");
    expect(last(r)).toContain("👥 חיים שפר");
  });
  it("a coordinator can tag anyone", async () => {
    await tap("task_new", "", CHAIM);
    const r = await say("להכין דוח @אלעזר מחר", CHAIM);
    expect(last(r)).toContain("👥 אלעזר מיארה");
  });
  it("edit: date, status and tags by label", async () => {
    await tap("task_new");
    await say("לשלוח חוברות מחר");
    await tap("edit");
    const r = await say("תאריך: יום ראשון\nסטטוס: בטיפול\nתיוג: שלמה");
    expect(last(r)).toContain("יום ראשון 25.10");
    expect(last(r)).toContain("סטטוס: בטיפול");
    expect(last(r)).toContain("👥 שלמה הלר");
  });
  it("a stale button from an old prompt is rejected", async () => {
    await tap("task_new");
    await say("לשלוח חוברות מחר");
    await tap("save");
    const r = await tap("save", "✅ שמור");
    expect(r[0].text).toContain("כבר לא פעיל");
    expect(w.created).toHaveLength(1);
  });
});

describe("button id quirks", () => {
  it("a tap reported by position or with a foreign id still resolves via label/index", async () => {
    await tap("lead_new");
    await say("משה כהן 123456782 0521234567");
    const r = await tap("1", "✅ שמור");
    expect(last(r)).toContain("הליד נשמר");
    await tap("lead_new");
    await say("דוד לוי 000000018 0527777777");
    const r2 = await tap("xyz", "✅ שמור");
    expect(last(r2)).toContain("הליד נשמר");
  });
});

describe("my tasks", () => {
  it("lists, opens a card, marks done and refreshes", async () => {
    const r = await tap("my_tasks", "✅ המשימות שלי");
    expect(last(r)).toContain("1. 🔴 להתקשר לרב כהן — אתמול ⚠️");
    expect(last(r)).toContain("2. להכין מצגת — היום");
    expect(last(r)).not.toContain("משימה של חיים");
    const r2 = await say("2");
    expect(ids(r2)).toEqual(["t_done", "t_progress", "t_postpone"]);
    const r3 = await tap("t_done", "✅ בוצע");
    expect(r3[0].text).toContain("סומן כבוצע: להכין מצגת");
    expect(w.tasks.find(t => t.id === 12)!.status).toBe("done");
    expect(last(r3)).toContain("המשימות הפתוחות שלך* (1)");
  });
  it("postpone via buttons and via free date", async () => {
    await tap("my_tasks");
    await say("1");
    await tap("t_postpone");
    await tap("pp_other", "📅 תאריך אחר");
    const r = await say("25.11");
    expect(r[0].text).toContain("נדחה ליום רביעי 25.11");
    expect(w.tasks[0].due_date).toBe("2026-11-25");
  });
  it("numbered shortcuts: בוצע 1 2", async () => {
    await tap("my_tasks");
    const r = await say("בוצע 1 2");
    expect(r[0].text).toContain("להתקשר לרב כהן");
    expect(w.tasks.filter(t => t.status === "done").map(t => t.id)).toEqual([11, 12]);
  });
});

describe("week & lead status", () => {
  it("groups the week by day with overdue first", async () => {
    const r = await say("מה יש לי בשבוע הקרוב");
    expect(last(r)).toContain("*באיחור* (1)");
    expect(last(r)).toContain("*היום*");
    expect(last(r)).toContain("18:00 ערב הורים · אלעד");
  });
  it("finds a lead by phone", async () => {
    w.leads.push({ id: 5, name: "משה כהן", idNumber: "123456782", phone: "0521234567", age: null, city: "אלעד", notes: "", coordinator_id: null });
    await tap("lead_status");
    const r = await say("052-1234567");
    expect(last(r)).toContain("*משה כהן* · 0521234567 · אלעד");
    expect(last(r)).toContain("*****6782");
    expect(last(r)).not.toContain("123456782");
  });
});

describe("reminders", () => {
  it("rem_done button marks the task done from any state", async () => {
    await tap("task_new");
    const r = await tap("rem_done:12", "✅ בוצע");
    expect(last(r)).toContain("סומן כבוצע: להכין מצגת");
    expect(w.tasks.find(t => t.id === 12)!.status).toBe("done");
  });
  it("a typed reply quoting a reminder works through whatsapp_outbound", async () => {
    w.outbound["MSG1"] = 11;
    const r = await handleMessage(deps(), ELAZAR, PHONE, { text: "⏰ מחר", stanzaId: "MSG1" });
    expect(last(r)).toContain("נדחה למחר");
    expect(w.tasks[0].due_date).toBe("2026-10-23");
  });
  it("someone else's task can't be touched", async () => {
    const r = await tap("rem_done:13", "✅ בוצע");
    expect(last(r)).toContain("כבר לא משויכת אליך");
  });
});

describe("timeouts", () => {
  it("offers to resume an open lead after 30 minutes", async () => {
    await tap("lead_new");
    await say("משה כהן 0521234567");
    advance(45 * 60 * 1000);
    const r = await say("אה סליחה");
    expect(last(r)).toContain("היה לך ליד פתוח (משה כהן)");
    const r2 = await tap("resume", "▶️ המשך");
    expect(last(r2)).toContain("חסרה *ת.ז*");
  });
  it("after 12 hours a greeting starts over with the welcome", async () => {
    await say("היי");
    advance(13 * 3600 * 1000);
    const r = await say("בלה");
    expect(last(r)).toContain("הגעת לבוט");
  });
});

describe("send layer (pure parts)", () => {
  it("renders numbered fallback text", () => {
    const r = { text: "לאשר?", buttons: [{ id: "save", label: "✅ שמור" }, { id: "edit", label: "✏️ תקן" }] };
    expect(renderAsText(r)).toBe("לאשר?\n\n*1* שמור  ·  *2* תקן");
    expect(renderAsText({ ...r, numbered: true })).toBe("לאשר?");
  });
  it("validates button limits and builds the Green API payload", () => {
    expect(buttonsValid({ text: "x", buttons: [{ id: "a", label: "x".repeat(26) }] })).toBe(false);
    expect(buttonsValid({ text: "x", buttons: [1, 2, 3, 4].map(i => ({ id: String(i), label: String(i) })) })).toBe(false);
    const p = buttonsPayload("972@c.us", { text: "גוף", buttons: [{ id: "save", label: "✅ שמור" }] });
    expect(p).toEqual({ chatId: "972@c.us", body: "גוף", footer: "אפשר גם לכתוב: שמור", buttons: [{ buttonId: "save", buttonText: "✅ שמור" }] });
  });
  it("every button the bot sends fits WhatsApp's limits", async () => {
    const all: BotReply[] = [];
    const runs: [string, string?][] = [["היי"], ["actions"], ["help"], ["lead_new"], ["משה 0521234567"], ["task_new"], ["לשלוח @משה"], ["my_tasks"], ["1"], ["t_postpone"]];
    for (const [t] of runs) all.push(...(t.match(/^[a-z_]+$/) ? await tap(t) : await say(t)));
    for (const r of all) if (r.buttons?.length) expect(buttonsValid(r), JSON.stringify(r.buttons)).toBe(true);
  });
});

describe("webhook payloads", () => {
  it("extracts text, button replies and quoted ids", () => {
    expect(extractInput({ typeMessage: "textMessage", textMessageData: { textMessage: "היי" } })).toMatchObject({ text: "היי", buttonId: null, kind: "text" });
    expect(extractInput({ typeMessage: "buttonsResponseMessage", buttonsResponseMessage: { stanzaId: "S1", selectedButtonId: "save", selectedButtonText: "✅ שמור" } }))
      .toEqual({ text: "✅ שמור", buttonId: "save", stanzaId: "S1", kind: "button" });
    expect(extractInput({ typeMessage: "templateButtonsReplyMessage", templateButtonReplyMessage: { stanzaId: "S2", selectedId: "rem_done:5", selectedDisplayText: "✅ בוצע" } }))
      .toMatchObject({ buttonId: "rem_done:5", stanzaId: "S2" });
    expect(extractInput({ typeMessage: "extendedTextMessage", extendedTextMessageData: { text: "בוצע", stanzaId: "S3" } })).toMatchObject({ text: "בוצע", stanzaId: "S3" });
    expect(extractInput({ typeMessage: "imageMessage" })).toBeNull();
  });
});
