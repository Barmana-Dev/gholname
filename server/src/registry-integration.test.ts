import { describe, expect, it } from "vitest";
import {
  extractRegistryTrackingId,
  integrationError,
  parsePayloadFields,
  selectAllowedPayloadFields,
  sha256,
} from "./registry-integration.js";
import { resolveRegistryConnection } from "./config.js";
import { claimJobQuery } from "./integration-queue.js";

describe("registry integration controls", () => {
  it("projects only service-approved payload paths", () => {
    const source = {
      deedNumber: "۱۲۳۴",
      owner: { name: "متقاضی", nationalId: "0013546831" },
      internalRisk: "critical",
    };
    expect(
      selectAllowedPayloadFields(source, ["deedNumber", "owner.name"]),
    ).toEqual({ deedNumber: "۱۲۳۴", owner: { name: "متقاضی" } });
  });

  it("rejects unsafe and malformed configured field paths", () => {
    expect(
      parsePayloadFields([
        "deedNumber",
        "owner.name",
        "__proto__.polluted",
        "owner[secret]",
        12,
      ]),
    ).toEqual(["deedNumber", "owner.name"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("creates stable integrity hashes without exposing payload contents", () => {
    const payload = JSON.stringify({ secret: "sensitive" });
    expect(sha256(payload)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(payload)).toBe(sha256(payload));
    expect(sha256(payload)).not.toContain("sensitive");
  });

  it("extracts only a bounded registry tracking identifier from nested responses", () => {
    expect(
      extractRegistryTrackingId({
        data: { registry_tracking_id: "ORG-۱۴۰۳-۱۲۳" },
        owner: { nationalId: "0013546831" },
      }),
    ).toBe("ORG-۱۴۰۳-۱۲۳");
    expect(
      extractRegistryTrackingId({
        result: { trackingCode: 12345 },
      }),
    ).toBe("12345");
    expect(extractRegistryTrackingId({ result: { trackingId: "" } })).toBeNull();
    expect(
      extractRegistryTrackingId({ result: { trackingId: "x".repeat(101) } }),
    ).toBeNull();
  });

  it("classifies upstream failures without leaking arbitrary details", () => {
    expect(integrationError(new Error("REGISTRY_HTTP_503"))).toMatchObject({
      code: "REGISTRY_HTTP_503",
      outcome: "error",
    });
    const sanitized = integrationError(new Error("token=very-secret"));
    expect(sanitized).toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      outcome: "error",
    });
    expect(sanitized.internalMessage).not.toContain("very-secret");
  });

  it("keeps test and production credentials separate and requires production HTTPS", () => {
    const base = {
      REGISTRY_TEST_API_BASE_URL: "http://registry.test.local",
      REGISTRY_TEST_API_TOKEN: "test-token-123456",
      REGISTRY_PRODUCTION_API_BASE_URL: "https://registry.example.ir",
      REGISTRY_PRODUCTION_API_TOKEN: "production-token-123456",
    };
    expect(
      resolveRegistryConnection({ ...base, REGISTRY_API_MODE: "test" }),
    ).toEqual({
      baseUrl: base.REGISTRY_TEST_API_BASE_URL,
      token: base.REGISTRY_TEST_API_TOKEN,
    });
    expect(
      resolveRegistryConnection({ ...base, REGISTRY_API_MODE: "production" }),
    ).toEqual({
      baseUrl: base.REGISTRY_PRODUCTION_API_BASE_URL,
      token: base.REGISTRY_PRODUCTION_API_TOKEN,
    });
    expect(
      resolveRegistryConnection({
        ...base,
        REGISTRY_API_MODE: "production",
        REGISTRY_PRODUCTION_API_BASE_URL: "http://registry.example.ir",
      }),
    ).toBeNull();
  });

  it("uses a MariaDB-compatible row claim query for the queue worker", () => {
    expect(claimJobQuery).toContain("FOR UPDATE");
    expect(claimJobQuery).not.toMatch(/SKIP\s+LOCKED/i);
  });
});
