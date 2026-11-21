import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
// Workspace commands run each npm workspace with its own cwd. Load the
// repository-level .env explicitly so `npm run dev` and `npm run start -w
// server` use the same XAMPP/database settings as the documented root setup.
dotenv.config({ path: path.resolve(moduleDirectory, "../../.env") });
dotenv.config({ path: path.resolve(moduleDirectory, "../.env") });
dotenv.config();

/**
 * Test runners (and some container bases) export PORT=0 to ask for "any free
 * port". This API serves a fixed documented port, so an empty or zero PORT
 * must fall back to the default instead of aborting every module import with a
 * ZodError (vitest sets PORT=0, which made the whole server test suite fail).
 */
const portNumber = z.preprocess(
  (value) =>
    value === "" || value === "0" || value === 0 ? undefined : value,
  z.coerce.number().int().min(1).max(65535).default(4000),
);

const envBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
}, z.boolean());

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // Enable only when the API is behind a known reverse proxy that rewrites
    // X-Forwarded-* headers. Keeping this false by default prevents client IP
    // spoofing from weakening rate limits and audit trails.
    TRUST_PROXY: envBoolean.default(false),
    PORT: portNumber,
    CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
    DB_HOST: z.string().default("127.0.0.1"),
    DB_PORT: z.coerce.number().int().default(3306),
    DB_USER: z.string().default("root"),
    DB_PASSWORD: z.string().default(""),
    DB_NAME: z.string().default("regbroker"),
    DB_POOL_SIZE: z.coerce.number().int().min(2).max(100).default(10),
    DB_QUEUE_LIMIT: z.coerce.number().int().min(0).max(10_000).default(1_000),
    DB_CONNECT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(60_000)
      .default(10_000),
    JWT_SECRET: z
      .string()
      .min(32)
      .default("development-only-secret-change-this-now"),
    FIELD_ENCRYPTION_KEY: z.string().default(""),
    UPLOAD_DIR: z.string().default("uploads"),
    MAX_FILE_SIZE_MB: z.coerce.number().min(1).max(50).default(10),
    // Upload hardening. clamd (ClamAV) is mandatory in production.
    UPLOAD_SCAN_MODE: z.enum(["off", "clamav"]).default("off"),
    CLAMAV_HOST: z.string().default("127.0.0.1"),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    UPLOAD_DAILY_FILE_LIMIT: z.coerce.number().int().min(1).default(50),
    UPLOAD_DAILY_MB_LIMIT: z.coerce.number().min(1).default(200),
    // Content Disarm & Reconstruction (images via sharp, PDF via Ghostscript
    // pdfimage24, KML via whitelist rebuild). Mandatory in production.
    CDR_MODE: z.enum(["off", "on"]).default("off"),
    GS_BIN: z.string().default("gs"),
    CDR_PDF_DPI: z.coerce.number().int().min(72).max(300).default(150),
    CDR_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(100),
    CDR_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
    UPLOAD_ORPHAN_MIN_AGE_MINUTES: z.coerce.number().int().min(5).default(60),
    SESSION_TTL_HOURS: z.coerce.number().min(1).max(72).default(8),
    // Admin accounts must enrol in MFA before using the panel. Defaults to on
    // in production, off elsewhere (set true/false to override).
    REQUIRE_ADMIN_MFA: envBoolean.optional(),
    // "database" shares login/MFA/upload counters across processes/replicas.
    RATE_LIMIT_STORE: z.enum(["memory", "database"]).default("memory"),
    // TLS to MySQL. Mandatory in production when DB_HOST is not loopback.
    DB_SSL: envBoolean.default(false),
    DB_SSL_CA: z.string().optional(),
    // Optional external anchor for the audit hash chain (HTTPS endpoint).
    AUDIT_ANCHOR_URL: z.string().url().optional(),
    AUDIT_ANCHOR_TOKEN: z.string().optional(),
    // Token required by GET /api/health/details (otherwise it returns 404).
    HEALTH_DETAILS_TOKEN: z.string().min(24).optional(),
    // While this file exists the API answers 503 (used by database/restore.sh).
    MAINTENANCE_FLAG_FILE: z.string().optional(),
    PAYMENT_MODE: z
      .enum(["disabled", "sandbox", "production"])
      .default("disabled"),
    OFFICIAL_LEGAL_ACCOUNT_NAME: z.string().trim().min(3).max(160).optional(),
    OFFICIAL_LEGAL_ACCOUNT_NUMBER: z
      .string()
      .trim()
      .regex(/^\d{5,32}$/)
      .optional(),
    OFFICIAL_LEGAL_IBAN: z
      .string()
      .trim()
      .regex(/^IR\d{24}$/)
      .optional(),
    REGISTRY_API_MODE: z
      .enum(["mock-disabled", "test", "production"])
      .default("mock-disabled"),
    REGISTRY_TEST_API_BASE_URL: z.string().url().optional(),
    REGISTRY_TEST_API_TOKEN: z.string().min(16).optional(),
    REGISTRY_PRODUCTION_API_BASE_URL: z.string().url().optional(),
    REGISTRY_PRODUCTION_API_TOKEN: z.string().min(16).optional(),
    BACKUP_DIR: z.string().default("backups"),
    BACKUP_ENCRYPTION_PASSWORD: z.string().optional(),
    MYSQLDUMP_BIN: z
      .string()
      .default("/Applications/XAMPP/xamppfiles/bin/mysqldump"),
    MONITOR_DISK_PATH: z.string().default("."),
    NOTIFICATION_WEBHOOK_URL: z.string().url().optional(),
    NOTIFICATION_WEBHOOK_TOKEN: z.string().optional(),
    REQUIRE_MOBILE_OTP: envBoolean.default(false),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;
    if (
      value.JWT_SECRET === "development-only-secret-change-this-now" ||
      value.JWT_SECRET.length < 48
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be a unique production secret of at least 48 characters.",
      });
    }
    if (!/^[0-9a-fA-F]{64}$/.test(value.FIELD_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FIELD_ENCRYPTION_KEY"],
        message: "FIELD_ENCRYPTION_KEY must be exactly 64 hexadecimal characters in production.",
      });
    }
    if (new URL(value.CLIENT_ORIGIN).protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLIENT_ORIGIN"],
        message: "CLIENT_ORIGIN must use HTTPS in production.",
      });
    }
    if (
      value.NOTIFICATION_WEBHOOK_URL &&
      new URL(value.NOTIFICATION_WEBHOOK_URL).protocol !== "https:"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NOTIFICATION_WEBHOOK_URL"],
        message: "NOTIFICATION_WEBHOOK_URL must use HTTPS in production.",
      });
    }
    if (value.NOTIFICATION_WEBHOOK_URL && !value.NOTIFICATION_WEBHOOK_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NOTIFICATION_WEBHOOK_TOKEN"],
        message: "NOTIFICATION_WEBHOOK_TOKEN is required when notifications are enabled.",
      });
    }
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(value.DB_HOST);
    if (!loopback && !value.DB_SSL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DB_SSL"],
        message: "A non-local DB_HOST requires DB_SSL=true (TLS with certificate verification) in production.",
      });
    }
    if (value.RATE_LIMIT_STORE !== "database") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RATE_LIMIT_STORE"],
        message: "Production requires RATE_LIMIT_STORE=database so limits are shared between processes.",
      });
    }
    if (value.AUDIT_ANCHOR_URL && new URL(value.AUDIT_ANCHOR_URL).protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUDIT_ANCHOR_URL"],
        message: "AUDIT_ANCHOR_URL must use HTTPS in production.",
      });
    }
    if (value.CDR_MODE !== "on") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CDR_MODE"],
        message: "Production requires CDR_MODE=on (content disarm & reconstruction of uploads).",
      });
    }
    if (value.UPLOAD_SCAN_MODE !== "clamav") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPLOAD_SCAN_MODE"],
        message: "Production requires UPLOAD_SCAN_MODE=clamav (antivirus scanning of uploads).",
      });
    }
    if (value.DB_USER === "root" || !value.DB_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DB_USER"],
        message: "Production must use a dedicated database user with a non-empty password.",
      });
    }
  });

// An empty value in .env (for example `REGISTRY_API_URL=`) means "not set":
// drop it so optional settings are validated as undefined, not as "".
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ""),
);
const parsedConfig = schema.parse(environment);

export const config = {
  ...parsedConfig,
  REQUIRE_ADMIN_MFA:
    parsedConfig.REQUIRE_ADMIN_MFA ?? parsedConfig.NODE_ENV === "production",
  MAINTENANCE_FLAG_FILE:
    parsedConfig.MAINTENANCE_FLAG_FILE ??
    path.resolve(moduleDirectory, "../../.maintenance"),
};

type RegistrySettings = Pick<
  typeof config,
  | "REGISTRY_API_MODE"
  | "REGISTRY_TEST_API_BASE_URL"
  | "REGISTRY_TEST_API_TOKEN"
  | "REGISTRY_PRODUCTION_API_BASE_URL"
  | "REGISTRY_PRODUCTION_API_TOKEN"
>;

export function resolveRegistryConnection(settings: RegistrySettings): {
  baseUrl: string;
  token: string;
} | null {
  if (settings.REGISTRY_API_MODE === "mock-disabled") return null;
  const production = settings.REGISTRY_API_MODE === "production";
  const baseUrl = production
    ? settings.REGISTRY_PRODUCTION_API_BASE_URL
    : settings.REGISTRY_TEST_API_BASE_URL;
  const token = production
    ? settings.REGISTRY_PRODUCTION_API_TOKEN
    : settings.REGISTRY_TEST_API_TOKEN;
  if (!baseUrl || !token) return null;
  if (production && new URL(baseUrl).protocol !== "https:") return null;
  return { baseUrl, token };
}

export function registryConnection(): {
  baseUrl: string;
  token: string;
} | null {
  return resolveRegistryConnection(config);
}
