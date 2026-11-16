import { describe, expect, it } from "vitest";
import {
  applicationSchema,
  complaintSchema,
  loginSchema,
  registerSchema,
  validateServiceFormData,
} from "./validation.js";
import { normalizeRequestValue } from "./normalize.js";

describe("validation", () => {
  it("accepts a valid Iranian national id registration", () => {
    const value = registerSchema.parse({
      fullName: "کاربر آزمایشی",
      nationalId: "0013546831",
      mobile: "09121234567",
      password: "SecurePass1!",
      acceptTerms: true,
      acceptPrivacy: true,
      confirmAccuracy: true,
    });
    expect(value.email).toBeUndefined();
    expect(loginSchema.parse({ mobile: "09121234567", password: "SecurePass1!" }).mobile).toBe("09121234567");
    expect(
      loginSchema.parse({
        mobile: "09121234567",
        password: "SecurePass1!",
        otp: "",
        recoveryCode: "A1B2C3D4E5",
      }),
    ).toMatchObject({ recoveryCode: "A1B2C3D4E5", otp: undefined });
  });
  it("rejects weak passwords", () =>
    expect(() =>
      registerSchema.parse({
        fullName: "کاربر آزمایشی",
        nationalId: "0013546831",
        mobile: "09121234567",
        password: "1234567890",
        acceptTerms: true,
        acceptPrivacy: true,
        confirmAccuracy: true,
      }),
    ).toThrow());
  it("rejects incomplete application property data", () =>
    expect(() =>
      applicationSchema.parse({
        serviceId: 1,
        applicantCapacity: "owner",
        property: { province: "تهران" },
      }),
    ).toThrow());
  it("rejects invalid deed-number characters", () =>
    expect(() =>
      applicationSchema.parse({
        serviceId: 1,
        applicantCapacity: "owner",
        formData: { deedNumber: "۱۲۳@۴۵" },
        property: {
          province: "تهران",
          county: "تهران",
          registrySection: "1",
          mainPlate: "20",
          address: "نشانی کامل و معتبر ملک",
          propertyType: "آپارتمان",
        },
      }),
    ).toThrow());
  it("requires meaningful complaint descriptions", () =>
    expect(() =>
      complaintSchema.parse({
        category: "service",
        subject: "موضوع شکایت",
        description: "کوتاه",
      }),
    ).toThrow());
  it.each([
    [
      "duplicate-deed",
      {
        duplicateReason: "lost",
        incidentDescription: "شرح کامل نحوه مفقودی سند مالکیت",
        duplicateDeclarationCommitment: "accepted",
      },
    ],
    [
      "booklet-to-cadastral",
      {
        registryBookNumber: "۱۲۳",
        bookletPage: "۴۵",
        bookletSerial: "الف-۱۲۳",
      },
    ],
    [
      "land-apartment-subdivision",
      { subdivisionType: "apartment", unitCount: "2" },
    ],
    [
      "merge-partition",
      { mergePartitionType: "merge", relatedPlateCount: "2" },
    ],
    [
      "property-status-change",
      {
        currentPropertyStatus: "مسکونی",
        requestedPropertyStatus: "تجاری",
        applicantExplanation: "شرح کامل علت درخواست تغییر وضعیت ملک",
      },
    ],
    [
      "boundary-determination",
      {
        coordinateType: "utm",
        boundaryDescription: "شرح کامل حدود اربعه و موقعیت ملک مورد درخواست",
      },
    ],
    [
      "deed-correction",
      {
        correctionType: "deed",
        currentEntry: "عبارت فعلی",
        correctedEntry: "عبارت صحیح",
        correctionReason: "شرح کامل علت و مستند اصلاح سند",
      },
    ],
    [
      "occupant-cadastral-deed",
      {
        propertyHistory: "شرح کافی سابقه ملک",
        legalBasis: "شرح کافی مبنای قانونی",
        possessionDuration: "ده سال",
        possessionBasis: "شرح کامل و مستند مبنای تصرف قانونی ملک",
        witnessEvidenceDescription: "شرح کامل استشهادات و مدارک اثباتی",
        conflictOfInterestDeclaration: "none",
        suspiciousDocumentDeclaration: "none",
        documentAuthenticityCommitment: "accepted",
      },
    ],
    [
      "article-10-claim",
      {
        propertyHistory: "شرح کافی سابقه ملک",
        legalBasis: "شرح کافی مبنای قانونی",
        claimDescription: "شرح کامل و دقیق ادعای موضوع ماده ده و مستندات مرتبط",
        claimAuthenticityCommitment: "accepted",
      },
    ],
  ])("validates the dedicated form for %s", (code, data) => {
    expect(validateServiceFormData(code, data)).toBeTruthy();
  });
  it("rejects an incomplete service-specific form", () => {
    expect(() =>
      validateServiceFormData("boundary-determination", {
        coordinateType: "utm",
      }),
    ).toThrow();
  });
  it("requires the legally relevant electronic declarations", () => {
    expect(() =>
      validateServiceFormData("duplicate-deed", {
        duplicateReason: "lost",
        incidentDescription: "شرح کامل نحوه مفقودی سند مالکیت",
      }),
    ).toThrow();
    expect(() =>
      validateServiceFormData("article-10-claim", {
        propertyHistory: "شرح کافی سابقه ملک",
        legalBasis: "شرح کافی مبنای قانونی",
        claimDescription: "شرح کامل و دقیق ادعای موضوع ماده ده و مستندات مرتبط",
      }),
    ).toThrow();
  });
  it("normalizes digits in nested request bodies", () => {
    expect(
      normalizeRequestValue({ mobile: "۰۹۱۲۱۲۳۴۵۶۷", nested: ["١٢٣"] }),
    ).toEqual({
      mobile: "09121234567",
      nested: ["123"],
    });
  });
});

describe("strongPassword", () => {
  it("rejects passwords longer than bcrypt's 72 bytes", async () => {
    const { strongPassword } = await import("./validation.js");
    const persian = "رمزعبورطولانی".repeat(5) + "aA1!"; // > 72 bytes
    expect(strongPassword(10).safeParse(persian).success).toBe(false);
  });
  it("rejects common and repetitive passwords but accepts a strong one", async () => {
    const { strongPassword } = await import("./validation.js");
    expect(strongPassword(10).safeParse("Password123!").success).toBe(false);
    expect(strongPassword(10).safeParse("Aaaaaaa1!x").success).toBe(false);
    expect(strongPassword(10).safeParse("Tr0ub4dor&3xyz").success).toBe(true);
  });
});
