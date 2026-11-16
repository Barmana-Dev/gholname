import crypto from "node:crypto";
import { config } from "./config.js";

function encryptionKey(): Buffer {
  if (/^[a-fA-F0-9]{64}$/.test(config.FIELD_ENCRYPTION_KEY))
    return Buffer.from(config.FIELD_ENCRYPTION_KEY, "hex");
  if (config.NODE_ENV === "production")
    throw new Error(
      "FIELD_ENCRYPTION_KEY must be a 64-character hex key in production",
    );
  return crypto.createHash("sha256").update(config.JWT_SECRET).digest();
}

export function encryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("enc:v1:")) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("enc:v1:")) return value;
  const [, , ivText, tagText, ciphertextText] = value.split(":");
  if (!ivText || !tagText || !ciphertextText)
    throw new Error("Encrypted field format is invalid");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function blindIndex(value: string): string {
  return crypto
    .createHmac("sha256", encryptionKey())
    .update(value.trim().toLowerCase())
    .digest("hex");
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Buffer): string {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i < bits.length; i += 5)
    output += alphabet[Number.parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return output;
}

function base32Decode(value: string): Buffer {
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 value");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpCode(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto
    .createHmac("sha1", base32Decode(secret))
    .update(buffer)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    (((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff)) %
    1_000_000;
  return String(code).padStart(6, "0");
}

/** Returns the matching 30-second time step, or null when the code is wrong. */
export function verifyTotpStep(secret: string, code: string): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Date.now();
  let matched: number | null = null;
  for (const offset of [-1, 0, 1]) {
    const expected = totpCode(secret, now + offset * 30_000);
    // Evaluate every window (no early exit) to keep timing uniform.
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code)))
      matched = Math.floor((now + offset * 30_000) / 30_000);
  }
  return matched;
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((offset) => {
    const expected = totpCode(secret, Date.now() + offset * 30_000);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code));
  });
}

export function createRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(5).toString("hex").toUpperCase(),
  );
  return { codes, hashes: codes.map((code) => blindIndex(code)) };
}
