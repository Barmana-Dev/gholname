// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  APPLICATION_DRAFT_KEY,
  DRAFT_TTL_MS,
  clearLegacySessionKeys,
  loadDraft,
  sanitizeDraftFields,
  saveDraft,
} from "./drafts";

afterEach(() => localStorage.clear());

describe("application drafts", () => {
  it("stores only allow-listed, non-identifying fields", () => {
    const clean = sanitizeDraftFields({
      applicantCapacity: "owner",
      propertyType: "apartment",
      mainPlate: "1234",
      postalCode: "1234567890",
      partiesJson: '[{"fullName":"x","nationalId":"1"}]',
      description: "free text",
    });
    expect(clean).toEqual({ applicantCapacity: "owner", propertyType: "apartment" });
  });
  it("survives reloads (legacy key cleanup does not remove the draft)", () => {
    saveDraft({ step: 2, serviceId: "5", fields: { deedType: "x" } });
    clearLegacySessionKeys();
    expect(loadDraft().step).toBe(2);
  });
  it("expires after the TTL", () => {
    saveDraft({ step: 1, fields: {} });
    const raw = JSON.parse(localStorage.getItem(APPLICATION_DRAFT_KEY)!);
    raw.savedAt = Date.now() - DRAFT_TTL_MS - 1;
    localStorage.setItem(APPLICATION_DRAFT_KEY, JSON.stringify(raw));
    expect(loadDraft()).toEqual({});
  });
});
