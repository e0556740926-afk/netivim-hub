import { describe, expect, it } from "vitest";
import { chatIdFromPhone, displayPhone, nextRun, normalizeParticipants, phoneFromWid, toCsv, validateScheduled, splitCaption } from "../group-utils";

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
    expect(validateScheduled({ ...ok, body: " " }, now)).toContain("ההודעה ריקה");
    expect(validateScheduled({ ...ok, sendAt: "2026-10-22T12:00:00Z" }, now)).toBe("המועד שבחרתם כבר עבר");
    expect(validateScheduled({ ...ok, chatId: "abc" }, now)).toContain("קבוצה");
    expect(chatIdFromPhone("052-123-4567")).toBe("972521234567@c.us");
    expect(chatIdFromPhone("12")).toBeNull();
  });
});

describe("israel time and media", () => {
  it("converts Israel local time to UTC across DST", async () => {
    const { israelLocalToUtc } = await import("../group-utils");
    expect(israelLocalToUtc("2026-10-23", "10:00")).toBe("2026-10-23T07:00:00.000Z"); // summer, UTC+3
    expect(israelLocalToUtc("2026-11-05", "10:00")).toBe("2026-11-05T08:00:00.000Z"); // winter, UTC+2
    expect(israelLocalToUtc("2026-02-31", "10:00")).toBeNull();
    expect(israelLocalToUtc("2026-10-23", "25:00")).toBeNull();
  });
  it("accepts photos/videos up to 16MB and checks captions", async () => {
    const { mediaSpec, validateScheduled } = await import("../group-utils");
    expect(mediaSpec("pic.JPG", 1000)).toMatchObject({ mime: "image/jpeg", parts: 1 });
    expect(mediaSpec("v.mp4", 5 * 1024 * 1024)).toMatchObject({ mime: "video/mp4", parts: 3 });
    expect(typeof mediaSpec("v.mp4", 17 * 1024 * 1024)).toBe("string");
    expect(typeof mediaSpec("x.exe", 10)).toBe("string");
    const now = new Date("2026-10-23T10:00:00Z");
    const base = { chatId: "120363000000000000@g.us", sendAt: "2026-10-23T12:00:00Z" };
    expect(validateScheduled({ ...base, body: "", mediaId: "abc" }, now)).toBeNull();
    expect(validateScheduled({ ...base, body: "" }, now)).toContain("ריקה");
    expect(validateScheduled({ ...base, body: "x".repeat(1100), mediaId: "abc" }, now)).toBeNull();
    expect(validateScheduled({ ...base, body: "x".repeat(5000) }, now)).toBeNull();
  });
});

describe("splitCaption", () => {
  it("keeps short text as the caption", () => {
    expect(splitCaption("שלום")).toEqual({ caption: "שלום", followUp: "" });
  });
  it("sends long text as a separate message after the file", () => {
    const long = "א".repeat(1500);
    expect(splitCaption(long)).toEqual({ caption: "", followUp: long });
  });
});
