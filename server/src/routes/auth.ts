import bcrypt from "bcrypt";
import { Router } from "express";
import { execute, rows, transaction } from "../db.js";
import { audit, authenticate, signToken } from "../security.js";
import type { AuthRequest } from "../types.js";
import { loginSchema, registerSchema } from "../validation.js";
import { capabilitiesForRole } from "../access.js";
import {
  blindIndex,
  createRecoveryCodes,
  decryptField,
  encryptField,
  generateTotpSecret,
  verifyTotp,
} from "../crypto.js";
import { z } from "zod";
import crypto from "node:crypto";
import { sendSms } from "../notifications.js";
import { config } from "../config.js";

export const authRouter = Router();

authRouter.post("/register", async (req: AuthRequest, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    // Keep installations that have not yet applied migration 007 operational;
    // this is an internal, non-contact identifier and is never requested from
    // the public form.
    const accountEmail =
      input.email?.toLowerCase() ?? `${input.mobile}@mobile.regbroker.local`;
    const nationalIdHash = blindIndex(input.nationalId);
    const existing = await rows<any[]>(
      "SELECT id FROM users WHERE email=? OR mobile=? OR national_id_hash=? OR national_id=? LIMIT 1",
      [
        accountEmail,
        input.mobile,
        nationalIdHash,
        input.nationalId,
      ],
    );
    if (existing.length)
      return res
        .status(409)
        .json({ message: "حسابی با این موبایل یا کد ملی وجود دارد." });
    const [role] = await rows<any[]>(
      "SELECT id FROM roles WHERE code='applicant' LIMIT 1",
    );
    if (!role)
      return res
        .status(503)
        .json({ message: "نقش متقاضی در پایگاه داده پیکربندی نشده است." });
    const passwordHash = await bcrypt.hash(input.password, 12);
    const userId = await transaction(async (connection) => {
      const [result] = await connection.execute<any>(
        "INSERT INTO users (role_id,full_name,national_id,national_id_hash,email,mobile,person_type,organization_name,organization_national_id,organization_national_id_hash,password_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
          role.id,
          input.fullName,
          encryptField(input.nationalId),
          nationalIdHash,
          accountEmail,
          input.mobile,
          input.personType,
          input.organizationName ?? null,
          encryptField(input.organizationNationalId),
          input.organizationNationalId
            ? blindIndex(input.organizationNationalId)
            : null,
          passwordHash,
        ],
      );
      for (const consentType of ["terms", "privacy", "data_accuracy"]) {
        await connection.execute(
          "INSERT INTO user_consents (user_id,consent_type,document_version,ip_address) VALUES (?,?,?,?)",
          [result.insertId, consentType, "2026-08-01", req.ip],
        );
      }
      return result.insertId as number;
    });
    req.user = { id: userId, role: "applicant", name: input.fullName };
    await audit(req, "auth.register", "user", String(userId));
    res.status(201).json({
      token: signToken(req.user),
      user: { ...req.user, capabilities: capabilitiesForRole(req.user.role) },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req: AuthRequest, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const loginIdentifier = input.mobile ?? input.email ?? "";
    const [user] = await rows<any[]>(
      `SELECT u.id,u.full_name,u.password_hash,u.status,u.failed_login_count,u.locked_until,u.mobile_verified_at,u.mfa_enabled,u.mfa_secret_encrypted,u.mfa_recovery_codes,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE ${input.mobile ? "u.mobile=?" : "u.email=?"} LIMIT 1`,
      [loginIdentifier.toLowerCase()],
    );
    const blocked =
      user?.locked_until && new Date(user.locked_until) > new Date();
    if (
      !user ||
      user.status !== "active" ||
      blocked ||
      !(await bcrypt.compare(input.password, user.password_hash))
    ) {
      if (user && !blocked)
        await execute(
          "UPDATE users SET failed_login_count=failed_login_count+1, locked_until=IF(failed_login_count>=4,DATE_ADD(NOW(),INTERVAL 15 MINUTE),locked_until) WHERE id=?",
          [user.id],
        );
      req.user = user
        ? { id: user.id, role: user.role, name: user.full_name }
        : undefined;
      await audit(
        req,
        "auth.login_failed",
        "user",
        user ? String(user.id) : undefined,
        {
          identifier: loginIdentifier.toLowerCase(),
          blocked: Boolean(blocked),
        },
      );
      return res.status(401).json({
        message: "اطلاعات ورود صحیح نیست یا حساب موقتاً قفل شده است.",
      });
    }
    if (config.REQUIRE_MOBILE_OTP && !user.mobile_verified_at)
      return res.status(403).json({
        message: "تأیید رسمی شماره همراه پیش از ورود الزامی است.",
        mobileVerificationRequired: true,
      });
    if (user.mfa_enabled) {
      const secret = decryptField(user.mfa_secret_encrypted);
      const recoveryHashes: string[] = user.mfa_recovery_codes
        ? typeof user.mfa_recovery_codes === "string"
          ? JSON.parse(user.mfa_recovery_codes)
          : user.mfa_recovery_codes
        : [];
      const recoveryIndex = input.recoveryCode
        ? recoveryHashes.indexOf(blindIndex(input.recoveryCode))
        : -1;
      const verified =
        Boolean(secret && input.otp && verifyTotp(secret, input.otp)) ||
        recoveryIndex >= 0;
      if (!verified) {
        await audit(req, "auth.mfa_failed", "user", String(user.id));
        return res.status(input.otp || input.recoveryCode ? 401 : 202).json({
          mfaRequired: true,
          message:
            input.otp || input.recoveryCode
              ? "کد احراز هویت دومعتبر نیست."
              : "کد احراز هویت دومرحله‌ای الزامی است.",
        });
      }
      if (recoveryIndex >= 0) {
        recoveryHashes.splice(recoveryIndex, 1);
        await execute("UPDATE users SET mfa_recovery_codes=? WHERE id=?", [
          JSON.stringify(recoveryHashes),
          user.id,
        ]);
      }
    }
    await execute(
      "UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=NOW() WHERE id=?",
      [user.id],
    );
    req.user = {
      id: user.id,
      role: user.role,
      name: user.full_name,
      mfaVerified: Boolean(user.mfa_enabled),
    };
    await audit(req, "auth.login", "user", String(user.id));
    res.json({
      token: signToken(req.user),
      user: { ...req.user, capabilities: capabilitiesForRole(req.user.role) },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const [user] = await rows<any[]>(
      "SELECT u.id,u.full_name fullName,u.email,u.mobile,u.mobile_verified_at mobileVerifiedAt,u.national_id nationalId,u.person_type personType,u.organization_name organizationName,u.organization_national_id organizationNationalId,u.mfa_enabled mfaEnabled,r.code role,r.title_fa roleTitle FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?",
      [req.user!.id],
    );
    if (!user) return res.status(404).json({ message: "کاربر پیدا نشد." });
    res.json({
      ...user,
      nationalId: decryptField(user.nationalId),
      organizationNationalId: decryptField(user.organizationNationalId),
      capabilities: capabilitiesForRole(user.role),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/logout",
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      await audit(req, "auth.logout", "user", String(req.user!.id));
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.patch("/me", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const input = z
      .object({
        fullName: z.string().trim().min(3).max(150).optional(),
        email: z.string().email().max(190).optional(),
        mobile: z
          .string()
          .regex(/^09\d{9}$/)
          .optional(),
        organizationName: z
          .string()
          .trim()
          .min(3)
          .max(190)
          .nullable()
          .optional(),
      })
      .refine((value) => Object.keys(value).length > 0)
      .parse(req.body);
    if (input.email || input.mobile) {
      const duplicate = await rows<any[]>(
        "SELECT id FROM users WHERE id<>? AND (email=COALESCE(?,email) OR mobile=COALESCE(?,mobile)) LIMIT 1",
        [
          req.user!.id,
          input.email?.toLowerCase() ?? null,
          input.mobile ?? null,
        ],
      );
      if (duplicate.length)
        return res
          .status(409)
          .json({ message: "ایمیل یا موبایل قبلاً ثبت شده است." });
    }
    await execute(
      "UPDATE users SET full_name=COALESCE(?,full_name),email=COALESCE(?,email),mobile=COALESCE(?,mobile),organization_name=CASE WHEN ? THEN ? ELSE organization_name END WHERE id=?",
      [
        input.fullName ?? null,
        input.email?.toLowerCase() ?? null,
        input.mobile ?? null,
        Object.prototype.hasOwnProperty.call(input, "organizationName"),
        input.organizationName ?? null,
        req.user!.id,
      ],
    );
    await audit(req, "profile.update", "user", String(req.user!.id), {
      fields: Object.keys(input),
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/password/change",
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: z
            .string()
            .min(12)
            .max(128)
            .regex(/[A-Z]/)
            .regex(/[a-z]/)
            .regex(/\d/)
            .regex(/[^A-Za-z0-9]/),
          otp: z.string().regex(/^\d{6}$/).optional(),
        })
        .refine((value) => value.currentPassword !== value.newPassword, {
          path: ["newPassword"],
          message: "رمز جدید باید با رمز فعلی متفاوت باشد.",
        })
        .parse(req.body);
      const [user] = await rows<any[]>(
        "SELECT password_hash,mfa_enabled,mfa_secret_encrypted FROM users WHERE id=?",
        [req.user!.id],
      );
      const currentPasswordValid =
        user && (await bcrypt.compare(input.currentPassword, user.password_hash));
      const secondFactorValid =
        !user?.mfa_enabled ||
        Boolean(
          input.otp &&
            verifyTotp(decryptField(user.mfa_secret_encrypted) ?? "", input.otp),
        );
      if (!currentPasswordValid || !secondFactorValid) {
        await audit(req, "auth.password_change_failed", "user", String(req.user!.id));
        return res.status(401).json({
          message: "رمز فعلی یا کد احراز هویت دومرحله‌ای معتبر نیست.",
        });
      }
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await execute(
        "UPDATE users SET password_hash=?,failed_login_count=0,locked_until=NULL WHERE id=?",
        [passwordHash, req.user!.id],
      );
      await audit(req, "auth.password_change", "user", String(req.user!.id));
      res.json({ changed: true });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/mobile-otp/request",
  authenticate,
  async (req: AuthRequest, res, next) => {
    let otpId: number | bigint | undefined;
    try {
      const [user] = await rows<any[]>("SELECT mobile FROM users WHERE id=?", [
        req.user!.id,
      ]);
      if (!user?.mobile)
        return res.status(409).json({ message: "شماره همراه ثبت نشده است." });
      const [recent] = await rows<any[]>(
        "SELECT id FROM verification_otps WHERE user_id=? AND created_at>=DATE_SUB(NOW(),INTERVAL 60 SECOND) LIMIT 1",
        [req.user!.id],
      );
      if (recent)
        return res
          .status(429)
          .json({ message: "برای درخواست مجدد یک دقیقه صبر کنید." });
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const created = await execute(
        "INSERT INTO verification_otps (user_id,mobile,code_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 5 MINUTE))",
        [req.user!.id, user.mobile, blindIndex(`${req.user!.id}:${code}`)],
      );
      otpId = created.insertId;
      await sendSms(user.mobile, `کد تأیید کارگزاری ثبتی: ${code}`);
      await audit(
        req,
        "auth.mobile_otp_sent",
        "verification_otp",
        String(otpId),
      );
      res.json({ sent: true, expiresInSeconds: 300 });
    } catch (error) {
      if (otpId)
        await execute("DELETE FROM verification_otps WHERE id=?", [
          otpId,
        ]).catch(() => undefined);
      if (
        error instanceof Error &&
        error.message.includes("notification provider")
      )
        return res.status(503).json({
          message: "سرویس رسمی پیامک هنوز در تنظیمات محیط فعال نشده است.",
        });
      next(error);
    }
  },
);

authRouter.post(
  "/mobile-otp/verify",
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({ code: z.string().regex(/^\d{6}$/) })
        .parse(req.body);
      const [otp] = await rows<any[]>(
        "SELECT id,code_hash,attempts,expires_at FROM verification_otps WHERE user_id=? AND verified_at IS NULL ORDER BY id DESC LIMIT 1",
        [req.user!.id],
      );
      if (!otp || new Date(otp.expires_at) < new Date() || otp.attempts >= 5)
        return res.status(410).json({ message: "کد منقضی یا مسدود شده است." });
      if (otp.code_hash !== blindIndex(`${req.user!.id}:${input.code}`)) {
        await execute(
          "UPDATE verification_otps SET attempts=attempts+1 WHERE id=?",
          [otp.id],
        );
        await audit(
          req,
          "auth.mobile_otp_failed",
          "verification_otp",
          String(otp.id),
        );
        return res.status(400).json({ message: "کد تأیید معتبر نیست." });
      }
      await transaction(async (connection) => {
        await connection.execute(
          "UPDATE verification_otps SET verified_at=NOW() WHERE id=?",
          [otp.id],
        );
        await connection.execute(
          "UPDATE users SET mobile_verified_at=NOW() WHERE id=?",
          [req.user!.id],
        );
      });
      await audit(req, "auth.mobile_verified", "user", String(req.user!.id));
      res.json({ verified: true });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/mfa/setup",
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const secret = generateTotpSecret();
      await execute(
        "UPDATE users SET mfa_pending_secret_encrypted=? WHERE id=?",
        [encryptField(secret), req.user!.id],
      );
      await audit(req, "auth.mfa_setup", "user", String(req.user!.id));
      res.json({
        secret,
        otpAuthUri: `otpauth://totp/RegBroker:${encodeURIComponent(req.user!.name)}?secret=${secret}&issuer=RegBroker&digits=6&period=30`,
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/mfa/enable",
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({ otp: z.string().regex(/^\d{6}$/) })
        .parse(req.body);
      const [user] = await rows<any[]>(
        "SELECT mfa_pending_secret_encrypted FROM users WHERE id=?",
        [req.user!.id],
      );
      const secret = decryptField(user?.mfa_pending_secret_encrypted);
      if (!secret || !verifyTotp(secret, input.otp))
        return res
          .status(400)
          .json({ message: "کد برنامه احراز هویت معتبر نیست." });
      const recovery = createRecoveryCodes();
      await execute(
        "UPDATE users SET mfa_enabled=1,mfa_secret_encrypted=mfa_pending_secret_encrypted,mfa_pending_secret_encrypted=NULL,mfa_recovery_codes=? WHERE id=?",
        [JSON.stringify(recovery.hashes), req.user!.id],
      );
      await audit(req, "auth.mfa_enabled", "user", String(req.user!.id));
      res.json({ enabled: true, recoveryCodes: recovery.codes });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/mfa/disable",
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          password: z.string().min(1),
          otp: z.string().regex(/^\d{6}$/),
        })
        .parse(req.body);
      const [user] = await rows<any[]>(
        "SELECT password_hash,mfa_secret_encrypted FROM users WHERE id=?",
        [req.user!.id],
      );
      const secret = decryptField(user?.mfa_secret_encrypted);
      if (
        !user ||
        !(await bcrypt.compare(input.password, user.password_hash)) ||
        !secret ||
        !verifyTotp(secret, input.otp)
      )
        return res
          .status(401)
          .json({ message: "رمز عبور یا کد دومرحله‌ای معتبر نیست." });
      await execute(
        "UPDATE users SET mfa_enabled=0,mfa_secret_encrypted=NULL,mfa_pending_secret_encrypted=NULL,mfa_recovery_codes=NULL WHERE id=?",
        [req.user!.id],
      );
      await audit(req, "auth.mfa_disabled", "user", String(req.user!.id));
      res.json({ enabled: false });
    } catch (error) {
      next(error);
    }
  },
);
