import { describe, it, expect } from "vitest"
import { matchReply, isStop, replyProblems, DEFAULT_REPLIES, normReply } from "./replies"
import { toLocalIL, toE164IL, dlrState } from "./sms019"
import { contentProblems, EMPTY_SMS, renderEmailHtml, EMPTY_EMAIL, personalizeHtml } from "./render"

describe("reply menu", () => {
  it("matches exact keys and key + text", () => {
    expect(matchReply("1", DEFAULT_REPLIES)?.key).toBe("1")
    expect(matchReply(" 2 ", DEFAULT_REPLIES)?.key).toBe("2")
    expect(matchReply("1 תודה רבה", DEFAULT_REPLIES)?.key).toBe("1")
    expect(matchReply("1.", DEFAULT_REPLIES)?.key).toBe("1")
    expect(matchReply("‏1", DEFAULT_REPLIES)?.key).toBe("1")
  })
  it("does not match unrelated replies", () => {
    expect(matchReply("12", DEFAULT_REPLIES)).toBeNull()
    expect(matchReply("מתי זה?", DEFAULT_REPLIES)).toBeNull()
    expect(matchReply("1", [])).toBeNull()
  })
  it("recognises stop words", () => {
    expect(isStop("הסר")).toBe(true)
    expect(isStop(" הסרה! ")).toBe(true)
    expect(isStop("STOP")).toBe(true)
    expect(isStop("1")).toBe(false)
    expect(isStop("אל תסירו אותי")).toBe(false)
  })
  it("validates the menu", () => {
    // The sample "2" has no text yet — the manager must write the details message before approval.
    expect(replyProblems(DEFAULT_REPLIES)).toHaveLength(1)
    expect(replyProblems(DEFAULT_REPLIES.map(r => ({ ...r, reply_text: r.reply_text || "פרטים" })))).toEqual([])
    expect(replyProblems([{ key: "1", label: "", callback: false, reply_text: "" }]).length).toBe(1)
    expect(replyProblems([{ key: "1", label: "", callback: true, reply_text: "" }, { key: "1", label: "", callback: true, reply_text: "" }]).some(p => p.includes("פעמיים"))).toBe(true)
    expect(replyProblems([{ key: "הסר", label: "", callback: true, reply_text: "" }]).some(p => p.includes("שמור"))).toBe(true)
    expect(normReply("  ״כן״ ")).toBe("כן")
  })
})

describe("019 helpers", () => {
  it("converts phone formats", () => {
    expect(toLocalIL("+972559289710")).toBe("0559289710")
    expect(toLocalIL("+15551234567")).toBeNull()
    expect(toE164IL("0559289710")).toBe("+972559289710")
    expect(toE164IL("559289710")).toBe("+972559289710")
    expect(toE164IL("972559289710")).toBe("+972559289710")
    expect(toE164IL("abc")).toBeNull()
  })
  it("maps delivery statuses", () => {
    expect(dlrState(0)).toBe("delivered")
    expect(dlrState("102")).toBe("delivered")
    expect(dlrState(-1)).toBe("pending")
    expect(dlrState(4)).toBe("failed")
    expect(dlrState(201)).toBe("failed")
  })
})

describe("SMS content rules", () => {
  it("accepts 'השב הסר' as a working opt-out", () => {
    expect(contentProblems("sms", { ...EMPTY_SMS, text: "שלום" })).toEqual([])
    expect(contentProblems("sms", { ...EMPTY_SMS, text: "שלום", optout_text: "" }).length).toBe(1)
    expect(contentProblems("sms", { ...EMPTY_SMS, text: "שלום", optout_text: "להסרה: {{unsubscribe_url}}" })).toEqual([])
  })
  it("keeps the email 'חזרו אליי' button and fills it per recipient", () => {
    const c = { ...EMPTY_EMAIL, subject: "x", intro: "y", cta: { label: "חזרו אליי", url: "{{callback_url}}" } }
    expect(contentProblems("email", c)).toEqual([])
    const html = personalizeHtml(renderEmailHtml(c, { orgAddress: "" }), { callback_url: "https://app/cb?t=1" })
    expect(html).toContain('href="https://app/cb?t=1"')
  })
})
