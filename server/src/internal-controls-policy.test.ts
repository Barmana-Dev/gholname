import { describe, expect, it } from "vitest";
import {
  evidenceRequiresLicensedProvider,
  hasCompleteCaseChecklist,
  isReviewPeriodValid,
} from "./internal-controls-policy.js";

describe("page 26 internal control policies", () => {
  it("requires every periodic case review control", () => {
    expect(
      hasCompleteCaseChecklist({
        conflictChecked: true,
        scopeChecked: true,
        privacyChecked: true,
        paymentChecked: true,
      }),
    ).toBe(true);
    expect(
      hasCompleteCaseChecklist({
        conflictChecked: true,
        scopeChecked: false,
        privacyChecked: true,
        paymentChecked: true,
      }),
    ).toBe(false);
  });

  it("rejects inverted access review periods", () => {
    expect(
      isReviewPeriodValid(
        new Date("2026-07-01"),
        new Date("2026-07-31"),
        new Date("2026-08-07"),
      ),
    ).toBe(true);
    expect(
      isReviewPeriodValid(
        new Date("2026-08-01"),
        new Date("2026-07-31"),
        new Date("2026-08-07"),
      ),
    ).toBe(false);
  });

  it("requires provider credentials for contractor and penetration evidence", () => {
    expect(evidenceRequiresLicensedProvider("contractor_contract")).toBe(true);
    expect(evidenceRequiresLicensedProvider("penetration_test")).toBe(true);
    expect(evidenceRequiresLicensedProvider("technical_document")).toBe(false);
  });
});
