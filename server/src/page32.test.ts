import { describe, expect, it } from "vitest";
import { hasCapability } from "./access.js";
import {
  canAccessApplication,
  canChangeApplicationStatus,
  canSendMessageType,
} from "./application-access.js";
import { canAccessPayment } from "./page23.js";

describe("PDF page 32 panel access", () => {
  it("keeps applicant records and receipts owner-scoped", () => {
    const own = {
      applicantId: 10,
      hasActiveAssignment: false,
      hasSupportTicket: false,
      hasPayment: false,
    };
    expect(canAccessApplication({ id: 10, role: "applicant" }, own)).toBe(true);
    expect(canAccessApplication({ id: 11, role: "applicant" }, own)).toBe(false);
    expect(canAccessPayment("representative", 10, 10)).toBe(true);
    expect(canAccessPayment("representative", 11, 10)).toBe(false);
  });

  it("limits experts to active assignments and expert workflow actions", () => {
    expect(
      canAccessApplication(
        { id: 20, role: "registry_expert" },
        {
          applicantId: 10,
          hasActiveAssignment: true,
          hasSupportTicket: false,
          hasPayment: false,
        },
      ),
    ).toBe(true);
    expect(
      canAccessApplication(
        { id: 20, role: "registry_expert" },
        {
          applicantId: 10,
          hasActiveAssignment: false,
          hasSupportTicket: false,
          hasPayment: false,
        },
      ),
    ).toBe(false);
    expect(canSendMessageType("registry_expert", "deficiency")).toBe(true);
    expect(canSendMessageType("registry_expert", "payment")).toBe(false);
    expect(
      canChangeApplicationStatus("registry_expert", "documents_deficient"),
    ).toBe(true);
    expect(canChangeApplicationStatus("registry_expert", "completed")).toBe(
      false,
    );
  });

  it("separates management, audit, payment, and technical permissions", () => {
    expect(hasCapability("operations_manager", "services.manage")).toBe(true);
    expect(hasCapability("compliance", "audit.read")).toBe(true);
    expect(hasCapability("finance", "payments.manage")).toBe(true);
    expect(hasCapability("technical", "monitoring.read")).toBe(true);
    expect(hasCapability("observer", "applications.manage")).toBe(false);
    expect(hasCapability("applicant", "management.view")).toBe(false);
  });

  it("does not grant deletion of original history to any panel role", () => {
    for (const role of [
      "applicant",
      "representative",
      "registry_expert",
      "surveyor",
      "support",
      "finance",
      "operations_manager",
      "compliance",
      "technical",
      "admin",
      "observer",
    ] as const)
      expect(hasCapability(role, "history.delete")).toBe(false);
  });
});
