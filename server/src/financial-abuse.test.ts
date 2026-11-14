import { describe, expect, it } from "vitest";
import {
  complaintDueSql,
  FINANCIAL_COMPLAINT_SLA_HOURS,
  isUrgentFinancialComplaint,
  SMS_PAYMENT_WARNING,
  withSmsPaymentWarning,
} from "./financial-abuse.js";

describe("financial abuse controls", () => {
  it("marks off-platform payment reports urgent with a four-hour SLA", () => {
    expect(isUrgentFinancialComplaint("off_platform_payment")).toBe(true);
    expect(FINANCIAL_COMPLAINT_SLA_HOURS).toBe(4);
    expect(complaintDueSql("off_platform_payment")).toContain("4 HOUR");
    expect(complaintDueSql("service")).toContain("3 DAY");
  });

  it("adds the anti-fraud warning to every SMS exactly once", () => {
    const warned = withSmsPaymentWarning("کد تأیید: ۱۲۳۴۵۶");
    expect(warned).toContain(SMS_PAYMENT_WARNING);
    expect(withSmsPaymentWarning(warned)).toBe(warned);
  });
});
