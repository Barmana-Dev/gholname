import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { NextFunction, Response } from "express";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { rows } from "./db.js";
import type { AuthRequest } from "./types.js";

export class UploadRejectedError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UploadRejectedError";
  }
}

/* ------------------------------------------------------------------ */
/* Dedicated limiter + per-user concurrency                            */
/* ------------------------------------------------------------------ */

/** 30 uploads per 15 minutes per authenticated user (IP when anonymous). */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) =>
    (req as AuthRequest).user ? `u:${(req as AuthRequest).user!.id}` : `ip:${req.ip}`,
  handler: (_req, res) => {
    res.status(429).json({
      message: "تعداد بارگذاری‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
    });
  },
});

const MAX_CONCURRENT_UPLOADS_PER_USER = 2;
const inFlight = new Map<number, number>();

export function uploadConcurrencyGuard(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.user?.id;
  if (!userId) {
    next();
    return;
  }
  const current = inFlight.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT_UPLOADS_PER_USER) {
    res.status(429).json({
      message: "بارگذاری‌های هم‌زمان شما از حد مجاز بیشتر است. صبر کنید تا یکی تمام شود.",
    });
    return;
  }
  inFlight.set(userId, current + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const left = (inFlight.get(userId) ?? 1) - 1;
    if (left <= 0) inFlight.delete(userId);
    else inFlight.set(userId, left);
  };
  res.on("finish", release);
  res.on("close", release);
  next();
}

/* ------------------------------------------------------------------ */
/* Per-user daily quota                                                */
/* ------------------------------------------------------------------ */

export async function enforceUploadQuota(
  userId: number,
  incomingBytes: number,
): Promise<void> {
  const [usage] = await rows<any[]>(
    "SELECT COUNT(*) files, COALESCE(SUM(size_bytes),0) bytes FROM documents WHERE uploaded_by=? AND uploaded_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)",
    [userId],
  );
  const files = Number(usage?.files ?? 0);
  const bytes = Number(usage?.bytes ?? 0);
  if (files >= config.UPLOAD_DAILY_FILE_LIMIT)
    throw new UploadRejectedError(
      "سهمیهٔ روزانهٔ تعداد فایل‌های بارگذاری‌شده تکمیل شده است.",
      429,
    );
  if (bytes + incomingBytes > config.UPLOAD_DAILY_MB_LIMIT * 1024 * 1024)
    throw new UploadRejectedError(
      "سهمیهٔ روزانهٔ حجم بارگذاری تکمیل شده است.",
      429,
    );
}

/* ------------------------------------------------------------------ */
/* ZIP structural inspection (never extracts anything)                 */
/* ------------------------------------------------------------------ */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_ENTRY_COMPRESSION_RATIO = 100;

export function inspectZipBuffer(
  buffer: Buffer,
  limits = {
    maxEntries: config.UPLOAD_ZIP_MAX_ENTRIES,
    maxUncompressedBytes: config.UPLOAD_ZIP_MAX_UNCOMPRESSED_MB * 1024 * 1024,
  },
): void {
  const bad = (message: string) => new UploadRejectedError(message);
  let eocd = -1;
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw bad("ساختار فایل ZIP معتبر نیست.");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (
    entryCount === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  )
    throw bad("فایل‌های ZIP64 پذیرفته نمی‌شوند.");
  if (entryCount === 0 || entryCount > limits.maxEntries)
    throw bad("تعداد فایل‌های داخل ZIP مجاز نیست.");
  if (directoryOffset + directorySize > buffer.length)
    throw bad("ساختار فایل ZIP معتبر نیست.");

  let cursor = directoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE
    )
      throw bad("ساختار فایل ZIP معتبر نیست.");
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    if (flags & 0x1) throw bad("فایل‌های ZIP رمزگذاری‌شده پذیرفته نمی‌شوند.");
    if (
      name.startsWith("/") ||
      name.startsWith("\\") ||
      /^[A-Za-z]:/.test(name) ||
      name.split(/[\\/]/).includes("..") ||
      name.includes("\0")
    )
      throw bad("نام یکی از فایل‌های داخل ZIP مجاز نیست.");
    if (/\.(exe|dll|bat|cmd|com|scr|js|jse|vbs|ps1|msi|jar|sh|zip|rar|7z)$/i.test(name))
      throw bad("نوع یکی از فایل‌های داخل ZIP مجاز نیست.");
    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > MAX_ENTRY_COMPRESSION_RATIO
    )
      throw bad("نسبت فشرده‌سازی ZIP مشکوک است.");
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes)
      throw bad("حجم باز‌شدهٔ ZIP از حد مجاز بیشتر است.");
    cursor += 46 + nameLength + extraLength + commentLength;
  }
}

export function inspectKmlText(text: string): void {
  // Entities/DTDs enable XXE and "billion laughs" expansion attacks.
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new UploadRejectedError("فایل KML شامل تعریف DTD/Entity است و پذیرفته نمی‌شود.");
  if (/<script[\s>]|javascript:/i.test(text))
    throw new UploadRejectedError("محتوای فایل KML مجاز نیست.");
}

export function inspectUploadContent(filePath: string, mimeType: string): void {
  if (mimeType === "application/zip") {
    inspectZipBuffer(fs.readFileSync(filePath));
    return;
  }
  if (mimeType === "application/vnd.google-earth.kml+xml") {
    inspectKmlText(fs.readFileSync(filePath, "utf8"));
  }
}

/* ------------------------------------------------------------------ */
/* Antivirus (ClamAV clamd INSTREAM, fail-closed)                      */
/* ------------------------------------------------------------------ */

export async function scanUploadWithClamav(
  filePath: string,
  options: { host?: string; port?: number; timeoutMs?: number } = {},
): Promise<void> {
  const host = options.host ?? config.CLAMAV_HOST;
  const port = options.port ?? config.CLAMAV_PORT;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const data = fs.readFileSync(filePath);
  const verdict = await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error("clamd timeout"));
    });
    socket.on("error", reject);
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("close", () => resolve(Buffer.concat(chunks).toString().trim()));
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const CHUNK = 64 * 1024;
      for (let offset = 0; offset < data.length; offset += CHUNK) {
        const part = data.subarray(offset, offset + CHUNK);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(part.length);
        socket.write(length);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
    });
  }).catch(() => {
    throw new UploadRejectedError(
      "اسکن امنیتی فایل در حال حاضر در دسترس نیست؛ بارگذاری رد شد.",
      503,
    );
  });
  if (/FOUND/.test(verdict))
    throw new UploadRejectedError("فایل توسط اسکن ضدویروس رد شد.", 422);
  if (!/OK/.test(verdict))
    throw new UploadRejectedError(
      "نتیجهٔ اسکن امنیتی فایل نامعتبر بود؛ بارگذاری رد شد.",
      503,
    );
}

export async function scanUpload(filePath: string): Promise<void> {
  if (config.UPLOAD_SCAN_MODE === "off") return;
  await scanUploadWithClamav(filePath);
}

/* ------------------------------------------------------------------ */
/* Orphan cleanup                                                      */
/* ------------------------------------------------------------------ */

/** Deletes top-level upload files that no document row references. */
export async function cleanupOrphanUploads(
  root = path.resolve(config.UPLOAD_DIR),
  minAgeMinutes = config.UPLOAD_ORPHAN_MIN_AGE_MINUTES,
): Promise<number> {
  const cutoff = Date.now() - minAgeMinutes * 60_000;
  let removed = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const filePath = path.join(root, entry.name);
    if (fs.statSync(filePath).mtimeMs > cutoff) continue;
    const [known] = await rows<any[]>(
      "SELECT id FROM documents WHERE storage_name=? LIMIT 1",
      [entry.name],
    );
    if (known) continue;
    fs.unlinkSync(filePath);
    removed += 1;
  }
  return removed;
}
