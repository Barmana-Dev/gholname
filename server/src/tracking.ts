import crypto from "node:crypto";
import { config } from "./config.js";
import { normalizeDigits } from "./normalize.js";

export const trackingFileNumberPattern = /^RB-\d{8}-[0-9A-F]{8}$/i;

export function normalizeTrackingFileNumber(value: string): string {
  return normalizeDigits(value).trim().toUpperCase();
}

export function createTrackingToken(
  applicationId: number | string,
  fileNumber: string,
): string {
  return crypto
    .createHmac("sha256", config.JWT_SECRET)
    .update(`regbroker-tracking:v1:${applicationId}:${fileNumber}`)
    .digest("base64url");
}

export function isValidTrackingToken(
  applicationId: number | string,
  fileNumber: string,
  provided: unknown,
): boolean {
  if (typeof provided !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(provided))
    return false;
  const expected = createTrackingToken(applicationId, fileNumber);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

