import { describe, expect, it } from "vitest";
import {
  capabilitiesForRole,
  hasCapability,
  roleCapabilities,
} from "./access.js";
import { canAccessApplication } from "./application-access.js";
import { canAccessPayment } from "./page23.js";
import type { RoleCode } from "./types.js";

const roles = Object.keys(roleCapabilities) as RoleCode[];

describe("server authorization matrix", () => {
  it("keeps every declared role bounded and gives admin the explicit wildcard", () => {
    expect(capabilitiesForRole("admin")).toEqual(["*"]);
    for (const role of roles.filter((role) => role !== "admin")) {
      expect(capabilitiesForRole(role)).not.toContain("*");
      expect(capabilitiesForRole(role).length).toBeGreaterThan(0);
    }
  });

  it("keeps the observer read-only across sensitive capability families", () => {
    const mutatingCapabilities = [
      "applications.create",
      "applications.manage",
      "assignments.manage",
      "services.manage",
      "payments.manage",
      "refunds.manage",
      "complaints.manage",
      "support.manage",
      "registry.enqueue",
      "internal_controls.manage",
      "internal_controls.evidence_manage",
      "archives.request",
      "archives.approve",
      "incidents.manage",
      "organization_profile.manage",
    ];
    for (const capability of mutatingCapabilities)
      expect(hasCapability("observer", capability)).toBe(false);
    expect(hasCapability("observer", "dashboard.view")).toBe(true);
    expect(hasCapability("observer", "audit.read")).toBe(true);
    expect(hasCapability("observer", "reports.export")).toBe(true);
  });

  it("separates audit/export and operational controls by role", () => {
    for (const role of [
      "operations_manager",
      "compliance",
      "technical",
      "admin",
      "observer",
    ] as const)
      expect(hasCapability(role, "audit.read")).toBe(true);
    for (const role of [
      "operations_manager",
      "compliance",
      "admin",
      "observer",
    ] as const)
      expect(hasCapability(role, "reports.export")).toBe(true);
    expect(hasCapability("technical", "reports.export")).toBe(false);
    expect(hasCapability("technical", "internal_controls.read")).toBe(true);
    expect(hasCapability("technical", "internal_controls.manage")).toBe(false);
    expect(hasCapability("compliance", "internal_controls.manage")).toBe(true);
  });

  it("enforces relationship-scoped application access for every non-global role", () => {
    const facts = {
      applicantId: 10,
      hasActiveAssignment: false,
      hasSupportTicket: false,
      hasPayment: false,
    };
    expect(canAccessApplication({ id: 10, role: "applicant" }, facts)).toBe(
      true,
    );
    expect(canAccessApplication({ id: 11, role: "applicant" }, facts)).toBe(
      false,
    );
    expect(
      canAccessApplication({ id: 10, role: "representative" }, facts),
    ).toBe(true);
    expect(
      canAccessApplication({ id: 11, role: "representative" }, facts),
    ).toBe(false);
    expect(
      canAccessApplication({ id: 20, role: "registry_expert" }, facts),
    ).toBe(false);
    expect(
      canAccessApplication(
        { id: 20, role: "registry_expert" },
        { ...facts, hasActiveAssignment: true },
      ),
    ).toBe(true);
    expect(canAccessApplication({ id: 30, role: "surveyor" }, facts)).toBe(
      false,
    );
    expect(
      canAccessApplication(
        { id: 30, role: "surveyor" },
        { ...facts, hasActiveAssignment: true },
      ),
    ).toBe(true);
    expect(canAccessApplication({ id: 40, role: "support" }, facts)).toBe(
      false,
    );
    expect(
      canAccessApplication(
        { id: 40, role: "support" },
        { ...facts, hasSupportTicket: true },
      ),
    ).toBe(true);
    expect(canAccessApplication({ id: 50, role: "finance" }, facts)).toBe(
      false,
    );
    expect(
      canAccessApplication(
        { id: 50, role: "finance" },
        { ...facts, hasPayment: true },
      ),
    ).toBe(true);
    for (const role of [
      "operations_manager",
      "compliance",
      "admin",
      "observer",
    ] as const)
      expect(canAccessApplication({ id: 99, role }, facts)).toBe(true);
    expect(canAccessApplication({ id: 99, role: "technical" }, facts)).toBe(
      false,
    );
  });

  it("keeps payment receipts and quotes owner-scoped outside finance/oversight", () => {
    for (const role of ["applicant", "representative"] as const) {
      expect(canAccessPayment(role, 10, 10)).toBe(true);
      expect(canAccessPayment(role, 11, 10)).toBe(false);
    }
    for (const role of [
      "finance",
      "operations_manager",
      "compliance",
      "admin",
      "observer",
    ] as const)
      expect(canAccessPayment(role, 999, 10)).toBe(true);
    for (const role of [
      "registry_expert",
      "surveyor",
      "support",
      "technical",
    ] as const)
      expect(canAccessPayment(role, 999, 10)).toBe(false);
  });
});
