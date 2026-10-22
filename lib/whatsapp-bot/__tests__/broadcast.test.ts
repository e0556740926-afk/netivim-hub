import { describe, expect, it } from "vitest";
import { renderBroadcast, validateBroadcast } from "../broadcast";

describe("staff broadcast", () => {
  it("fills first and full name", () => {
    expect(renderBroadcast("שלום {שם} 👋\nיש פיצ'ר חדש", { name: "עידן גרסון" })).toBe("שלום עידן 👋\nיש פיצ'ר חדש");
    expect(renderBroadcast("{שם_מלא}, {שם} — שוב {שם}", { name: "חיים שפר" })).toBe("חיים שפר, חיים — שוב חיים");
    expect(renderBroadcast("היי { שם }", { name: "אלכס" })).toBe("היי אלכס");
  });
  it("validates", () => {
    expect(validateBroadcast("   ")).toBe("ההודעה ריקה");
    expect(validateBroadcast("x".repeat(3001))).toContain("ארוכה");
    expect(validateBroadcast("שלום {שם}")).toBeNull();
  });
});
