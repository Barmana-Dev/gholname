import { Router } from "express";
import { z } from "zod";
import { execute, rows, transaction } from "../db.js";
import {
  evidenceRequiresLicensedProvider,
  hasCompleteCaseChecklist,
  isReviewPeriodValid,
  STAFF_ROLES,
} from "../internal-controls-policy.js";
import { requireCapability } from "../access.js";
import {
  audit,
  authenticate,
  authorize,
  enforceReadOnlyRole,
} from "../security.js";
import type { AuthRequest } from "../types.js";

const dateInput = z.coerce.date();
const caseReviewSchema = z.object({
  applicationId: z.number().int().positive(),
  outcome: z.enum(["compliant", "follow_up", "escalated"]),
  conflictChecked: z.boolean(),
  scopeChecked: z.boolean(),
  privacyChecked: z.boolean(),
  paymentChecked: z.boolean(),
  note: z.string().trim().min(20).max(5000),
  nextReviewAt: dateInput,
});
const evidenceSchema = z
  .object({
    evidenceType: z.enum([
      "technical_document",
      "operational_document",
      "contractor_contract",
      "backup_restore_test",
      "penetration_test",
    ]),
    title: z.string().trim().min(5).max(180),
    reference: z.string().trim().min(5).max(500),
    providerName: z.string().trim().min(2).max(180).optional(),
    providerLicense: z.string().trim().min(2).max(120).optional(),
    effectiveAt: dateInput,
    expiresAt: dateInput.optional(),
  })
  .superRefine((value, context) => {
    if (
      evidenceRequiresLicensedProvider(value.evidenceType) &&
      (!value.providerName || !value.providerLicense)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "نام پیمانکار و مرجع مجوز برای این مدرک الزامی است.",
        path: ["providerLicense"],
      });
    if (value.expiresAt && value.expiresAt < value.effectiveAt)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "تاریخ انقضا نمی‌تواند پیش از تاریخ اجرا باشد.",
        path: ["expiresAt"],
      });
  });

export const internalControlsRouter = Router();
internalControlsRouter.use(
  authenticate,
  enforceReadOnlyRole("observer"),
  requireCapability("internal_controls.read"),
);

internalControlsRouter.get("/dashboard", async (_req, res, next) => {
  try {
    const [staff, cases, campaigns, audits, evidence, accessActivity] =
      await Promise.all([
        rows<any[]>(
          `SELECT u.id,u.full_name fullName,r.code role,u.status,
             a.nda_version ndaVersion,a.nda_signed_at ndaSignedAt,
             a.training_version trainingVersion,a.training_expires_at trainingExpiresAt,
             a.evidence_reference evidenceReference,
             (a.id IS NULL OR a.training_expires_at<NOW()) controlOverdue
           FROM users u JOIN roles r ON r.id=u.role_id
           LEFT JOIN staff_control_attestations a ON a.id=(
             SELECT a2.id FROM staff_control_attestations a2 WHERE a2.user_id=u.id ORDER BY a2.id DESC LIMIT 1
           )
           WHERE r.code IN (${STAFF_ROLES.map(() => "?").join(",")})
           ORDER BY controlOverdue DESC,r.code,u.full_name`,
          [...STAFF_ROLES],
        ),
        rows<any[]>(
          `SELECT a.id applicationId,a.file_number fileNumber,a.status,a.risk_level riskLevel,
             r.created_at lastReviewedAt,r.next_review_at nextReviewAt,r.outcome,
             (r.id IS NULL OR r.next_review_at<NOW()) reviewOverdue
           FROM applications a
           LEFT JOIN periodic_case_reviews r ON r.id=(
             SELECT r2.id FROM periodic_case_reviews r2 WHERE r2.application_id=a.id ORDER BY r2.id DESC LIMIT 1
           )
           WHERE a.status NOT IN ('draft','completed','closed_incomplete','out_of_scope','stopped_legal_technical','stopped_security','cancelled_by_applicant','referred_complaint')
           ORDER BY reviewOverdue DESC,FIELD(a.risk_level,'critical','high','medium','low'),a.updated_at`,
        ),
        rows<any[]>(
          `SELECT c.id,c.title,c.period_start periodStart,c.period_end periodEnd,c.due_at dueAt,c.status,
             COUNT(i.id) totalItems,SUM(i.decision='pending') pendingItems
           FROM access_review_campaigns c LEFT JOIN access_review_items i ON i.campaign_id=c.id
           GROUP BY c.id ORDER BY c.created_at DESC LIMIT 24`,
        ),
        rows<any[]>(
          `SELECT a.id,a.audit_month auditMonth,a.scope,a.findings,a.corrective_actions correctiveActions,
             a.inspection_ready inspectionReady,a.status,a.created_at createdAt,u.full_name ownerName
           FROM internal_control_audits a JOIN users u ON u.id=a.owner_id
           ORDER BY a.audit_month DESC LIMIT 24`,
        ),
        rows<any[]>(
          `SELECT e.id,e.evidence_type evidenceType,e.title,e.reference,e.provider_name providerName,
             e.provider_license providerLicense,e.effective_at effectiveAt,e.expires_at expiresAt,
             IF(e.expires_at IS NOT NULL AND e.expires_at<CURDATE(),'expired',e.status) status
           FROM control_evidence e ORDER BY e.created_at DESC LIMIT 100`,
        ),
        rows<any[]>(
          `SELECT u.id userId,u.full_name fullName,r.code role,COUNT(l.id) activityCount,
             SUM(l.action='document.download') documentDownloads,MAX(l.created_at) lastActivityAt
           FROM users u JOIN roles r ON r.id=u.role_id
           LEFT JOIN audit_logs l ON l.actor_id=u.id AND l.created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY)
           WHERE r.code IN (${STAFF_ROLES.map(() => "?").join(",")})
           GROUP BY u.id ORDER BY documentDownloads DESC,activityCount DESC`,
          [...STAFF_ROLES],
        ),
      ]);
    res.json({ staff, cases, campaigns, audits, evidence, accessActivity });
  } catch (error) {
    next(error);
  }
});

internalControlsRouter.get(
  "/access-reviews/:id/items",
  async (req, res, next) => {
    try {
      const items = await rows<any[]>(
        `SELECT i.id,i.user_id userId,u.full_name fullName,i.role_snapshot role,
         i.activity_count activityCount,i.last_activity_at lastActivityAt,
         i.decision,i.decision_note decisionNote,i.reviewed_at reviewedAt
       FROM access_review_items i JOIN users u ON u.id=i.user_id
       WHERE i.campaign_id=? ORDER BY i.decision='pending' DESC,i.activity_count DESC`,
        [req.params.id],
      );
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

internalControlsRouter.post(
  "/attestations",
  authorize("compliance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          userId: z.number().int().positive(),
          ndaVersion: z.string().trim().min(1).max(40),
          ndaSignedAt: dateInput,
          trainingVersion: z.string().trim().min(1).max(40),
          trainingCompletedAt: dateInput,
          trainingExpiresAt: dateInput,
          evidenceReference: z.string().trim().min(5).max(255),
        })
        .refine(
          (value) => value.trainingExpiresAt > value.trainingCompletedAt,
          {
            message: "اعتبار آموزش باید پس از زمان تکمیل آن باشد.",
            path: ["trainingExpiresAt"],
          },
        )
        .parse(req.body);
      const [staff] = await rows<any[]>(
        `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND r.code IN (${STAFF_ROLES.map(() => "?").join(",")})`,
        [input.userId, ...STAFF_ROLES],
      );
      if (!staff)
        return res.status(400).json({ message: "کارمند معتبر پیدا نشد." });
      const result = await execute(
        "INSERT INTO staff_control_attestations (user_id,nda_version,nda_signed_at,training_version,training_completed_at,training_expires_at,verified_by,evidence_reference) VALUES (?,?,?,?,?,?,?,?)",
        [
          input.userId,
          input.ndaVersion,
          input.ndaSignedAt,
          input.trainingVersion,
          input.trainingCompletedAt,
          input.trainingExpiresAt,
          req.user!.id,
          input.evidenceReference,
        ],
      );
      await audit(
        req,
        "internal_control.attestation_create",
        "staff_attestation",
        String(result.insertId),
        { userId: input.userId },
      );
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      next(error);
    }
  },
);

internalControlsRouter.post(
  "/case-reviews",
  authorize("compliance", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = caseReviewSchema.parse(req.body);
      if (!hasCompleteCaseChecklist(input))
        return res
          .status(400)
          .json({ message: "تمام کنترل‌های پرونده باید بررسی و تأیید شوند." });
      if (input.nextReviewAt <= new Date())
        return res
          .status(400)
          .json({ message: "موعد بازبینی بعدی باید در آینده باشد." });
      const [application] = await rows<any[]>(
        "SELECT id FROM applications WHERE id=?",
        [input.applicationId],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      const [ownAssignment] = await rows<any[]>(
        "SELECT id FROM assignments WHERE application_id=? AND expert_id=? LIMIT 1",
        [input.applicationId, req.user!.id],
      );
      if (ownAssignment)
        return res
          .status(409)
          .json({ message: "بازبین دوره‌ای نباید کارشناس همان پرونده باشد." });
      const id = await transaction(async (connection) => {
        const [created] = await connection.execute<any>(
          "INSERT INTO periodic_case_reviews (application_id,reviewer_id,outcome,conflict_checked,scope_checked,privacy_checked,payment_checked,note,next_review_at) VALUES (?,?,?,?,?,?,?,?,?)",
          [
            input.applicationId,
            req.user!.id,
            input.outcome,
            true,
            true,
            true,
            true,
            input.note,
            input.nextReviewAt,
          ],
        );
        if (input.outcome === "escalated")
          await connection.execute(
            "UPDATE applications SET risk_level=IF(risk_level='critical','critical','high') WHERE id=?",
            [input.applicationId],
          );
        return created.insertId as number;
      });
      await audit(
        req,
        "internal_control.case_review",
        "periodic_case_review",
        String(id),
        { applicationId: input.applicationId, outcome: input.outcome },
      );
      res.status(201).json({ id, outcome: input.outcome });
    } catch (error) {
      next(error);
    }
  },
);

internalControlsRouter.post(
  "/access-reviews",
  authorize("compliance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          title: z.string().trim().min(5).max(180),
          periodStart: dateInput,
          periodEnd: dateInput,
          dueAt: dateInput,
        })
        .parse(req.body);
      if (!isReviewPeriodValid(input.periodStart, input.periodEnd, input.dueAt))
        return res
          .status(400)
          .json({ message: "بازه و موعد بازبینی دسترسی معتبر نیست." });
      const campaignId = await transaction(async (connection) => {
        const [created] = await connection.execute<any>(
          "INSERT INTO access_review_campaigns (title,period_start,period_end,due_at,created_by) VALUES (?,?,?,?,?)",
          [
            input.title,
            input.periodStart,
            input.periodEnd,
            input.dueAt,
            req.user!.id,
          ],
        );
        await connection.execute(
          `INSERT INTO access_review_items (campaign_id,user_id,role_snapshot,activity_count,last_activity_at)
           SELECT ?,u.id,r.code,COUNT(l.id),MAX(l.created_at)
           FROM users u JOIN roles r ON r.id=u.role_id
           LEFT JOIN audit_logs l ON l.actor_id=u.id AND l.created_at BETWEEN ? AND ?
           WHERE u.status='active' AND r.code IN (${STAFF_ROLES.map(() => "?").join(",")})
           GROUP BY u.id,r.code`,
          [
            created.insertId,
            input.periodStart,
            input.periodEnd,
            ...STAFF_ROLES,
          ],
        );
        return created.insertId as number;
      });
      await audit(
        req,
        "internal_control.access_review_create",
        "access_review_campaign",
        String(campaignId),
      );
      res.status(201).json({ id: campaignId });
    } catch (error) {
      next(error);
    }
  },
);

internalControlsRouter.patch(
  "/access-review-items/:id",
  authorize("compliance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          decision: z.enum(["retain", "restrict", "suspend"]),
          note: z.string().trim().min(10).max(2000),
        })
        .parse(req.body);
      const [item] = await rows<any[]>(
        "SELECT i.user_id userId,i.campaign_id campaignId,i.decision,r.code role FROM access_review_items i JOIN users u ON u.id=i.user_id JOIN roles r ON r.id=u.role_id WHERE i.id=?",
        [req.params.id],
      );
      if (!item)
        return res.status(404).json({ message: "ردیف بازبینی پیدا نشد." });
      if (item.decision !== "pending")
        return res
          .status(409)
          .json({ message: "این دسترسی قبلاً تعیین تکلیف شده است." });
      if (item.userId === req.user!.id)
        return res
          .status(409)
          .json({ message: "بازبینی دسترسی خود شخص مجاز نیست." });
      if (
        input.decision !== "retain" &&
        item.role === "admin" &&
        req.user!.role !== "admin"
      )
        return res
          .status(403)
          .json({ message: "محدودسازی مدیر فقط توسط مدیر دیگر مجاز است." });
      await transaction(async (connection) => {
        await connection.execute(
          "UPDATE access_review_items SET decision=?,decision_note=?,reviewed_by=?,reviewed_at=NOW() WHERE id=? AND decision='pending'",
          [input.decision, input.note, req.user!.id, String(req.params.id)],
        );
        if (input.decision !== "retain")
          await connection.execute(
            "UPDATE users SET status='suspended' WHERE id=? AND status='active'",
            [item.userId],
          );
        const [pending] = await connection.execute<any>(
          "SELECT COUNT(*) count FROM access_review_items WHERE campaign_id=? AND decision='pending'",
          [item.campaignId],
        );
        if (Number(pending[0]?.count ?? 0) === 0)
          await connection.execute(
            "UPDATE access_review_campaigns SET status='completed',completed_by=?,completed_at=NOW() WHERE id=?",
            [req.user!.id, item.campaignId],
          );
      });
      await audit(
        req,
        "internal_control.access_review_decision",
        "access_review_item",
        String(req.params.id),
        input,
      );
      res.json({ decision: input.decision });
    } catch (error) {
      next(error);
    }
  },
);

internalControlsRouter.post(
  "/audits",
  authorize("compliance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          auditMonth: dateInput,
          scope: z.string().trim().min(20).max(5000),
          findings: z.string().trim().min(20).max(10000),
          correctiveActions: z.string().trim().min(20).max(10000),
          inspectionReady: z.boolean(),
        })
        .parse(req.body);
      const result = await execute(
        "INSERT INTO internal_control_audits (audit_month,scope,findings,corrective_actions,inspection_ready,owner_id) VALUES (?,?,?,?,?,?)",
        [
          input.auditMonth,
          input.scope,
          input.findings,
          input.correctiveActions,
          input.inspectionReady,
          req.user!.id,
        ],
      );
      await audit(
        req,
        "internal_control.monthly_audit_create",
        "internal_control_audit",
        String(result.insertId),
      );
      res.status(201).json({ id: result.insertId, status: "open" });
    } catch (error) {
      next(error);
    }
  },
);

internalControlsRouter.patch(
  "/audits/:id/approve",
  authorize("compliance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const [record] = await rows<any[]>(
        "SELECT owner_id ownerId,status FROM internal_control_audits WHERE id=?",
        [req.params.id],
      );
      if (!record) return res.status(404).json({ message: "ممیزی پیدا نشد." });
      if (record.ownerId === req.user!.id)
        return res
          .status(409)
          .json({
            message: "تهیه‌کننده ممیزی نمی‌تواند آن را تأیید نهایی کند.",
          });
      if (record.status === "closed")
        return res.status(409).json({ message: "ممیزی قبلاً بسته شده است." });
      await execute(
        "UPDATE internal_control_audits SET status='closed',approved_by=?,approved_at=NOW() WHERE id=?",
        [req.user!.id, req.params.id],
      );
      await audit(
        req,
        "internal_control.monthly_audit_approve",
        "internal_control_audit",
        String(req.params.id),
      );
      res.json({ status: "closed" });
    } catch (error) {
      next(error);
    }
  },
);

internalControlsRouter.post(
  "/evidence",
  authorize("compliance", "technical", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = evidenceSchema.parse(req.body);
      const result = await execute(
        "INSERT INTO control_evidence (evidence_type,title,reference,provider_name,provider_license,effective_at,expires_at,recorded_by) VALUES (?,?,?,?,?,?,?,?)",
        [
          input.evidenceType,
          input.title,
          input.reference,
          input.providerName ?? null,
          input.providerLicense ?? null,
          input.effectiveAt,
          input.expiresAt ?? null,
          req.user!.id,
        ],
      );
      await audit(
        req,
        "internal_control.evidence_create",
        "control_evidence",
        String(result.insertId),
        { evidenceType: input.evidenceType },
      );
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      next(error);
    }
  },
);
