import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";
import {
  CdrRejectedError,
  assertSafeReconstructedPdf,
  sanitizeKml,
} from "./cdr-pure.js";

export { CdrRejectedError } from "./cdr-pure.js";

export class CdrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CdrUnavailableError";
  }
}

export interface CdrResult {
  sizeBytes: number;
  sha256: string;
  originalSha256: string;
}

const execFileAsync = promisify(execFile);
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_OUTPUT_BYTES = 40 * 1024 * 1024;

function sha256Of(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function replaceFile(target: string, bytes: Buffer): void {
  const temporary = `${target}.cdr-tmp`;
  fs.writeFileSync(temporary, bytes, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

/** The small part of the sharp API used here (keeps typing independent of sharp's typings). */
interface SharpPipeline {
  metadata(): Promise<{ format?: string; pages?: number }>;
  rotate(): SharpPipeline;
  jpeg(options: object): SharpPipeline;
  png(options: object): SharpPipeline;
  webp(options: object): SharpPipeline;
  toBuffer(): Promise<Buffer>;
}
type SharpFactory = (input: Buffer, options?: object) => SharpPipeline;

async function loadSharp(): Promise<SharpFactory> {
  try {
    // A variable specifier keeps the optional native dependency out of the
    // type-check/bundle graph; a missing install is reported at runtime.
    const specifier = "sharp";
    const loaded = (await import(specifier)) as { default?: unknown };
    return (loaded.default ?? loaded) as SharpFactory;
  } catch {
    throw new CdrUnavailableError("کتابخانهٔ پردازش تصویر (sharp) نصب نیست.");
  }
}

async function reconstructImage(input: Buffer, mimeType: string): Promise<Buffer> {
  const sharp = await loadSharp();
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const expected = formats[mimeType];
  try {
    const source = sharp(input, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: "error",
      pages: 1,
    });
    const metadata = await source.metadata();
    if (metadata.format !== expected)
      throw new CdrRejectedError("نوع واقعی تصویر با نوع اعلام‌شده سازگار نیست.");
    if ((metadata.pages ?? 1) > 1)
      throw new CdrRejectedError("تصاویر چندفریمی/متحرک پذیرفته نمی‌شوند.");
    // Re-encoding from decoded pixels drops EXIF/XMP/ICC blobs, comments,
    // appended payloads and any polyglot content. Orientation is applied first.
    const pipeline = source.rotate();
    const output =
      expected === "jpeg"
        ? pipeline.jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
        : expected === "png"
          ? pipeline.png({ compressionLevel: 9 })
          : pipeline.webp({ quality: 90 });
    return await output.toBuffer();
  } catch (error) {
    if (error instanceof CdrRejectedError) throw error;
    throw new CdrRejectedError("تصویر قابل بازسازی نیست یا آسیب دیده است.");
  }
}

async function reconstructPdf(input: Buffer): Promise<Buffer> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cdr-"));
  try {
    const source = path.join(directory, "in.pdf");
    const target = path.join(directory, "out.pdf");
    fs.writeFileSync(source, input, { mode: 0o600 });
    try {
      // pdfimage24 renders every page to pixels and writes a NEW PDF that only
      // contains those images: JavaScript, actions, forms, links, embedded files,
      // fonts and hidden layers cannot survive. -dSAFER blocks file/pipe access.
      await execFileAsync(
        config.GS_BIN,
        [
          "-dSAFER",
          "-dBATCH",
          "-dNOPAUSE",
          "-dNOPROMPT",
          "-dQUIET",
          "-dNOTRANSPARENCY",
          "-sDEVICE=pdfimage24",
          `-r${config.CDR_PDF_DPI}`,
          "-dFirstPage=1",
          `-dLastPage=${config.CDR_MAX_PAGES + 1}`,
          `-sOutputFile=${target}`,
          source,
        ],
        {
          cwd: directory,
          timeout: config.CDR_TIMEOUT_MS,
          killSignal: "SIGKILL",
          maxBuffer: 1024 * 1024,
          env: { PATH: process.env.PATH ?? "", HOME: directory, TMPDIR: directory },
        },
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT")
        throw new CdrUnavailableError("Ghostscript روی سرور نصب نیست.");
      throw new CdrRejectedError("PDF قابل بازسازی نیست، آسیب دیده است یا زمان پردازش آن بیش از حد بود.");
    }
    if (!fs.existsSync(target)) throw new CdrRejectedError("بازسازی PDF ناموفق بود.");
    if (fs.statSync(target).size > MAX_OUTPUT_BYTES)
      throw new CdrRejectedError("حجم PDF بازسازی‌شده از حد مجاز بیشتر است.");
    const output = fs.readFileSync(target);
    assertSafeReconstructedPdf(output, config.CDR_MAX_PAGES);
    return output;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Content Disarm & Reconstruction. The stored file is replaced IN PLACE by a
 * reconstruction built only from content that survived decoding; the original
 * bytes are not retained, but their SHA-256 is returned for the audit trail.
 */
export async function disarmUpload(filePath: string, mimeType: string): Promise<CdrResult> {
  const original = fs.readFileSync(filePath);
  const originalSha256 = sha256Of(original);
  if (config.CDR_MODE === "off")
    return { sizeBytes: original.length, sha256: originalSha256, originalSha256 };

  let rebuilt: Buffer;
  if (mimeType === "application/pdf") rebuilt = await reconstructPdf(original);
  else if (mimeType.startsWith("image/")) rebuilt = await reconstructImage(original, mimeType);
  else if (mimeType === "application/vnd.google-earth.kml+xml")
    rebuilt = Buffer.from(sanitizeKml(original.toString("utf8")), "utf8");
  else throw new CdrRejectedError("نوع فایل برای پاک‌سازی پشتیبانی نمی‌شود.");

  if (!rebuilt.length) throw new CdrRejectedError("بازسازی فایل خروجی خالی داد.");
  replaceFile(filePath, rebuilt);
  return { sizeBytes: rebuilt.length, sha256: sha256Of(rebuilt), originalSha256 };
}
