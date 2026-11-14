import crypto from "node:crypto";
import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
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
  current?: { status?: string; role?: string; name?: string },
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
    mfaVerified: verified.mfaVerified,
  };
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.JWT_SECRET, {
    expiresIn: "8h",
    issuer: "regbroker",
    audience: "regbroker-web",
  });
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "برای ادامه وارد سامانه شوید." });
    return;
  }
  try {
    const verified = jwt.verify(header.slice(7), config.JWT_SECRET, {
      issuer: "regbroker",
      audience: "regbroker-web",
    }) as AuthUser;
    let current;
    try {
      [current] = await rows<any[]>(
        "SELECT u.status,u.full_name name,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? LIMIT 1",
        [verified.id],
      );
    } catch {
      res.status(503).json({
        message: "سرویس احراز هویت موقتاً در دسترس نیست.",
      });
      return;
    }
    const currentUser = hydrateSessionUser(verified, current);
    if (!currentUser) {
      res.status(401).json({ message: "حساب کاربری فعال نیست." });
      return;
    }
    req.user = currentUser;
    next();
  } catch {
    res.status(401).json({ message: "نشست شما معتبر نیست یا منقضی شده است." });
  }
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
    const payload = JSON.stringify({
      actor: req.user?.id ?? null,
      action,
      entityType,
      entityId,
      previousHash,
      timestamp: new Date().toISOString(),
      metadata: metadata ?? null,
    });
    const entryHash = crypto.createHash("sha256").update(payload).digest("hex");
    await connection.execute(
      "INSERT INTO audit_logs (actor_id,action,entity_type,entity_id,ip_address,user_agent,metadata,previous_hash,entry_hash) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        req.user?.id ?? null,
        action,
        entityType,
        entityId ?? null,
        req.ip,
        req.get("user-agent")?.slice(0, 255) ?? null,
        metadata ? JSON.stringify(metadata) : null,
        previousHash,
        entryHash,
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
