import { describe, expect, it } from "vitest";
import {
  canApproveArchiveAccess,
  isValidArchiveGrantPeriod,
  ownsArchivedApplication,
} from "./archive-access.js";

describe("page 25 archive controls", () => {
  it("keeps an archived file available to its owner", () => {
    expect(
      ownsArchivedApplication(
        { id: 7, role: "applicant", name: "متقاضی" },
        7,
      ),
    ).toBe(true);
    expect(
      ownsArchivedApplication(
        { id: 8, role: "compliance", name: "تطبیق" },
        7,
      ),
    ).toBe(false);
  });

  it("requires a manager role and verified second factor for approval", () => {
    expect(
      canApproveArchiveAccess({
        id: 1,
        role: "operations_manager",
        name: "مدیر",
        mfaVerified: true,
      }),
    ).toBe(true);
    expect(
      canApproveArchiveAccess({
        id: 1,
        role: "operations_manager",
        name: "مدیر",
        mfaVerified: false,
      }),
    ).toBe(false);
    expect(
      canApproveArchiveAccess({
        id: 2,
        role: "compliance",
        name: "تطبیق",
        mfaVerified: true,
      }),
    ).toBe(false);
  });

  it("limits long-term grants to one year", () => {
    const now = new Date("2026-08-02T00:00:00.000Z");
    expect(
      isValidArchiveGrantPeriod(new Date("2027-08-02T00:00:00.000Z"), now),
    ).toBe(true);
    expect(
      isValidArchiveGrantPeriod(new Date("2027-08-04T00:00:00.000Z"), now),
    ).toBe(false);
    expect(
      isValidArchiveGrantPeriod(new Date("2026-08-01T00:00:00.000Z"), now),
    ).toBe(false);
  });
});
