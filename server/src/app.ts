import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { adminRouter } from "./routes/admin.js";
import { applicationsRouter } from "./routes/applications.js";
import { authRouter } from "./routes/auth.js";
import { complaintsRouter } from "./routes/complaints.js";
import { publicRouter } from "./routes/public.js";
import { operationsRouter } from "./routes/operations.js";
import { integrationsRouter } from "./routes/integrations.js";
import { internalControlsRouter } from "./routes/internal-controls.js";
import { config } from "./config.js";
import { rows } from "./db.js";
import { normalizeRequestValue } from "./normalize.js";
import { requestContext } from "./request-context.js";
import { csrfGuard } from "./security.js";
import {
  apiRequestLimiter,
  authRequestLimiter,
  globalRequestLimiter,
} from "./rate-limit.js";

export const app = express();
app.disable("x-powered-by");
// Trust exactly one infrastructure proxy when enabled; never trust an
// arbitrary chain because the rate limiter keys requests by the resolved IP.
app.set("trust proxy", config.TRUST_PROXY ? 1 : false);
app.use(requestContext);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'none'"],
        "frame-ancestors": ["'none'"],
        "form-action": ["'self'"],
        ...(config.NODE_ENV === "production" ? {} : { "upgrade-insecure-requests": null }),
      },
    },
    referrerPolicy: { policy: "no-referrer" },
    strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  }),
);
// Permissions-Policy: nothing in this application needs device APIs.
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  next();
});
// database/restore.sh creates this file while a restore is running. The check
// is cached for one second so it costs one stat() per second, not per request.
let maintenanceCheckedAt = 0;
let maintenanceActive = false;
app.use((_req, res, next) => {
  const now = Date.now();
  if (now - maintenanceCheckedAt > 1000) {
    maintenanceCheckedAt = now;
    maintenanceActive = fs.existsSync(config.MAINTENANCE_FLAG_FILE);
  }
  if (maintenanceActive) {
    res.status(503).set("Retry-After", "120").json({
      message: "سامانه برای نگه‌داری موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.",
    });
    return;
  }
  next();
});
// API responses contain personal data: never let a browser or proxy cache them.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});
// CORS completes successful preflight requests without calling `next()`. Run
// the same global limiter on OPTIONS first so preflight traffic is covered too.
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return globalRequestLimiter(req, res, next);
  next();
});
app.use(
  cors({
    origin: config.CLIENT_ORIGIN,
    // The session lives in an HttpOnly cookie, so credentialed CORS is limited
    // to the single configured client origin.
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    // The client reads the applied page size from X-Page-Size to decide
    // whether more rows exist. Without exposing it, a cross-origin client can
    // never see the header and silently treats page 1 as the complete list.
    exposedHeaders: ["X-Page", "X-Page-Size", "X-Request-Id"],
  }),
);
app.use(globalRequestLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(csrfGuard);
app.use((req, _res, next) => {
  if (req.body) req.body = normalizeRequestValue(req.body);
  if (req.query)
    req.query = normalizeRequestValue(req.query) as typeof req.query;
  next();
});
app.use(
  "/api/auth",
  authRequestLimiter,
  authRouter,
);
app.use("/api", apiRequestLimiter);
// Public liveness: no environment name, no dependency details.
app.get("/api/health", async (_req, res) => {
  try {
    await rows<any[]>("SELECT 1 AS connected");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "degraded" });
  }
});
// Readiness/diagnostics: only for callers holding HEALTH_DETAILS_TOKEN
// (internal monitoring). Anyone else gets an indistinguishable 404.
app.get("/api/health/details", async (req, res) => {
  const expected = config.HEALTH_DETAILS_TOKEN;
  const supplied = String(req.get("x-health-token") ?? "");
  const authorized =
    Boolean(expected) &&
    supplied.length === expected!.length &&
    crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected!));
  if (!authorized)
    return res.status(404).json({ message: "مسیر درخواستی پیدا نشد." });
  try {
    await rows<any[]>("SELECT 1 AS connected");
    res.json({
      status: "ok",
      database: "connected",
      environment: config.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});
app.use("/api/public", publicRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/complaints", complaintsRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/internal-controls", internalControlsRouter);
app.use("/api/admin", adminRouter);
if (config.NODE_ENV === "production") {
  const clientDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../client/dist",
  );
  app.use(express.static(clientDist, { dotfiles: "ignore", index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/).*/, (_req, res) =>
    res.sendFile(path.join(clientDist, "index.html")),
  );
}
app.use((_req, res) =>
  res.status(404).json({ message: "مسیر درخواستی پیدا نشد." }),
);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  if (error instanceof ZodError)
    return res.status(400).json({
      message: "اطلاعات ورودی معتبر نیست.",
      errors: error.flatten().fieldErrors,
    });
  if (error instanceof Error && error.name === "MulterError")
    return res
      .status(400)
      .json({ message: "فایل از محدودیت مجاز عبور کرده است." });
  if (error instanceof Error && error.message.includes("Unexpected field"))
    return res.status(400).json({ message: "فیلد فایل معتبر نیست." });
  if (config.NODE_ENV !== "test") console.error(error);
  res.status(500).json({
    message: "خطای داخلی رخ داد. شناسه رخداد در گزارش سامانه ثبت شد.",
  });
});
