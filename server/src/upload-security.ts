import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { NextFunction, Response } from "express";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { rows } from "./db.js";
import type { AuthRequest } from "./types.js";
import { consumeLimit, createCounterStore } from "./shared-limits.js";
import {
  CdrRejectedError,
  CdrUnavailableError,
  disarmUpload,
  type CdrResult,
} from "./cdr.js";

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
  store: createCounterStore("upload-rate", 15 * 60_000),
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
// A slot that is never released (crash) expires on its own after 10 minutes.
const slotStore = createCounterStore("upload-slot", 10 * 60_000);

export async function uploadConcurrencyGuard(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    next();
    return;
  }
  const key = String(userId);
  try {
    if (!(await consumeLimit(slotStore, key, MAX_CONCURRENT_UPLOADS_PER_USER))) {
      await slotStore.decrement?.(key);
      res.status(429).json({
        message: "بارگذاری‌های هم‌زمان شما از حد مجاز بیشتر است. صبر کنید تا یکی تمام شود.",
      });
      return;
    }
  } catch (error) {
    next(error);
    return;
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    void slotStore.decrement?.(key);
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
  // Case documents and complaint attachments share one daily budget.
  const [usage] = await rows<any[]>(
    `SELECT
       (SELECT COUNT(*) FROM documents WHERE uploaded_by=? AND uploaded_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR))
       + (SELECT COUNT(*) FROM complaint_attachments WHERE uploaded_by=? AND created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) files,
       (SELECT COALESCE(SUM(size_bytes),0) FROM documents WHERE uploaded_by=? AND uploaded_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR))
       + (SELECT COALESCE(SUM(size_bytes),0) FROM complaint_attachments WHERE uploaded_by=? AND created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) bytes`,
    [userId, userId, userId, userId],
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
/* Pre-checks and CDR                                                  */
/* ------------------------------------------------------------------ */

export function inspectUploadContent(filePath: string, mimeType: string): void {
  if (mimeType === "application/vnd.google-earth.kml+xml") {
    const text = fs.readFileSync(filePath, "utf8");
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      throw new UploadRejectedError("فایل KML شامل تعریف DTD/Entity است و پذیرفته نمی‌شود.");
  }
}

/**
 * Runs CDR on the stored upload (after the antivirus scan) and returns the
 * values to persist. Rejections become 422, missing tooling becomes 503.
 */
export async function disarmStoredUpload(
  file: { path: string; mimetype: string },
): Promise<CdrResult> {
  try {
    return await disarmUpload(file.path, file.mimetype);
  } catch (error) {
    if (error instanceof CdrRejectedError)
      throw new UploadRejectedError(error.message, 422);
    if (error instanceof CdrUnavailableError)
      throw new UploadRejectedError(
        "سرویس پاک‌سازی فایل در دسترس نیست؛ بارگذاری رد شد.",
        503,
      );
    throw error;
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
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
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

function sweepOrphans(
  directory: string,
  cutoff: number,
  isReferenced: (storageName: string) => Promise<boolean>,
): Promise<number> {
  return (async () => {
    if (!fs.existsSync(directory)) return 0;
    let removed = 0;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      const filePath = path.join(directory, entry.name);
      if (fs.statSync(filePath).mtimeMs > cutoff) continue;
      if (await isReferenced(entry.name)) continue;
      fs.unlinkSync(filePath);
      removed += 1;
    }
    return removed;
  })();
}

/**
 * Deletes upload files that no database row references: case documents in the
 * upload root and complaint attachments in its "complaints" sub-directory.
 */
export async function cleanupOrphanUploads(
  root = path.resolve(config.UPLOAD_DIR),
  minAgeMinutes = config.UPLOAD_ORPHAN_MIN_AGE_MINUTES,
): Promise<number> {
  const cutoff = Date.now() - minAgeMinutes * 60_000;
  const documents = await sweepOrphans(root, cutoff, async (name) => {
    const [known] = await rows<any[]>(
      "SELECT id FROM documents WHERE storage_name=? LIMIT 1",
      [name],
    );
    return Boolean(known);
  });
  const attachments = await sweepOrphans(
    path.join(root, "complaints"),
    cutoff,
    async (name) => {
      const [known] = await rows<any[]>(
        "SELECT id FROM complaint_attachments WHERE storage_name=? LIMIT 1",
        [name],
      );
      return Boolean(known);
    },
  );
  return documents + attachments;
}
