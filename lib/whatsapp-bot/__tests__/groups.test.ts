import { describe, expect, it } from "vitest";
import { chatIdFromPhone, displayPhone, nextRun, normalizeParticipants, phoneFromWid, toCsv, validateScheduled } from "../group-utils";

describe("group members", () => {
  it("reads phones from phoneNumber or id, skips @lid and duplicates", () => {
    const rows = normalizeParticipants([
      { id: "972521111111@c.us", lid: "111@lid", phoneNumber: "972521111111@c.us", isAdmin: true },
      { id: "222@lid", lid: "222@lid", phoneNumber: "" },
      { id: "972533333333@c.us", phoneNumber: "" },
      { id: "972521111111@c.us", phoneNumber: "972521111111@c.us" },
    ]);
    expect(rows).toEqual([
      { phone: "972521111111", isAdmin: true, lid: "111@lid" },
      { phone: "972533333333", isAdmin: false, lid: null },
      { phone: null, isAdmin: false, lid: "222@lid" },
    ]);
    expect(phoneFromWid("123@g.us")).toBeNull();
  });
  it("formats phones and CSV", () => {
    expect(displayPhone("972521234567")).toBe("052-1234567");
    expect(displayPhone("12025550100")).toBe("+12025550100");
    expect(toCsv([["טלפון", "שם"], ["052-1234567", "=HYPERLINK(1)"]])).toBe('﻿"טלפון","שם"\r\n"052-1234567","\'=HYPERLINK(1)"');
  });
});

describe("scheduled messages", () => {
  const now = new Date("2026-10-23T10:00:00Z");
  it("computes the next repeat after now", () => {
    expect(nextRun(new Date("2026-10-23T06:00:00Z"), "none", now)).toBeNull();
    expect(nextRun(new Date("2026-10-23T06:00:00Z"), "daily", now)!.toISOString()).toBe("2026-10-24T06:00:00.000Z");
    expect(nextRun(new Date("2026-10-20T06:00:00Z"), "daily", now)!.toISOString()).toBe("2026-10-24T06:00:00.000Z");
    expect(nextRun(new Date("2026-10-23T06:00:00Z"), "weekly", now)!.toISOString()).toBe("2026-10-30T06:00:00.000Z");
  });
  it("validates input", () => {
    const ok = { chatId: "120363000000000000@g.us", body: "שלום", sendAt: "2026-10-23T12:00:00Z", repeat: "none" };
    expect(validateScheduled(ok, now)).toBeNull();
    expect(validateScheduled({ ...ok, body: " " }, now)).toBe("ההודעה ריקה");
    expect(validateScheduled({ ...ok, sendAt: "2026-10-22T12:00:00Z" }, now)).toBe("המועד שבחרתם כבר עבר");
    expect(validateScheduled({ ...ok, chatId: "abc" }, now)).toContain("קבוצה");
    expect(chatIdFromPhone("052-123-4567")).toBe("972521234567@c.us");
    expect(chatIdFromPhone("12")).toBeNull();
  });
});
