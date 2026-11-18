/**
 * Dependency-free parts of Content Disarm & Reconstruction (CDR).
 *
 * Nothing here "cleans" the uploaded bytes: output is always BUILT from
 * validated primitives (numbers, escaped text) or verified afterwards, so
 * anything the sanitizer does not understand is dropped or rejected.
 */
export class CdrRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CdrRejectedError";
  }
}

const MAX_KML_BYTES = 5 * 1024 * 1024;
const MAX_PLACEMARKS = 5000;
const MAX_COORDINATES_PER_GEOMETRY = 100_000;
const NUMBER = /^-?\d{1,3}(?:\.\d{1,15})?$/;
const ALTITUDE = /^-?\d{1,6}(?:\.\d{1,15})?$/;

/** Capture group `index` of a regex match, or "" when absent (strict index access). */
function group(match: RegExpExecArray | RegExpMatchArray | null | undefined, index: number): string {
  return match?.[index] ?? "";
}

function xmlEscape(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return value.replace(/[&<>"']/g, (c) => entities[c] ?? c);
}

function plainText(raw: string, maxLength: number): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ") // no markup survives, including HTML in descriptions
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseCoordinates(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > MAX_COORDINATES_PER_GEOMETRY)
    throw new CdrRejectedError("تعداد مختصات KML مجاز نیست.");
  return tokens
    .map((token) => {
      const parts = token.split(",");
      if (parts.length < 2 || parts.length > 3)
        throw new CdrRejectedError("مختصات KML معتبر نیست.");
      const lon = parts[0] ?? "";
      const lat = parts[1] ?? "";
      const alt = parts[2];
      if (!NUMBER.test(lon) || !NUMBER.test(lat) || (alt !== undefined && !ALTITUDE.test(alt)))
        throw new CdrRejectedError("مختصات KML معتبر نیست.");
      if (Math.abs(Number(lon)) > 180 || Math.abs(Number(lat)) > 90)
        throw new CdrRejectedError("مختصات KML خارج از محدودهٔ جغرافیایی است.");
      return parts.join(",");
    })
    .join(" ");
}

function firstCoordinates(block: string): string | null {
  const match = /<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/i.exec(block);
  return match ? parseCoordinates(group(match, 1)) : null;
}

/**
 * Rebuilds a KML document containing only Placemarks with a plain-text name,
 * plain-text description and Point / LineString / Polygon geometry made of
 * validated numbers. NetworkLinks, Icons/hrefs, styles, scripts, entities,
 * schemas, extended data and every unknown element are dropped.
 */
export function sanitizeKml(input: string): string {
  if (input.length > MAX_KML_BYTES) throw new CdrRejectedError("حجم فایل KML از حد مجاز بیشتر است.");
  if (input.includes("\0")) throw new CdrRejectedError("فایل KML معتبر نیست.");
  if (/<!DOCTYPE|<!ENTITY|<!ELEMENT|<!ATTLIST/i.test(input))
    throw new CdrRejectedError("فایل KML شامل تعریف DTD/Entity است و پذیرفته نمی‌شود.");
  if (!/<kml[\s>]/i.test(input)) throw new CdrRejectedError("ساختار فایل KML معتبر نیست.");

  const placemarks: string[] = [];
  const pattern = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    if (placemarks.length >= MAX_PLACEMARKS)
      throw new CdrRejectedError("تعداد Placemark در KML از حد مجاز بیشتر است.");
    const body = group(match, 1);
    const name = /<name\b[^>]*>([\s\S]*?)<\/name>/i.exec(body);
    const description = /<description\b[^>]*>([\s\S]*?)<\/description>/i.exec(body);
    const geometries: string[] = [];

    for (const point of body.matchAll(/<Point\b[^>]*>([\s\S]*?)<\/Point>/gi)) {
      const coordinates = firstCoordinates(group(point, 1));
      if (coordinates) geometries.push(`<Point><coordinates>${coordinates}</coordinates></Point>`);
    }
    for (const line of body.matchAll(/<LineString\b[^>]*>([\s\S]*?)<\/LineString>/gi)) {
      const coordinates = firstCoordinates(group(line, 1));
      if (coordinates)
        geometries.push(`<LineString><coordinates>${coordinates}</coordinates></LineString>`);
    }
    for (const polygon of body.matchAll(/<Polygon\b[^>]*>([\s\S]*?)<\/Polygon>/gi)) {
      const polygonBody = group(polygon, 1);
      const outer = /<outerBoundaryIs\b[^>]*>([\s\S]*?)<\/outerBoundaryIs>/i.exec(polygonBody);
      const outerCoordinates = outer ? firstCoordinates(group(outer, 1)) : null;
      if (!outerCoordinates) continue;
      let rings = `<outerBoundaryIs><LinearRing><coordinates>${outerCoordinates}</coordinates></LinearRing></outerBoundaryIs>`;
      for (const inner of polygonBody.matchAll(/<innerBoundaryIs\b[^>]*>([\s\S]*?)<\/innerBoundaryIs>/gi)) {
        const coordinates = firstCoordinates(group(inner, 1));
        if (coordinates)
          rings += `<innerBoundaryIs><LinearRing><coordinates>${coordinates}</coordinates></LinearRing></innerBoundaryIs>`;
      }
      geometries.push(`<Polygon>${rings}</Polygon>`);
    }
    if (!geometries.length) continue;
    placemarks.push(
      `<Placemark>${name ? `<name>${xmlEscape(plainText(group(name, 1), 200))}</name>` : ""}${
        description ? `<description>${xmlEscape(plainText(group(description, 1), 2000))}</description>` : ""
      }${geometries.join("")}</Placemark>`,
    );
  }
  if (!placemarks.length)
    throw new CdrRejectedError("فایل KML هیچ Placemark معتبری ندارد.");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks.join("")}</Document></kml>\n`;
}

/** Names that make a PDF active or able to reach outside itself. */
const ACTIVE_PDF_NAMES =
  /\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|EmbeddedFiles|FileAttachment|RichMedia|XFA|AcroForm|GoToR|GoToE|ImportData|SubmitForm|URI|Movie|Sound|Rendition|3D)\b/;

/**
 * Verifies that a reconstructed PDF is image-only: it must start with the PDF
 * header, contain no action/script/embedded-file/form names, and must not
 * exceed the page limit. Fails closed.
 */
export function assertSafeReconstructedPdf(bytes: Buffer, maxPages: number): number {
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-")
    throw new CdrRejectedError("خروجی بازسازی PDF معتبر نیست.");
  const text = bytes.toString("latin1");
  if (ACTIVE_PDF_NAMES.test(text))
    throw new CdrRejectedError("PDF شامل محتوای فعال است و پذیرفته نمی‌شود.");
  const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  if (pages < 1) throw new CdrRejectedError("PDF هیچ صفحه‌ای ندارد.");
  if (pages > maxPages) throw new CdrRejectedError("تعداد صفحات PDF از حد مجاز بیشتر است.");
  return pages;
}
