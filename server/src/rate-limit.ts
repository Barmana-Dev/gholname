import rateLimit, { type Options } from "express-rate-limit";

export const RATE_LIMIT_MESSAGE =
  "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.";

type LimiterConfig = Pick<Options, "windowMs" | "limit">;

export function createRateLimiter({ windowMs, limit }: LimiterConfig) {
  return rateLimit({
    windowMs,
    limit,
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

/** Covers every backend request, including unknown routes and production assets. */
export const globalRequestLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 600,
});

/** Keeps API enumeration and scraping below the general application budget. */
export const apiRequestLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 240,
});

/** Adds a slower, stricter budget to password and OTP endpoints. */
export const authRequestLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 40,
});
