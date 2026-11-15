#!/usr/bin/env node
/**
 * Authenticated backup encryption (AES-256-GCM, scrypt-derived key).
 *
 *   BACKUP_ENCRYPTION_PASSWORD=... node backup-crypto.mjs encrypt <in> <out>
 *   BACKUP_ENCRYPTION_PASSWORD=... node backup-crypto.mjs decrypt <in> <out>
 *
 * File layout: "RBK2" | salt(16) | iv(12) | ciphertext | auth tag(16).
 * The 32-byte header is bound to the tag as additional authenticated data, so
 * any modification of the header or the ciphertext makes decryption fail.
 * decrypt() removes its output file when authentication fails.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const MAGIC = Buffer.from("RBK2");
const HEADER_LENGTH = 4 + 16 + 12;
const TAG_LENGTH = 16;

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

function readPassword() {
  const password = process.env.BACKUP_ENCRYPTION_PASSWORD ?? "";
  if (password.length < 16) {
    console.error("BACKUP_ENCRYPTION_PASSWORD must be at least 16 characters.");
    process.exit(2);
  }
  return password;
}

async function writeAll(stream, chunk) {
  if (!chunk.length) return;
  if (!stream.write(chunk)) await new Promise((resolve) => stream.once("drain", resolve));
}

async function closeStream(stream) {
  await new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
}

async function encrypt(input, output) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(readPassword(), salt), iv);
  cipher.setAAD(header);
  const out = fs.createWriteStream(output, { mode: 0o600 });
  await writeAll(out, header);
  for await (const chunk of fs.createReadStream(input)) await writeAll(out, cipher.update(chunk));
  await writeAll(out, cipher.final());
  await writeAll(out, cipher.getAuthTag());
  await closeStream(out);
}

async function decrypt(input, output) {
  const size = fs.statSync(input).size;
  if (size < HEADER_LENGTH + TAG_LENGTH) throw new Error("Backup file is too short.");
  const fd = fs.openSync(input, "r");
  const header = Buffer.alloc(HEADER_LENGTH);
  const tag = Buffer.alloc(TAG_LENGTH);
  fs.readSync(fd, header, 0, HEADER_LENGTH, 0);
  fs.readSync(fd, tag, 0, TAG_LENGTH, size - TAG_LENGTH);
  fs.closeSync(fd);
  if (!header.subarray(0, 4).equals(MAGIC)) throw new Error("Unsupported backup format (not RBK2).");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(readPassword(), header.subarray(4, 20)),
    header.subarray(20, 32),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const out = fs.createWriteStream(output, { mode: 0o600 });
  try {
    if (size > HEADER_LENGTH + TAG_LENGTH)
      for await (const chunk of fs.createReadStream(input, { start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 }))
        await writeAll(out, decipher.update(chunk));
    await writeAll(out, decipher.final()); // throws if authentication fails
    await closeStream(out);
  } catch (error) {
    out.destroy();
    fs.rmSync(output, { force: true });
    throw new Error("Backup authentication failed: wrong password or the file was modified.", { cause: error });
  }
}

const [mode, input, output] = process.argv.slice(2);
if (!["encrypt", "decrypt"].includes(mode) || !input || !output) {
  console.error("Usage: backup-crypto.mjs <encrypt|decrypt> <input> <output>");
  process.exit(2);
}
try {
  await (mode === "encrypt" ? encrypt(input, output) : decrypt(input, output));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
