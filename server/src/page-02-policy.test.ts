import { describe, expect, it } from "vitest";
import {
  canAccessApplication,
  canChangeApplicationStatus,
} from "./application-access.js";

describe("page 2 privacy and legal-scope controls", () => {
  it("limits case data to owners or staff with a documented relationship", () => {
    const unrelated = {
      applicantId: 10,
      hasActiveAssignment: false,
      hasSupportTicket: false,
      hasPayment: false,
    };
    expect(canAccessApplication({ id: 10, role: "applicant" }, unrelated)).toBe(
      true,
    );
    expect(canAccessApplication({ id: 11, role: "applicant" }, unrelated)).toBe(
      false,
    );
    expect(
      canAccessApplication(
        { id: 20, role: "registry_expert" },
        { ...unrelated, hasActiveAssignment: true },
      ),
    ).toBe(true);
    expect(canAccessApplication({ id: 30, role: "support" }, unrelated)).toBe(
      false,
    );
    expect(canAccessApplication({ id: 40, role: "technical" }, unrelated)).toBe(
      false,
    );
  });

  it("keeps registry exchange and final result out of expert permissions", () => {
    expect(
      canChangeApplicationStatus("registry_expert", "initial_review"),
    ).toBe(true);
    expect(
      canChangeApplicationStatus("registry_expert", "registry_exchange"),
    ).toBe(false);
    expect(canChangeApplicationStatus("surveyor", "completed")).toBe(false);
    expect(canChangeApplicationStatus("operations_manager", "completed")).toBe(
      true,
    );
    expect(canChangeApplicationStatus("observer", "initial_review")).toBe(
      false,
    );
  });
});
