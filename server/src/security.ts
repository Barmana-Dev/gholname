import crypto from "node:crypto";
import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { decryptField, verifyTotpStep } from "./crypto.js";
import { execute, rows, transaction } from "./db.js";
import type { AuthRequest, AuthUser, RoleCode } from "./types.js";

const roleCodes = new Set<RoleCode>([
  "applicant",
  "representative",
  "registry_expert",
  "surveyor",
  "support",
  "finance",
  "operations_manager",
  "compliance",
  "technical",
  "admin",
  "observer",
]);

export function hydrateSessionUser(
  verified: AuthUser,
  current?: {
    status?: string;
    role?: string;
    name?: string;
    /** Current server-side MFA state; when given it overrides the JWT claim. */
    mfaEnabled?: number | boolean;
  },
): AuthUser | null {
  if (
    !current ||
    current.status !== "active" ||
    !Number.isSafeInteger(Number(verified.id)) ||
    Number(verified.id) <= 0 ||
    !current.name ||
    !roleCodes.has(current.role as RoleCode)
  )
    return null;
  return {
    id: Number(verified.id),
    role: current.role as RoleCode,
    name: current.name,
    // A claim minted while MFA was on is worthless once MFA is switched off.
    mfaVerified:
      current.mfaEnabled === undefined
        ? verified.mfaVerified
        : Boolean(verified.mfaVerified) && Boolean(Number(current.mfaEnabled)),
  };
}

export const SESSION_COOKIE = "regbroker_session";
export const CSRF_COOKIE = "regbroker_csrf";
export const CSRF_HEADER = "x-csrf-token";

const sessionMaxAgeMs = () => config.SESSION_TTL_HOURS * 60 * 60 * 1000;

export function signToken(user: AuthUser, jti: string): string {
  return jwt.sign(user, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: Math.floor(sessionMaxAgeMs() / 1000),
    issuer: "regbroker",
    audience: "regbroker-web",
    jwtid: jti,
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in cookies) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      /* ignore malformed cookie values */
    }
  }
  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly: boolean; maxAgeMs: number; path: string },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeMs / 1000))}`,
    "SameSite=Strict",
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (config.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/**
 * Creates a revocable server-side session and sets the HttpOnly session
 * cookie plus the readable double-submit CSRF cookie. The JWT is never
 * returned in a response body, so scripts (and XSS) cannot read it.
 */
export async function issueSession(
  req: AuthRequest,
  res: Response,
  user: AuthUser,
): Promise<void> {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + sessionMaxAgeMs());
  await execute(
    "INSERT INTO user_sessions (jti,user_id,ip_address,user_agent,expires_at) VALUES (?,?,?,?,?)",
    [
      jti,
      user.id,
      req.ip ?? null,
      req.get("user-agent")?.slice(0, 255) ?? null,
      expiresAt,
    ],
  );
  res.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, signToken(user, jti), {
      httpOnly: true,
      maxAgeMs: sessionMaxAgeMs(),
      path: "/api",
    }),
  );
  res.append(
    "Set-Cookie",
    serializeCookie(CSRF_COOKIE, crypto.randomBytes(32).toString("hex"), {
      httpOnly: false,
      maxAgeMs: sessionMaxAgeMs(),
      path: "/",
    }),
  );
}

export function clearSessionCookies(res: Response): void {
  res.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, "", { httpOnly: true, maxAgeMs: 0, path: "/api" }),
  );
  res.append(
    "Set-Cookie",
    serializeCookie(CSRF_COOKIE, "", { httpOnly: false, maxAgeMs: 0, path: "/" }),
  );
}

export async function revokeSession(jti: string): Promise<void> {
  await execute(
    "UPDATE user_sessions SET revoked_at=NOW() WHERE jti=? AND revoked_at IS NULL",
    [jti],
  );
}

/** Revokes every session of a user, optionally keeping the current one. */
export async function revokeUserSessions(
  userId: number,
  exceptJti?: string,
): Promise<void> {
  await execute(
    "UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL AND (? IS NULL OR jti<>?)",
    [userId, exceptJti ?? null, exceptJti ?? null],
  );
}

export async function purgeExpiredSessions(): Promise<void> {
  await execute(
    "DELETE FROM user_sessions WHERE expires_at<DATE_SUB(NOW(),INTERVAL 7 DAY)",
  );
}

/** Request path without the query string (strict-index safe). */
function requestPath(req: { originalUrl: string }): string {
  return req.originalUrl.split("?")[0] ?? "";
}

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfExemptPaths = new Set(["/api/auth/login", "/api/auth/register"]);

/**
 * Origin check for every state-changing request, plus a double-submit CSRF
 * token for requests authenticated by the session cookie. SameSite=Strict on
 * the cookies is an additional, independent layer.
 */
export function csrfGuard(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!unsafeMethods.has(req.method)) {
    next();
    return;
  }
  const origin = req.get("origin");
  if (origin && origin !== new URL(config.CLIENT_ORIGIN).origin) {
    res.status(403).json({ message: "مبدأ درخواست مجاز نیست." });
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies[SESSION_COOKIE] || csrfExemptPaths.has(requestPath(req))) {
    next();
    return;
  }
  const expected = cookies[CSRF_COOKIE] ?? "";
  const supplied = String(req.get(CSRF_HEADER) ?? "");
  const equal =
    expected.length > 0 &&
    expected.length === supplied.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
  if (!equal) {
    res.status(403).json({ message: "توکن امنیتی درخواست نامعتبر است. صفحه را تازه‌سازی کنید." });
    return;
  }
  next();
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ message: "برای ادامه وارد سامانه شوید." });
    return;
  }
  try {
    const verified = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "regbroker",
      audience: "regbroker-web",
    }) as AuthUser & { jti?: string };
    if (!verified.jti) {
      res.status(401).json({ message: "نشست شما معتبر نیست یا منقضی شده است." });
      return;
    }
    let current;
    try {
      [current] = await rows<any[]>(
        "SELECT u.status,u.full_name name,u.must_change_password mustChange,u.mfa_enabled mfaEnabled,u.mobile_verified_at mobileVerifiedAt,r.code role,s.revoked_at revokedAt,s.expires_at sessionExpiresAt FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN user_sessions s ON s.jti=? AND s.user_id=u.id WHERE u.id=? LIMIT 1",
        [verified.jti, verified.id],
      );
    } catch {
      res.status(503).json({
        message: "سرویس احراز هویت موقتاً در دسترس نیست.",
      });
      return;
    }
    if (
      !current ||
      !current.sessionExpiresAt ||
      current.revokedAt ||
      new Date(current.sessionExpiresAt) <= new Date()
    ) {
      res.status(401).json({ message: "نشست شما معتبر نیست یا منقضی شده است." });
      return;
    }
    const mustChangeAllowed = [
      "/api/auth/me",
      "/api/auth/password/change",
      "/api/auth/logout",
    ];
    if (
      Number(current.mustChange) === 1 &&
      !mustChangeAllowed.includes(requestPath(req))
    ) {
      res.status(403).json({
        message: "پیش از ادامه باید رمز عبور موقت خود را تغییر دهید.",
        mustChangePassword: true,
      });
      return;
    }
    // A session issued before the mobile number was verified is deliberately
    // restricted (see the register/login routes): it may only read its own
    // profile, verify the number, or sign out. Checking here, once, covers
    // every protected route instead of relying on each handler.
    const mobileVerificationAllowed = [
      "/api/auth/me",
      "/api/auth/mobile-otp/request",
      "/api/auth/mobile-otp/verify",
      "/api/auth/logout",
    ];
    if (
      config.REQUIRE_MOBILE_OTP &&
      !current.mobileVerifiedAt &&
      !mobileVerificationAllowed.includes(requestPath(req))
    ) {
      res.status(403).json({
        message:
          "پیش از استفاده از سامانه باید شماره همراه خود را با کد پیامکی تأیید کنید.",
        mobileVerificationRequired: true,
      });
      return;
    }
    const mfaSetupRequired =
      config.REQUIRE_ADMIN_MFA &&
      current.role === "admin" &&
      Number(current.mfaEnabled) !== 1;
    if (
      mfaSetupRequired &&
      ![
        "/api/auth/me",
        "/api/auth/password/change",
        "/api/auth/mfa/setup",
        "/api/auth/mfa/enable",
        "/api/auth/logout",
      ].includes(requestPath(req))
    ) {
      res.status(403).json({
        message: "مدیران باید پیش از ادامه احراز هویت دومرحله‌ای را فعال کنند.",
        mfaSetupRequired: true,
      });
      return;
    }
    const currentUser = hydrateSessionUser(verified, current);
    if (!currentUser) {
      res.status(401).json({ message: "حساب کاربری فعال نیست." });
      return;
    }
    req.user = currentUser;
    req.sessionId = verified.jti;
    next();
  } catch {
    res.status(401).json({ message: "نشست شما معتبر نیست یا منقضی شده است." });
  }
}

/**
 * Step-up authentication for sensitive admin actions: requires the acting
 * user to have MFA enabled *now* and to supply a valid current TOTP code.
 */
export async function verifyStepUp(
  req: AuthRequest,
  otp: unknown,
): Promise<boolean> {
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp) || !req.user) return false;
  const [user] = await rows<any[]>(
    "SELECT mfa_enabled,mfa_secret_encrypted FROM users WHERE id=?",
    [req.user.id],
  );
  if (!user || Number(user.mfa_enabled) !== 1) return false;
  const secret = decryptField(user.mfa_secret_encrypted);
  return Boolean(secret && (await verifyAndConsumeTotp(req.user.id, secret, otp)));
}

/**
 * Verifies a TOTP code and burns its time step, so the same code (even inside
 * its 90-second tolerance window) can never be used twice.
 */
export async function verifyAndConsumeTotp(
  userId: number,
  secret: string,
  code: string,
): Promise<boolean> {
  const step = verifyTotpStep(secret, code);
  if (step === null) return false;
  const result = await execute(
    "UPDATE users SET mfa_last_step=? WHERE id=? AND (mfa_last_step IS NULL OR mfa_last_step<?)",
    [step, userId, step],
  );
  return result.affectedRows === 1;
}

export function authorize(...roles: RoleCode[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res
        .status(403)
        .json({ message: "دسترسی به این بخش برای نقش شما مجاز نیست." });
      return;
    }
    next();
  };
}

const readOnlyMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function enforceReadOnlyRole(...roles: RoleCode[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (
      req.user &&
      roles.includes(req.user.role) &&
      !readOnlyMethods.has(req.method)
    ) {
      res.status(403).json({
        message: "نقش ناظر فقط مجاز به مشاهده اطلاعات است.",
      });
      return;
    }
    next();
  };
}

export async function audit(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: object,
): Promise<void> {
  await transaction(async (connection) => {
    // Lock the current tail while calculating the next hash. This prevents
    // concurrent requests from creating two entries with the same predecessor.
    const [last] = await connection.execute<any[]>(
      "SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1 FOR UPDATE",
    );
    const previousHash = last[0]?.entry_hash ?? null;
    // Every value stored in the row (including IP and user-agent) is part of
    // the hashed payload, and the exact payload is stored with the row so the
    // chain can be re-verified later (see scripts/verify-audit-chain.ts).
    const ipAddress = req.ip ?? null;
    const userAgent = req.get("user-agent")?.slice(0, 255) ?? null;
    const payload = JSON.stringify({
      version: 2,
      actor: req.user?.id ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      ipAddress,
      userAgent,
      previousHash,
      timestamp: new Date().toISOString(),
      metadata: metadata ?? null,
    });
    const entryHash = crypto.createHash("sha256").update(payload).digest("hex");
    await connection.execute(
      "INSERT INTO audit_logs (actor_id,action,entity_type,entity_id,ip_address,user_agent,metadata,previous_hash,entry_hash,entry_payload) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        req.user?.id ?? null,
        action,
        entityType,
        entityId ?? null,
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
        previousHash,
        entryHash,
        payload,
      ],
    );
  });
  if (
    req.user &&
    ["document.download", "application.view", "auth.login_failed"].includes(
      action,
    )
  ) {
    const [activity] = await rows<any[]>(
      "SELECT COUNT(*) count FROM audit_logs WHERE actor_id=? AND action=? AND created_at>=DATE_SUB(NOW(),INTERVAL 5 MINUTE)",
      [req.user.id, action],
    );
    if (Number(activity?.count ?? 0) >= 20) {
      const [existing] = await rows<any[]>(
        "SELECT id FROM security_events WHERE user_id=? AND event_type=? AND status='open' AND created_at>=DATE_SUB(NOW(),INTERVAL 30 MINUTE) LIMIT 1",
        [req.user.id, `high_rate:${action}`],
      );
      if (!existing)
        await execute(
          "INSERT INTO security_events (user_id,event_type,severity,ip_address,details) VALUES (?,?, 'high',?,?)",
          [
            req.user.id,
            `high_rate:${action}`,
            req.ip,
            JSON.stringify({ action, count: Number(activity.count) }),
          ],
        );
    }
  }
}

export function generateCode(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${date}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .slice(0, 120);
}
