import { describe, expect, it } from "vitest";
import {
  missingRequiredDocuments,
  page04AllowedActions,
  page04ServiceRules,
  validatePage04Structure,
} from "./page04-services.js";

describe("page 4 service controls", () => {
  it("defines a document and expert workflow for every service on page 4", () => {
    expect(Object.keys(page04ServiceRules)).toHaveLength(9);
    for (const rule of Object.values(page04ServiceRules)) {
      expect(rule.documentTypes.length).toBeGreaterThan(0);
      expect(rule.requiredDocuments.length).toBeGreaterThan(0);
      expect(rule.requiredAssignments.length).toBeGreaterThan(0);
      expect(rule.requiredReports).toEqual(rule.requiredAssignments);
    }
  });

  it("reports only missing mandatory document categories", () => {
    expect(
      missingRequiredDocuments("duplicate-deed", [
        "مدارک هویتی",
        "تصویر سند مالکیت",
      ]),
    ).toEqual(["مستند علت درخواست"]);
  });

  it("requires merge and partition plate counts and stakeholders to agree", () => {
    expect(() =>
      validatePage04Structure("merge-partition", {
        relatedProperties: [{ mainPlate: "۲" }],
        parties: [{ fullName: "مالک نمونه" }],
        subdivisionUnits: [],
        formData: { relatedPlateCount: 2 },
      }),
    ).not.toThrow();
    expect(() =>
      validatePage04Structure("merge-partition", {
        relatedProperties: [],
        parties: [],
        subdivisionUnits: [],
        formData: { relatedPlateCount: 2 },
      }),
    ).toThrow();
  });

  it("validates every subdivision unit and enforces the declared count", () => {
    const units = [
      { identifier: "۱", useType: "مسکونی", area: 80 },
      { identifier: "۲", floor: "اول", useType: "مسکونی", area: 75 },
    ];
    expect(
      validatePage04Structure("land-apartment-subdivision", {
        relatedProperties: [],
        parties: [],
        subdivisionUnits: units,
        formData: { unitCount: 2 },
      }),
    ).toHaveLength(2);
    expect(() =>
      validatePage04Structure("land-apartment-subdivision", {
        relatedProperties: [],
        parties: [],
        subdivisionUnits: units.slice(0, 1),
        formData: { unitCount: 2 },
      }),
    ).toThrow();
  });

  it("marks the occupant cadastral service for conflict and risk review", () => {
    expect(page04ServiceRules["occupant-cadastral-deed"]).toMatchObject({
      requiresRiskReview: true,
      requiredAssignments: ["registry_legal", "survey"],
    });
  });

  it("enforces the article 10 claim's identity, evidence and legal review path", () => {
    expect(page04ServiceRules["article-10-claim"]).toMatchObject({
      requiredDocuments: ["مدارک هویتی", "مستندات ادعا"],
      requiredAssignments: ["registry_legal"],
      requiredReports: ["registry_legal"],
    });
    expect(
      missingRequiredDocuments("article-10-claim", ["مدارک هویتی"]),
    ).toEqual(["مستندات ادعا"]);
  });

  it("separates applicant actions from assigned staff and read-only observers", () => {
    expect(
      page04AllowedActions({
        role: "applicant",
        owner: true,
        assigned: false,
        status: "draft",
      }),
    ).toEqual({
      uploadDocument: true,
      deleteDocument: true,
      submit: true,
      cancel: true,
    });
    expect(
      page04AllowedActions({
        role: "surveyor",
        owner: false,
        assigned: true,
        status: "initial_review",
      }),
    ).toEqual({
      uploadDocument: true,
      deleteDocument: false,
      submit: false,
      cancel: false,
    });
    expect(
      page04AllowedActions({
        role: "observer",
        owner: false,
        assigned: false,
        status: "draft",
      }),
    ).toEqual({
      uploadDocument: false,
      deleteDocument: false,
      submit: false,
      cancel: false,
    });
  });
});
