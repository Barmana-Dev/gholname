import { describe, expect, it } from "vitest";
import { can } from "./access";

describe("panel capability matrix", () => {
  it("allows only roles with the management capability", () => {
    expect(can("admin", "management")).toBe(true);
    expect(can("operations_manager", "management")).toBe(true);
    expect(can("technical", "management")).toBe(true);
    expect(can("applicant", "management")).toBe(false);
  });

  it("keeps applicant creation separate from staff workspaces", () => {
    expect(can("applicant", "applications.create")).toBe(true);
    expect(can("applicant", "workspace")).toBe(false);
    expect(can("registry_expert", "workspace")).toBe(true);
    expect(can("operations_manager", "applications.create")).toBe(false);
  });

  it("does not expose unsupported support navigation to non-support roles", () => {
    expect(can("finance", "support")).toBe(false);
    expect(can("compliance", "support")).toBe(false);
    expect(can("technical", "support")).toBe(false);
  });

  it("uses capabilities returned by the API as the UI source of truth", () => {
    expect(
      can("technical", "management", ["panel.view", "management.view"]),
    ).toBe(true);
    expect(can("admin", "management", ["panel.view"])).toBe(false);
    expect(
      can("observer", "applications.read", ["applications.read_all"]),
    ).toBe(true);
  });

  it("shows the organization profile only for API-granted readers", () => {
    expect(
      can("observer", "organizationProfile", ["organization_profile.read"]),
    ).toBe(true);
    expect(can("technical", "organizationProfile", ["monitoring.read"])).toBe(
      false,
    );
    expect(can("admin", "organization_profile.manage", ["*"])).toBe(true);
  });

  it("does not expose writable complaint or support surfaces to observers", () => {
    expect(can("observer", "dashboard")).toBe(true);
    expect(can("observer", "management")).toBe(true);
    expect(can("observer", "complaints")).toBe(false);
    expect(can("observer", "support")).toBe(false);
  });

  it("shows internal controls only when the API grants read access", () => {
    expect(
      can("observer", "internal_controls", ["internal_controls.read"]),
    ).toBe(true);
    expect(can("applicant", "internal_controls", ["panel.view"])).toBe(false);
  });
});
