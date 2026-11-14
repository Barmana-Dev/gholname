import crypto from "node:crypto";
import type { NextFunction, Response } from "express";
import { execute } from "./db.js";
import type { AuthRequest } from "./types.js";

export function requestContext(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.get("x-request-id");
  const requestId =
    incoming && /^[A-Za-z0-9._:-]{8,80}$/.test(incoming)
      ? incoming
      : crypto.randomUUID();
  const started = performance.now();
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Response-Time-Policy", "server-timing");
  res.on("finish", () => {
    const duration = Math.round(performance.now() - started);
    if (req.path.startsWith("/api/"))
      void execute(
        "INSERT INTO api_request_logs (request_id,actor_id,method,path,status_code,duration_ms,ip_address) VALUES (?,?,?,?,?,?,?)",
        [
          requestId,
          req.user?.id ?? null,
          req.method.slice(0, 10),
          req.path.slice(0, 500),
          res.statusCode,
          Math.max(0, duration),
          req.ip,
        ],
      ).catch(() => undefined);
    if (res.statusCode >= 500)
      void execute(
        "INSERT INTO security_events (event_type,severity,ip_address,details) VALUES ('api_server_error','medium',?,?)",
        [
          req.ip,
          JSON.stringify({
            requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
          }),
        ],
      ).catch(() => undefined);
  });
  next();
}
