import { describe, expect, it } from "vitest";
import {
  commandOf, extractDate, findPhone, fmtDue, isValidIsraeliId, listOpOf, looksLikeWeekQuery, maskIdsInText,
  mergeLead, missingLeadFields, normalize, parseLead, parseLeadQuery, parseTask, resolveName, resolvePerson, shortcutOf,
  emptyLead,
} from "../parse";

const TODAY = "2026-10-22"; // Thursday

describe("normalize / commands", () => {
  it("strips emoji and direction marks so button labels equal typed words", () => {
    expect(normalize("✅ שמור")).toBe("שמור");
    expect(normalize("‏⚡ פעולות ")).toBe("פעולות");
    expect(commandOf("✅ שמור")).toBe("save");
    expect(commandOf("💾 שמור בלי ת.ז")).toBe("save_no_id");
  });
  it("maps greetings and typos to the menu", () => {
    for (const w of ["היי", "הני", "שלום", "בוקר טוב", "תפריט"]) expect(commandOf(w)).toBe("menu");
  });
  it("maps navigation words", () => {
    expect(commandOf("עזרה")).toBe("help");
    expect(commandOf("ביטול")).toBe("cancel");
    expect(commandOf("לא")).toBe("cancel");
    expect(commandOf("פעולות")).toBe("actions");
    expect(commandOf("תמיכה")).toBe("support");
    expect(commandOf("ליד חדש")).toBe("lead_new");
    expect(commandOf("המשימות שלי")).toBe("my_tasks");
    expect(commandOf("יומן")).toBe("week");
  });
  it("recognises loose week questions (the phrasing that failed in the log)", () => {
    expect(looksLikeWeekQuery("מה יש לי בשבוע הקרוב")).toBe(true);
    expect(looksLikeWeekQuery("מה יש ביומן?")).toBe(true);
    expect(looksLikeWeekQuery("להתקשר למשה 0521234567")).toBe(false);
  });
});

describe("Israeli ID", () => {
  it("validates the check digit", () => {
    expect(isValidIsraeliId("123456782")).toBe(true);
    expect(isValidIsraeliId("123456789")).toBe(false);
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("18")).toBe(false); // too short
    expect(isValidIsraeliId("000000000")).toBe(false);
  });
  it("masks valid IDs in logs but leaves phones alone", () => {
    expect(maskIdsInText("משה 123456782 0521234567")).toBe("משה *****6782 0521234567");
    expect(maskIdsInText("מספר 123456789")).toBe("מספר 123456789");
  });
});

describe("phones", () => {
  it("normalises mobile formats", () => {
    expect(findPhone("052-123-4567").phone).toBe("0521234567");
    expect(findPhone("+972 52 123 4567").phone).toBe("0521234567");
    expect(findPhone("0521234567").phone).toBe("0521234567");
  });
  it("flags landlines as invalid", () => {
    const r = findPhone("03-6123456");
    expect(r.phone).toBe("");
    expect(r.invalid).toBe("03-6123456");
  });
});

describe("parseLead", () => {
  it("parses the example from the template", () => {
    const { lead, invalid } = parseLead("משה כהן 123456782 0521234567 בן 19 מבני ברק הערות: מעוניין בהסדר");
    expect(lead).toEqual({ name: "משה כהן", idNumber: "123456782", phone: "0521234567", age: 19, city: "בני ברק", notes: "מעוניין בהסדר" });
    expect(invalid).toEqual({});
  });
  it("handles one field per line", () => {
    const { lead, labeled } = parseLead("שם: יוסי לוי\nת.ז: 000000018\nטלפון: 054-765-4321\nעיר: אלעד\nגיל: 18");
    expect(lead.name).toBe("יוסי לוי");
    expect(lead.idNumber).toBe("000000018");
    expect(lead.phone).toBe("0547654321");
    expect(lead.city).toBe("אלעד");
    expect(lead.age).toBe(18);
    expect(labeled).toContain("city");
  });
  it("pads short IDs and reports a bad check digit", () => {
    expect(parseLead("דוד 18 0521234567").lead.idNumber).toBe(""); // "18" is an age, not an ID
    const bad = parseLead("דוד לוי 123456789 0521234567");
    expect(bad.lead.idNumber).toBe("");
    expect(bad.invalid.idNumber).toBe("123456789");
  });
  it("does not take the phone as an ID or the ID as an age", () => {
    const { lead } = parseLead("ליד: אברהם 0521234567 123456782");
    expect(lead.phone).toBe("0521234567");
    expect(lead.idNumber).toBe("123456782");
    expect(lead.age).toBeNull();
    expect(lead.name).toBe("אברהם");
  });
  it("finds cities with prefixes and extra cities from the DB", () => {
    expect(parseLead("משה מבית שמש 0521234567").lead.city).toBe("בית שמש");
    expect(parseLead("משה גר באלעד 0521234567").lead.city).toBe("אלעד");
    expect(parseLead("משה ממצפה רמון 0521234567", ["מצפה רמון"]).lead.city).toBe("מצפה רמון");
  });
  it("merges: labeled fields override, others only fill gaps", () => {
    const base = { ...emptyLead(), name: "משה כהן", phone: "0521234567" };
    expect(mergeLead(base, parseLead("123456782")).idNumber).toBe("123456782");
    expect(mergeLead(base, parseLead("יוסי")).name).toBe("משה כהן");
    expect(mergeLead(base, parseLead("שם: יוסי לוי")).name).toBe("יוסי לוי");
  });
  it("lists missing required fields", () => {
    expect(missingLeadFields({ ...emptyLead(), name: "משה" })).toEqual(["idNumber", "phone"]);
  });
});

describe("dates", () => {
  it("relative words", () => {
    expect(extractDate("להתקשר מחר", TODAY).due).toBe("2026-10-23");
    expect(extractDate("עד מחרתיים", TODAY).due).toBe("2026-10-24");
    expect(extractDate("היום", TODAY).due).toBe(TODAY);
    expect(extractDate("בעוד 3 ימים", TODAY).due).toBe("2026-10-25");
    expect(extractDate("בעוד שבוע", TODAY).due).toBe("2026-10-29");
  });
  it("weekdays and weeks (Israeli week)", () => {
    expect(extractDate("עד יום שלישי", TODAY).due).toBe("2026-10-27");
    expect(extractDate("יום ה'", TODAY).due).toBe("2026-10-29"); // same weekday → next week
    expect(extractDate("שבוע הבא", TODAY).due).toBe("2026-10-25");
    expect(extractDate("עד סוף השבוע", TODAY).due).toBe(TODAY); // Thursday
    expect(extractDate("עד סוף השבוע", "2026-10-23").due).toBe("2026-10-29"); // Friday → next Thursday
  });
  it("numeric dates roll to next year when past", () => {
    expect(extractDate("עד 25.11", TODAY).due).toBe("2026-11-25");
    expect(extractDate("ב-1/3", TODAY).due).toBe("2027-03-01");
    expect(extractDate("31.2", TODAY).found).toBe(false);
  });
  it("formats due dates", () => {
    expect(fmtDue("2026-10-23", TODAY)).toBe("מחר");
    expect(fmtDue("2026-10-27", TODAY)).toBe("יום שלישי 27.10");
    expect(fmtDue(null, TODAY)).toBe("ללא תאריך");
  });
});

describe("parseTask", () => {
  const names = ["חיים שפר", "שלמה הלר", "אלעזר מיארה"];
  it("parses the template example", () => {
    const t = parseTask("להתקשר לרב כהן מישיבת מאור @חיים @שלמה עד יום שלישי דחוף", TODAY, names);
    expect(t.title).toBe("להתקשר לרב כהן מישיבת מאור");
    expect(t.tags).toEqual([{ first: "חיים", second: null }, { first: "שלמה", second: null }]);
    expect(t.due).toBe("2026-10-27");
    expect(t.urgent).toBe(true);
    expect(t.status).toBeNull();
  });
  it("consumes a surname only when it is a real full name", () => {
    expect(parseTask("@חיים שפר להכין דוח", TODAY, names).tags[0]).toEqual({ first: "חיים", second: "שפר" });
    const t = parseTask("@חיים להכין דוח", TODAY, names);
    expect(t.tags[0]).toEqual({ first: "חיים", second: null });
    expect(t.title).toBe("להכין דוח");
  });
  it("status words and labels", () => {
    expect(parseTask("לשלוח חוברות בטיפול", TODAY).status).toBe("inprogress");
    expect(parseTask("לשלוח חוברות סטטוס: ממתין", TODAY).status).toBe("waiting");
    const t = parseTask("כותרת: פגישה עם הרב\nתיוג: חיים, שלמה\nתאריך: מחר\nסטטוס: בטיפול", TODAY);
    expect(t.title).toBe("פגישה עם הרב");
    expect(t.tagNames).toEqual(["חיים", "שלמה"]);
    expect(t.due).toBe("2026-10-23");
    expect(t.status).toBe("inprogress");
  });
  it("explicit no date", () => {
    const t = parseTask("לסדר את המחסן בלי תאריך", TODAY);
    expect(t.noDate).toBe(true);
    expect(t.due).toBeNull();
    expect(t.title).toBe("לסדר את המחסן");
  });
});

describe("people", () => {
  const people = [{ id: 1, name: "אלעזר מיארה" }, { id: 3, name: "חיים שפר" }, { id: 4, name: "שלמה הלר" }, { id: 7, name: "משה כהן" }, { id: 8, name: "משה לוי" }];
  it("matches first names, full names and handles ambiguity", () => {
    expect(resolvePerson("חיים", null, people)).toMatchObject({ kind: "match", person: { id: 3 } });
    expect(resolvePerson("משה", "לוי", people)).toMatchObject({ kind: "match", person: { id: 8 }, usedSecond: true });
    expect(resolvePerson("משה", null, people)).toMatchObject({ kind: "ambiguous" });
    expect(resolveName("שפר", people)).toMatchObject({ kind: "match", person: { id: 3 } });
  });
  it("suggests close spellings and gives up on strangers", () => {
    expect(resolvePerson("חיימי", null, people)).toMatchObject({ kind: "suggest", person: { id: 3 } });
    expect(resolvePerson("זבולון", null, people)).toMatchObject({ kind: "none" });
  });
});

describe("shortcuts", () => {
  it("list ops", () => {
    expect(listOpOf("בוצע 1 3", TODAY)).toEqual({ op: "status", status: "done", indexes: [1, 3] });
    expect(listOpOf("בטיפול 2", TODAY)).toEqual({ op: "status", status: "inprogress", indexes: [2] });
    expect(listOpOf("דחה 2 ליום ראשון", TODAY)).toEqual({ op: "postpone", indexes: [2], due: "2026-10-25" });
    expect(listOpOf("דחה 4", TODAY)).toEqual({ op: "postpone", indexes: [4], due: "2026-10-23" });
  });
  it("typed shortcuts with content", () => {
    expect(shortcutOf("ליד: משה 0521234567")).toEqual({ kind: "lead", body: "משה 0521234567" });
    expect(shortcutOf("ליד")).toBeNull();
    expect(shortcutOf("משימה: להתקשר")).toEqual({ kind: "task", body: "להתקשר" });
    expect(shortcutOf("סטטוס 0521234567")).toEqual({ kind: "lead_query", body: "0521234567" });
  });
  it("lead queries", () => {
    expect(parseLeadQuery("052-1234567")).toEqual({ phone: "0521234567" });
    expect(parseLeadQuery("00000018")).toEqual({ idNumber: "000000018" });
    expect(parseLeadQuery("18")).toEqual({});
    expect(parseLeadQuery("משה כהן")).toEqual({ name: "משה כהן" });
  });
});
