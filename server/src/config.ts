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
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
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
    if (value.DB_USER === "root" || !value.DB_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DB_USER"],
        message: "Production must use a dedicated database user with a non-empty password.",
      });
    }
  });

export const config = schema.parse(process.env);

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
