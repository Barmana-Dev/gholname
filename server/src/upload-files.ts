import crypto from "node:crypto";
import path from "node:path";

const windows1252Bytes: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x2c6: 0x88,
  0x2030: 0x89,
  0x160: 0x8a,
  0x2039: 0x8b,
  0x152: 0x8c,
  0x17d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x2dc: 0x98,
  0x2122: 0x99,
  0x161: 0x9a,
  0x203a: 0x9b,
  0x153: 0x9c,
  0x17e: 0x9e,
  0x178: 0x9f,
};

function legacyFilenameBytes(value: string): Buffer {
  return Buffer.from(
    [...value].map((character) => {
      const code = character.codePointAt(0) ?? 0x3f;
      return windows1252Bytes[code] ?? (code <= 0xff ? code : 0x3f);
    }),
  );
}

/**
 * Multipart parsers may expose UTF-8 filenames as a Latin-1 string (for
 * example, Persian «مدرک.pdf» can arrive as «Ø³Ù...pdf»). Repair that
 * representation before it is persisted or sent back to the browser.
 */
export function normalizeOriginalFilename(value: unknown): string {
  const raw = String(value ?? "")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .replace(/^.*[\\/]/, "")
    .trim();
  if (!raw) return "document";

  const suspicious = (input: string) =>
    (input.match(/[ÃÂÐÑØÙÛ][\x80-\xBF]|[ØÙÛ]/g) ?? []).length;
  const repaired = legacyFilenameBytes(raw).toString("utf8");
  const candidate = repaired.includes("\uFFFD")
    ? raw
    : repaired.normalize("NFC");
  const filename = suspicious(candidate) < suspicious(raw) ? candidate : raw;

  return (filename || "document")
    .replace(/[\\/]/g, "_")
    .replace(/[\r\n"']/g, "_")
    .slice(0, 255) || "document";
}

/** Keep storage names opaque; the user-facing filename remains in the DB. */
export function storageFilename(originalName: unknown, mimeType: string): string {
  const normalized = normalizeOriginalFilename(originalName);
  const fallbackByMime: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/zip": ".zip",
    "application/vnd.google-earth.kml+xml": ".kml",
  };
  const ext = fallbackByMime[mimeType] ??
    path
      .extname(normalized)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "")
      .slice(0, 10);
  return `${crypto.randomUUID()}${ext || ".bin"}`;
}

export function safeStoragePath(root: string, storageName: unknown): string | null {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, String(storageName ?? ""));
  return resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

/** RFC 6266/RFC 5987 compatible download header for Persian filenames. */
export function contentDispositionFilename(value: unknown): string {
  const filename = normalizeOriginalFilename(value);
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[\\/\r\n"']/g, "_")
    .slice(0, 120) || "document";
  const encoded = encodeURIComponent(filename).replace(/['()]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
