import { describe, expect, it } from "vitest";
import { hasCapability } from "./access.js";
import {
  organizationProfileFromRow,
  organizationProfileSchema,
} from "./organization-profile.js";

const validProfile = {
  legalName: "شرکت خدمات ثبتی نمونه ایرانیان",
  nationalId: "14012345679",
  registrationNumber: "123456",
  activitySubject: "ارائه خدمات در قالب کارگزاری فنی، مهندسی و حقوقی ثبتی",
  legalBasis:
    "بند پ ماده ۱۱۴ قانون برنامه هفتم پیشرفت و دستورالعمل مصوب ریاست قوه قضائیه",
  supervisoryAuthority:
    "سازمان ثبت اسناد و املاک کشور و معاونت توسعه فناوری و خدمات الکترونیک ثبتی",
  planType:
    "طرح توجیهی، فنی، اجرایی، حقوقی، عملیاتی و فناورانه برای اخذ مجوز فعالیت",
  documentVersion: "نسخه نهایی تأییدشده سازمان ثبت",
  publicationStatus: "published" as const,
  expectedRevision: 2,
};

describe("page 1 organization profile", () => {
  it("accepts a complete publishable legal-entity profile", () => {
    expect(organizationProfileSchema.parse(validProfile)).toEqual(validProfile);
  });

  it("rejects incomplete identifiers and unknown fields", () => {
    expect(() =>
      organizationProfileSchema.parse({
        ...validProfile,
        nationalId: "123",
        unexpected: "unsafe",
      }),
    ).toThrow();
  });

  it("normalizes database rows without exposing internal updater data", () => {
    const result = organizationProfileFromRow({
      ...validProfile,
      revision: "3",
      publishedAt: "2026-08-02T10:00:00.000Z",
      updatedBy: 99,
    });
    expect(result).toMatchObject({
      revision: 3,
      publicationStatus: "published",
    });
    expect(result).not.toHaveProperty("updatedBy");
  });

  it("limits write access to administrators and grants audited read roles", () => {
    expect(hasCapability("admin", "organization_profile.manage")).toBe(true);
    expect(hasCapability("observer", "organization_profile.read")).toBe(true);
    expect(
      hasCapability("operations_manager", "organization_profile.read"),
    ).toBe(true);
    expect(hasCapability("compliance", "organization_profile.read")).toBe(true);
    expect(hasCapability("technical", "organization_profile.read")).toBe(false);
    expect(hasCapability("applicant", "organization_profile.manage")).toBe(
      false,
    );
  });
});
