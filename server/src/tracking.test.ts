import { describe, expect, it } from "vitest";
import {
  createTrackingToken,
  isValidTrackingToken,
  normalizeTrackingFileNumber,
  trackingFileNumberPattern,
} from "./tracking.js";

describe("privacy-preserving public tracking", () => {
  it("normalizes Persian digits and validates the generated file format", () => {
    const fileNumber = normalizeTrackingFileNumber("rb-۲۰۲۶۰۸۱۱-ab12cd34");
    expect(fileNumber).toBe("RB-20260811-AB12CD34");
    expect(trackingFileNumberPattern.test(fileNumber)).toBe(true);
    expect(trackingFileNumberPattern.test("RB-20260811-AB12CD3")).toBe(false);
  });

  it("requires the HMAC tracking token and compares it in constant time", () => {
    const fileNumber = "RB-20260811-AB12CD34";
    const token = createTrackingToken(42, fileNumber);
    expect(token).toHaveLength(43);
    expect(isValidTrackingToken(42, fileNumber, token)).toBe(true);
    expect(isValidTrackingToken(43, fileNumber, token)).toBe(false);
    expect(isValidTrackingToken(42, fileNumber, `${token.slice(0, -1)}x`)).toBe(
      false,
    );
    expect(isValidTrackingToken(42, fileNumber, undefined)).toBe(false);
  });
});

