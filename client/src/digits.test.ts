import { describe, expect, it } from "vitest";
import { normalizeDigits } from "./digits";

describe("normalizeDigits", () => {
  it("normalizes Persian digits", () => {
    expect(normalizeDigits("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567");
  });

  it("normalizes Arabic digits", () => {
    expect(normalizeDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
  });

  it("preserves non-digit content while normalizing mixed input", () => {
    expect(normalizeDigits("پلاک ۱۲٣-A")).toBe("پلاک 123-A");
  });
});
