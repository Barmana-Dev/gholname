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
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
// CORS completes successful preflight requests without calling `next()`. Run
// the same global limiter on OPTIONS first so preflight traffic is covered too.
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return globalRequestLimiter(req, res, next);
  next();
});
app.use(
  cors({
    origin: config.CLIENT_ORIGIN,
    credentials: false,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  }),
);
app.use(globalRequestLimiter);
app.use(express.json({ limit: "1mb" }));
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
app.get("/api/health", async (_req, res) => {
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
  app.use(express.static(clientDist));
  app.get("*", (_req, res) =>
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
