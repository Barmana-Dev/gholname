import rateLimit, { type Options, type Store } from "express-rate-limit";
import { createCounterStore } from "./shared-limits.js";

export const RATE_LIMIT_MESSAGE =
  "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.";

type LimiterConfig = Pick<Options, "windowMs" | "limit"> & { store?: Store };

export function createRateLimiter({ windowMs, limit, store }: LimiterConfig) {
  return rateLimit({
    windowMs,
    limit,
    ...(store ? { store } : {}),
    standardHeaders: true,
    legacyHeaders: false,
    // With the default direct-connection mode, ignore client-supplied
    // X-Forwarded-For headers instead of turning them into 500 responses.
    // Express still resolves req.ip from the socket when trust proxy=false.
    validate: { xForwardedForHeader: false },
    handler: (_req, res) => {
      res.status(429).json({
        message: RATE_LIMIT_MESSAGE,
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      });
    },
  });
}

// Every limiter shares the configured store. `config.RATE_LIMIT_STORE=database`
// is mandatory in production precisely so one attacker cannot get N budgets
// from N processes/replicas; leaving these two on the default in-memory store
// silently multiplied the global and API budgets by the number of processes.

/** Covers every backend request, including unknown routes and production assets. */
export const globalRequestLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 600,
  store: createCounterStore("global-ip", 60_000),
});

/** Keeps API enumeration and scraping below the general application budget. */
export const apiRequestLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 240,
  store: createCounterStore("api-ip", 60_000),
});

/** Adds a slower, stricter budget to password and OTP endpoints. */
export const authRequestLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 40,
  // Shared store: counters are common to all processes/replicas in production.
  store: createCounterStore("auth-ip", 15 * 60_000),
});
