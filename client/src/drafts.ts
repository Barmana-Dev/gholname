/**
 * Short-lived storage for the new-application wizard draft.
 *
 * Only an explicit allow-list of NON-identifying choices is ever stored
 * (service, applicant capacity, property/deed type). Names, national IDs,
 * plates, parcels, coordinates, areas and free text are never persisted, so a
 * script running on the same origin cannot read personal or property data
 * from localStorage. Drafts expire after DRAFT_TTL_MS and are removed on
 * logout and after a successful submit — NOT on page load.
 */
export const APPLICATION_DRAFT_KEY = "regbroker_new_application_draft";
export const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

const ALLOWED_DRAFT_FIELDS = new Set([
  "serviceId",
  "applicantCapacity",
  "propertyType",
  "deedType",
]);

export interface DraftPayload {
  step?: number;
  serviceId?: string;
  fields?: Record<string, unknown>;
}

export function sanitizeDraftFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_DRAFT_FIELDS.has(key)) continue;
    if (typeof value !== "string") continue;
    clean[key] = value.slice(0, 80);
  }
  return clean;
}

export function loadDraft(): DraftPayload {
  try {
    const raw = localStorage.getItem(APPLICATION_DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DraftPayload & { savedAt?: number };
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > DRAFT_TTL_MS
    ) {
      localStorage.removeItem(APPLICATION_DRAFT_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveDraft(payload: DraftPayload): void {
  try {
    localStorage.setItem(
      APPLICATION_DRAFT_KEY,
      JSON.stringify({
        step: payload.step,
        serviceId: payload.serviceId,
        fields: sanitizeDraftFields(payload.fields ?? {}),
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* storage unavailable or full: drafts are best-effort */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(APPLICATION_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Drops token/user keys written by versions that kept the JWT in localStorage. */
export function clearLegacySessionKeys(): void {
  try {
    localStorage.removeItem("regbroker_token");
    localStorage.removeItem("regbroker_user");
  } catch {
    /* ignore */
  }
}

/** Explicit sign-out: remove the draft as well as any legacy keys. */
export function clearClientSessionData(): void {
  clearDraft();
  clearLegacySessionKeys();
}
