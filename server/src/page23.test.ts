import { describe, expect, it } from "vitest";
import {
  allowsSensitiveSupportData,
  canAccessPayment,
  officialPaymentGateway,
  tariffBreakdown,
} from "./page23.js";

describe("page 23 support and finance controls", () => {
  it("separates legal and service tariffs and calculates the payable total", () => {
    expect(tariffBreakdown(250_000, 750_000)).toEqual({
      legalFeeRials: 250_000,
      serviceFeeRials: 750_000,
      totalRials: 1_000_000,
    });
    expect(() => tariffBreakdown(-1, 0)).toThrow(RangeError);
    expect(officialPaymentGateway).toBe("official_psp");
  });

  it("limits applicant receipts to the owner while allowing financial oversight", () => {
    expect(canAccessPayment("applicant", 4, 4)).toBe(true);
    expect(canAccessPayment("representative", 5, 4)).toBe(false);
    expect(canAccessPayment("finance", 9, 4)).toBe(true);
    expect(canAccessPayment("support", 9, 4)).toBe(false);
  });

  it("accepts sensitive support data only in authenticated in-system channels", () => {
    expect(allowsSensitiveSupportData("ticket")).toBe(true);
    expect(allowsSensitiveSupportData("chat")).toBe(true);
    expect(allowsSensitiveSupportData("email")).toBe(false);
    expect(allowsSensitiveSupportData("sms")).toBe(false);
  });
});
