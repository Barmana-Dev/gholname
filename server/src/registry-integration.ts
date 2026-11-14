import crypto from "node:crypto";

const forbiddenSegments = new Set(["__proto__", "constructor", "prototype"]);

export function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function parsePayloadFields(value: unknown): string[] {
  const parsed = jsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is string =>
      typeof item === "string" &&
      /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(item) &&
      item.split(".").every((segment) => !forbiddenSegments.has(segment)),
  );
}

function readPath(source: unknown, path: string): unknown {
  let current = source;
  for (const segment of path.split(".")) {
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    )
      return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function writePath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const segments = path.split(".");
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing))
      current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[segments.at(-1)!] = value;
}

export function selectAllowedPayloadFields(
  source: unknown,
  allowedFields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const path of allowedFields) {
    const value = readPath(source, path);
    if (value !== undefined) writePath(result, path, value);
  }
  return result;
}

export function sha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const trackingIdKeys = new Set([
  "trackingid",
  "trackingcode",
  "registrytrackingid",
  "registrytrackingcode",
  "casenumber",
  "registrycasenumber",
]);

function isTrackingIdKey(key: string): boolean {
  return trackingIdKeys.has(key.replace(/[_.-]/g, "").toLowerCase());
}

function safeTrackingId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const candidate = String(value).trim();
  if (
    !candidate ||
    candidate.length > 100 ||
    [...candidate].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return null;
  return candidate;
}

/**
 * Reads only the provider's tracking identifier from a bounded JSON response.
 * The complete response is intentionally never persisted because it may
 * contain sensitive registry data outside the service contract.
 */
export function extractRegistryTrackingId(value: unknown): string | null {
  const visited = new Set<object>();
  function visit(current: unknown, depth: number): string | null {
    if (depth > 8 || current === null || typeof current !== "object")
      return null;
    if (visited.has(current)) return null;
    visited.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const [key, child] of Object.entries(current)) {
      if (isTrackingIdKey(key)) {
        const found = safeTrackingId(child);
        if (found) return found;
      }
      const nested = visit(child, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  return visit(value, 0);
}

export function integrationError(error: unknown): {
  code: string;
  outcome: "error" | "timeout";
  internalMessage: string;
} {
  const message = error instanceof Error ? error.message : "unknown error";
  if (error instanceof Error && error.name === "TimeoutError")
    return {
      code: "UPSTREAM_TIMEOUT",
      outcome: "timeout",
      internalMessage: "UPSTREAM_TIMEOUT",
    };
  if (/^REGISTRY_HTTP_\d{3}$/.test(message))
    return { code: message, outcome: "error", internalMessage: message };
  if (
    [
      "REGISTRY_RESPONSE_TOO_LARGE",
      "REGISTRY_CONNECTION_NOT_CONFIGURED",
      "REGISTRY_PAYLOAD_INTEGRITY_FAILED",
      "REGISTRY_TRACKING_ID_CONFLICT",
    ].includes(message)
  )
    return { code: message, outcome: "error", internalMessage: message };
  return {
    code: "UPSTREAM_UNAVAILABLE",
    outcome: "error",
    internalMessage: "UPSTREAM_UNAVAILABLE",
  };
}
