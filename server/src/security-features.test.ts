import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  blindIndex,
  decryptField,
  encryptField,
  generateTotpSecret,
  totpCode,
  verifyTotp,
} from "./crypto.js";
import { capabilitiesForRole, hasCapability } from "./access.js";
import {
  contentDispositionFilename,
  normalizeOriginalFilename,
  safeStoragePath,
  storageFilename,
} from "./upload-files.js";
import { loginSchema, registerSchema } from "./validation.js";
import { hydrateSessionUser } from "./security.js";
import { canAccessApplication } from "./application-access.js";

describe("security features", () => {
  it("encrypts sensitive fields with randomized AES-GCM ciphertext", () => {
    const first = encryptField("0013546831");
    const second = encryptField("0013546831");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^enc:v1:/);
    expect(decryptField(first)).toBe("0013546831");
  });

  it("creates deterministic blind indexes without exposing plaintext", () => {
    expect(blindIndex("TestValue")).toBe(blindIndex("testvalue"));
    expect(blindIndex("TestValue")).not.toContain("TestValue");
  });

  it("generates and verifies time-based one-time passwords", () => {
    const secret = generateTotpSecret();
    const code = totpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, code === "000000" ? "111111" : "000000")).toBe(
      false,
    );
  });

  it("gives admin every capability and keeps applicants scoped", () => {
    expect(hasCapability("admin", "services.manage")).toBe(true);
    expect(hasCapability("applicant", "services.manage")).toBe(false);
    expect(capabilitiesForRole("applicant")).toContain("applications.read_own");
    expect(hasCapability("operations_manager", "registry.enqueue")).toBe(true);
    expect(hasCapability("observer", "registry.enqueue")).toBe(false);
    expect(hasCapability("observer", "registry.read")).toBe(true);
  });

  it("keeps the registry observer read-only at capability level", () => {
    const capabilities = capabilitiesForRole("observer");
    expect(capabilities).toContain("dashboard.view");
    expect(capabilities).toContain("audit.read");
    expect(capabilities).not.toContain("complaints.manage");
    expect(capabilities).not.toContain("complaints.read");
    expect(hasCapability("observer", "applications.manage")).toBe(false);
  });

  it("separates internal-control readers from managers", () => {
    expect(hasCapability("compliance", "internal_controls.manage")).toBe(true);
    expect(hasCapability("technical", "internal_controls.read")).toBe(true);
    expect(hasCapability("observer", "internal_controls.read")).toBe(true);
    expect(hasCapability("observer", "internal_controls.manage")).toBe(false);
    expect(hasCapability("applicant", "internal_controls.read")).toBe(false);
  });

  it("repairs mojibake filenames and keeps storage names opaque", () => {
    const mojibake = "Ø³Ù†Ø¯ Ø´Ù†Ø§Ø³Ø§ÛŒÛŒ.pdf";
    expect(normalizeOriginalFilename(mojibake)).toBe("سند شناسایی.pdf");
    expect(storageFilename(mojibake, "application/pdf")).toMatch(
      /^[0-9a-f-]{36}\.pdf$/,
    );
    expect(contentDispositionFilename("مدرک نهایی.pdf")).toContain(
      "filename*=UTF-8''",
    );
    expect(contentDispositionFilename("مدرک\r\n.pdf")).not.toContain("\r");
    // path.resolve() is host-specific (E:\\tmp\\... on Windows), so the
    // expected value is derived the same way instead of hard-coding a POSIX
    // path; the security property being asserted is unchanged.
    const uploadRoot = path.resolve("/tmp/regbroker-uploads");
    expect(safeStoragePath(uploadRoot, "abc.pdf")).toBe(
      path.join(uploadRoot, "abc.pdf"),
    );
    expect(safeStoragePath(uploadRoot, "../secret")).toBeNull();
    // Windows separators must not escape the root either.
    expect(safeStoragePath(uploadRoot, "..\\secret")).toBeNull();
  });

  it("accepts phone-only public auth payloads", () => {
    expect(
      registerSchema.parse({
        fullName: "کاربر آزمایشی",
        nationalId: "0013546831",
        mobile: "09121234567",
        password: "Password!123",
        acceptTerms: true,
        acceptPrivacy: true,
        confirmAccuracy: true,
      }).email,
    ).toBeUndefined();
    expect(loginSchema.parse({ mobile: "09121234567", password: "Password!123" })).toEqual({
      mobile: "09121234567",
      password: "Password!123",
    });
  });

  it("revalidates a signed session against the current active role", () => {
    const signed = { id: 7, role: "admin" as const, name: "نام قدیمی", mfaVerified: true };
    expect(
      hydrateSessionUser(signed, {
        status: "active",
        role: "support",
        name: "نام به‌روز",
      }),
    ).toMatchObject({ id: 7, role: "support", name: "نام به‌روز", mfaVerified: true });
    expect(hydrateSessionUser(signed, { status: "suspended", role: "admin", name: "مدیر" })).toBeNull();
    expect(hydrateSessionUser(signed, { status: "active", role: "unknown", name: "مدیر" })).toBeNull();
  });

  it("does not grant support access without an assigned or available ticket", () => {
    const user = { id: 7, role: "support" as const };
    const facts = {
      applicantId: 12,
      hasActiveAssignment: false,
      hasPayment: false,
    };
    expect(canAccessApplication(user, { ...facts, hasSupportTicket: false })).toBe(false);
    expect(canAccessApplication(user, { ...facts, hasSupportTicket: true })).toBe(true);
  });
});
