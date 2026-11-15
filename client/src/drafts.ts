/**
 * Short-lived, sanitised storage for the new-application wizard draft.
 *
 * Drafts contain property information, so they:
 *  - expire after DRAFT_TTL_MS,
 *  - never persist identity/contact-type fields (national IDs, mobiles, IBANs…),
 *  - are removed on logout and after a successful submit.
 */
export const APPLICATION_DRAFT_KEY = "regbroker_new_application_draft";
export const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

const SENSITIVE_KEY =
  /(national|nid|mobile|phone|iban|account|card|password|otp|recovery|token)/i;
const JSON_ARRAY_FIELDS = new Set([
  "relatedPropertiesJson",
  "partiesJson",
  "subdivisionUnitsJson",
]);

export interface DraftPayload {
  step?: number;
  serviceId?: string;
  fields?: Record<string, unknown>;
}

function stripSensitiveDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveDeep);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, item]) => [key, stripSensitiveDeep(item)]),
    );
  return value;
}

export function sanitizeDraftFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value !== "string") continue; // File objects etc. are never stored.
    if (JSON_ARRAY_FIELDS.has(key)) {
      try {
        clean[key] = JSON.stringify(stripSensitiveDeep(JSON.parse(value)));
      } catch {
        // Unparseable structured data is dropped rather than stored as-is.
      }
      continue;
    }
    clean[key] = value;
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

/** Removes every browser-side artefact of a session (drafts + legacy keys). */
export function clearClientSessionData(): void {
  clearDraft();
  try {
    localStorage.removeItem("regbroker_token");
    localStorage.removeItem("regbroker_user");
  } catch {
    /* ignore */
  }
}
