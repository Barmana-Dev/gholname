import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { execute, rows, transaction } from "../db.js";
import {
  audit,
  authenticate,
  authorize,
  enforceReadOnlyRole,
  generateCode,
} from "../security.js";
import type { AuthRequest } from "../types.js";
import {
  allowsSensitiveSupportData,
  canAccessPayment,
  officialPaymentGateway,
  tariffBreakdown,
} from "../page23.js";
import {
  canSendMessageType,
  type MessageType,
  userCanAccessApplication,
} from "../application-access.js";
import { pagination, paginationHeaders } from "../pagination.js";
import {
  observerPaymentReceipt,
  observerReviewItem,
  observerTicket,
} from "../observer-data.js";

const assignmentSchema = z.object({
  expertId: z.number().int().positive(),
  assignmentType: z.enum([
    "registry_legal",
    "survey",
    "compliance",
    "financial",
  ]),
  note: z.string().trim().max(2000).optional(),
});
const reportSchema = z.object({
  reportType: z.enum([
    "initial_review",
    "registry_legal",
    "survey",
    "compliance",
    "risk",
  ]),
  result: z.enum(["accepted", "deficient", "rejected", "needs_second_review"]),
  body: z.string().trim().min(20).max(10000),
  sign: z.boolean().default(false),
});
const riskSchema = z.object({
  conflictOfInterest: z.boolean().default(false),
  suspiciousDocument: z.boolean().default(false),
  identityMismatch: z.boolean().default(false),
  offPlatformPayment: z.boolean().default(false),
  level: z.enum(["low", "medium", "high", "critical"]),
  note: z.string().trim().min(10).max(5000),
});
const ticketSchema = z.object({
  applicationId: z.number().int().positive().optional(),
  subject: z.string().trim().min(5).max(180),
  category: z.enum([
    "guidance",
    "technical",
    "documents",
    "payment",
    "status",
    "other",
  ]),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  body: z.string().trim().min(10).max(5000),
});

async function hasApplicationAccess(
  req: AuthRequest,
  applicationId: string,
): Promise<boolean> {
  return userCanAccessApplication(req.user!, applicationId);
}

export const operationsRouter = Router();
operationsRouter.use(authenticate);
operationsRouter.use(enforceReadOnlyRole("observer"));

operationsRouter.get(
  "/experts",
  authorize("support", "operations_manager", "compliance", "admin"),
  async (_req, res, next) => {
    try {
      res.json(
        await rows<any[]>(
          "SELECT u.id,u.full_name fullName,r.code role,r.title_fa roleTitle FROM users u JOIN roles r ON r.id=u.role_id WHERE u.status='active' AND r.code IN ('registry_expert','surveyor','compliance','finance') ORDER BY r.code,u.full_name",
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/applications/:id/assign",
  authorize("operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = assignmentSchema.parse(req.body);
      const [application] = await rows<any[]>(
        "SELECT id FROM applications WHERE id=?",
        [String(req.params.id)],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      const [expert] = await rows<any[]>(
        "SELECT u.id,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='active'",
        [input.expertId],
      );
      if (!expert)
        return res.status(400).json({ message: "کارشناس فعال پیدا نشد." });
      const roleMap: Record<string, string> = {
        registry_legal: "registry_expert",
        survey: "surveyor",
        compliance: "compliance",
        financial: "finance",
      };
      if (expert.role !== roleMap[input.assignmentType])
        return res
          .status(400)
          .json({ message: "نقش کارشناس با نوع ارجاع سازگار نیست." });
      const result = await transaction(async (connection) => {
        await connection.execute(
          "SELECT id FROM applications WHERE id=? FOR UPDATE",
          [String(req.params.id)],
        );
        const [active] = await connection.execute<any[]>(
          "SELECT id FROM assignments WHERE application_id=? AND assignment_type=? AND completed_at IS NULL LIMIT 1",
          [String(req.params.id), input.assignmentType],
        );
        if (active[0]) throw new Error("ACTIVE_ASSIGNMENT_EXISTS");
        const [created] = await connection.execute<any>(
          "INSERT INTO assignments (application_id,expert_id,assignment_type,assigned_by,note) VALUES (?,?,?,?,?)",
          [
            String(req.params.id),
            input.expertId,
            input.assignmentType,
            req.user!.id,
            input.note ?? null,
          ],
        );
        return created;
      });
      await audit(
        req,
        "application.assign",
        "assignment",
        String(result.insertId),
        {
          applicationId: req.params.id,
          expertId: input.expertId,
          type: input.assignmentType,
        },
      );
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "ACTIVE_ASSIGNMENT_EXISTS"
      )
        return res.status(409).json({
          message: "برای این نوع ارجاع، یک کارشناس فعال از قبل تعیین شده است.",
        });
      next(error);
    }
  },
);

operationsRouter.post(
  "/applications/:id/transfer-requests",
  authorize("registry_expert", "surveyor", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          reason: z.string().trim().min(10).max(2000),
          proposedExpertId: z.number().int().positive().optional(),
        })
        .parse(req.body);
      const params: unknown[] = [req.params.id];
      let sql =
        "SELECT id FROM assignments WHERE application_id=? AND completed_at IS NULL";
      if (["registry_expert", "surveyor"].includes(req.user!.role)) {
        sql += " AND expert_id=?";
        params.push(req.user!.id);
      }
      sql += " ORDER BY id DESC LIMIT 1";
      const [assignment] = await rows<any[]>(sql, params);
      if (!assignment)
        return res.status(404).json({ message: "ارجاع فعال پیدا نشد." });
      const result = await execute(
        "INSERT INTO assignment_transfer_requests (application_id,current_assignment_id,requested_by,proposed_expert_id,reason) VALUES (?,?,?,?,?)",
        [
          req.params.id,
          assignment.id,
          req.user!.id,
          input.proposedExpertId ?? null,
          input.reason,
        ],
      );
      await audit(
        req,
        "assignment_transfer.request",
        "assignment_transfer",
        String(result.insertId),
        { applicationId: req.params.id },
      );
      res.status(201).json({ id: result.insertId, status: "pending" });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get(
  "/transfer-requests",
  authorize("operations_manager", "admin"),
  async (req, res, next) => {
    try {
      const page = pagination(req, { limit: 50, maxLimit: 100 });
      res.json(
        await rows<any[]>(
          "SELECT tr.id,tr.application_id applicationId,tr.reason,tr.status,tr.created_at createdAt,a.file_number fileNumber,requester.full_name requestedBy,proposed.full_name proposedExpert FROM assignment_transfer_requests tr JOIN applications a ON a.id=tr.application_id JOIN users requester ON requester.id=tr.requested_by LEFT JOIN users proposed ON proposed.id=tr.proposed_expert_id ORDER BY tr.created_at DESC,tr.id DESC LIMIT ? OFFSET ?",
          [page.limit, page.offset],
        ),
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.patch(
  "/transfer-requests/:id",
  authorize("operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          decision: z.enum(["approved", "rejected"]),
          proposedExpertId: z.number().int().positive().optional(),
          note: z.string().trim().min(5).max(2000),
        })
        .parse(req.body);
      const [transfer] = await rows<any[]>(
        "SELECT tr.*,x.assignment_type FROM assignment_transfer_requests tr JOIN assignments x ON x.id=tr.current_assignment_id WHERE tr.id=? AND tr.status='pending'",
        [req.params.id],
      );
      if (!transfer)
        return res
          .status(404)
          .json({ message: "درخواست انتقال باز پیدا نشد." });
      const expertId = input.proposedExpertId ?? transfer.proposed_expert_id;
      if (input.decision === "approved" && !expertId)
        return res.status(400).json({ message: "کارشناس جایگزین الزامی است." });
      if (input.decision === "approved") {
        const [expert] = await rows<any[]>(
          "SELECT r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='active'",
          [expertId],
        );
        const roleMap: Record<string, string> = {
          registry_legal: "registry_expert",
          survey: "surveyor",
          compliance: "compliance",
          financial: "finance",
        };
        if (!expert || expert.role !== roleMap[transfer.assignment_type])
          return res.status(400).json({
            message: "نقش کارشناس جایگزین با نوع ارجاع سازگار نیست.",
          });
      }
      await transaction(async (connection) => {
        await connection.execute(
          "UPDATE assignment_transfer_requests SET status=?,proposed_expert_id=COALESCE(?,proposed_expert_id),decided_by=?,decision_note=?,decided_at=NOW() WHERE id=?",
          [
            input.decision,
            expertId ?? null,
            req.user!.id,
            input.note,
            req.params.id,
          ],
        );
        if (input.decision === "approved") {
          await connection.execute(
            "UPDATE assignments SET completed_at=NOW() WHERE id=?",
            [transfer.current_assignment_id],
          );
          await connection.execute(
            "INSERT INTO assignments (application_id,expert_id,assignment_type,assigned_by,note) VALUES (?,?,?,?,?)",
            [
              transfer.application_id,
              expertId,
              transfer.assignment_type,
              req.user!.id,
              `انتقال تأییدشده: ${input.note}`,
            ],
          );
        }
      });
      await audit(
        req,
        `assignment_transfer.${input.decision}`,
        "assignment_transfer",
        String(req.params.id),
      );
      res.json({ status: input.decision });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/applications/:id/reports",
  authorize(
    "registry_expert",
    "surveyor",
    "compliance",
    "operations_manager",
    "admin",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const input = reportSchema.parse(req.body);
      const allowedReportTypes: Partial<Record<string, string[]>> = {
        registry_expert: ["initial_review", "registry_legal"],
        surveyor: ["survey"],
        compliance: ["compliance", "risk"],
      };
      const roleReportTypes = allowedReportTypes[req.user!.role];
      if (roleReportTypes && !roleReportTypes.includes(input.reportType))
        return res
          .status(403)
          .json({ message: "نوع گزارش با نقش شما سازگار نیست." });
      if (["registry_expert", "surveyor"].includes(req.user!.role)) {
        const [assignment] = await rows<any[]>(
          "SELECT id FROM assignments WHERE application_id=? AND expert_id=? AND completed_at IS NULL LIMIT 1",
          [req.params.id, req.user!.id],
        );
        if (!assignment)
          return res
            .status(403)
            .json({ message: "این پرونده به شما ارجاع نشده است." });
      }
      const result = await execute(
        "INSERT INTO expert_reports (application_id,expert_id,report_type,result,body,signed_at) VALUES (?,?,?,?,?,?)",
        [
          req.params.id,
          req.user!.id,
          input.reportType,
          input.result,
          input.body,
          input.sign ? new Date() : null,
        ],
      );
      await audit(
        req,
        "expert_report.create",
        "expert_report",
        String(result.insertId),
        {
          applicationId: req.params.id,
          result: input.result,
          signed: input.sign,
        },
      );
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get(
  "/review-approvals/pending",
  authorize("compliance", "operations_manager", "admin", "observer"),
  async (req: AuthRequest, res, next) => {
    try {
      const page = pagination(req, { limit: 50, maxLimit: 100 });
      const items = await rows<any[]>(
        "SELECT r.id reportId,r.application_id applicationId,r.report_type reportType,r.result,r.body,r.created_at createdAt,a.file_number fileNumber,u.full_name expertName FROM expert_reports r JOIN applications a ON a.id=r.application_id JOIN users u ON u.id=r.expert_id LEFT JOIN review_approvals ra ON ra.report_id=r.id AND ra.decision='approved' WHERE (r.result='needs_second_review' OR a.risk_level IN ('high','critical')) AND ra.id IS NULL ORDER BY r.created_at,r.id LIMIT ? OFFSET ?",
        [page.limit, page.offset],
      );
      res.json(
        req.user!.role === "observer"
          ? items.map((item) => observerReviewItem(item))
          : items,
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/reports/:id/approvals",
  authorize("compliance", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          decision: z.enum(["approved", "rejected"]),
          note: z.string().trim().min(10).max(2000),
        })
        .parse(req.body);
      const [report] = await rows<any[]>(
        "SELECT id,application_id,expert_id FROM expert_reports WHERE id=?",
        [req.params.id],
      );
      if (!report) return res.status(404).json({ message: "گزارش پیدا نشد." });
      if (report.expert_id === req.user!.id)
        return res.status(409).json({
          message: "بازبین دوم باید با تهیه‌کننده گزارش متفاوت باشد.",
        });
      const result = await execute(
        "INSERT INTO review_approvals (application_id,report_id,reviewer_id,decision,note) VALUES (?,?,?,?,?)",
        [
          report.application_id,
          report.id,
          req.user!.id,
          input.decision,
          input.note,
        ],
      );
      await audit(
        req,
        "report.second_review",
        "review_approval",
        String(result.insertId),
        {
          reportId: report.id,
          decision: input.decision,
        },
      );
      res.status(201).json({ id: result.insertId, decision: input.decision });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/applications/:id/risk-reviews",
  authorize("compliance", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = riskSchema.parse(req.body);
      const result = await transaction(async (connection) => {
        const [created] = await connection.execute<any>(
          "INSERT INTO risk_reviews (application_id,reviewer_id,conflict_of_interest,suspicious_document,identity_mismatch,off_platform_payment,level,note) VALUES (?,?,?,?,?,?,?,?)",
          [
            String(req.params.id),
            req.user!.id,
            input.conflictOfInterest,
            input.suspiciousDocument,
            input.identityMismatch,
            input.offPlatformPayment,
            input.level,
            input.note,
          ],
        );
        await connection.execute(
          "UPDATE applications SET risk_level=? WHERE id=?",
          [input.level, String(req.params.id)],
        );
        return created;
      });
      await audit(
        req,
        "risk_review.create",
        "risk_review",
        String(result.insertId),
        { applicationId: req.params.id, level: input.level },
      );
      res.status(201).json({ id: result.insertId, level: input.level });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.patch(
  "/documents/:id/review",
  authorize(
    "registry_expert",
    "surveyor",
    "operations_manager",
    "compliance",
    "admin",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          status: z.enum([
            "deficient",
            "rejected",
            "needs_revision",
            "initially_accepted",
          ]),
          note: z.string().trim().min(5).max(2000),
        })
        .parse(req.body);
      const [document] = await rows<any[]>(
        "SELECT application_id FROM documents WHERE id=? AND deleted_at IS NULL",
        [req.params.id],
      );
      if (!document) return res.status(404).json({ message: "مدرک پیدا نشد." });
      if (!(await hasApplicationAccess(req, String(document.application_id))))
        return res
          .status(403)
          .json({ message: "این پرونده به شما ارجاع نشده است." });
      const result = await execute(
        "UPDATE documents SET review_status=?,review_note=? WHERE id=? AND deleted_at IS NULL",
        [input.status, input.note, req.params.id],
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "مدرک پیدا نشد." });
      await audit(req, "document.review", "document", String(req.params.id), {
        status: input.status,
      });
      res.json({ status: input.status });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/applications/:id/messages",
  authorize(
    "applicant",
    "representative",
    "registry_expert",
    "surveyor",
    "support",
    "finance",
    "operations_manager",
    "compliance",
    "admin",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          type: z
            .enum([
              "system",
              "support",
              "deficiency",
              "deadline",
              "document_receipt",
              "payment",
              "general",
            ])
            .default("general"),
          body: z.string().trim().min(2).max(5000),
          attachmentDocumentId: z.number().int().positive().optional(),
        })
        .parse(req.body);
      const [application] = await rows<any[]>(
        "SELECT applicant_id FROM applications WHERE id=?",
        [req.params.id],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      if (!(await hasApplicationAccess(req, String(req.params.id))))
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      if (!canSendMessageType(req.user!.role, input.type as MessageType))
        return res.status(403).json({
          message: "ارسال این نوع پیام برای نقش شما مجاز نیست.",
        });
      if (input.attachmentDocumentId) {
        const [attachment] = await rows<any[]>(
          "SELECT id FROM documents WHERE id=? AND application_id=? AND deleted_at IS NULL",
          [input.attachmentDocumentId, req.params.id],
        );
        if (!attachment)
          return res
            .status(400)
            .json({ message: "ضمیمه متعلق به این پرونده نیست." });
      }
      const recipientId =
        application.applicant_id === req.user!.id
          ? null
          : application.applicant_id;
      const notificationRecipients = recipientId
        ? [{ userId: recipientId }]
        : await rows<any[]>(
            `SELECT DISTINCT userId FROM (
              SELECT x.expert_id userId FROM assignments x
               WHERE x.application_id=? AND x.completed_at IS NULL
              UNION
              SELECT st.assigned_to userId FROM support_tickets st
               WHERE st.application_id=? AND st.assigned_to IS NOT NULL
            ) recipients WHERE userId<>?`,
            [req.params.id, req.params.id, req.user!.id],
          );
      let supportUserId: number | null = null;
      if (!recipientId && input.type === "support") {
        const [supportUser] = await rows<any[]>(
          `SELECT u.id userId FROM users u JOIN roles r ON r.id=u.role_id
           LEFT JOIN support_tickets st ON st.assigned_to=u.id AND st.application_id=? AND st.status<>'closed'
           WHERE r.code='support' AND u.status='active'
           ORDER BY (st.id IS NOT NULL) DESC,u.id LIMIT 1`,
          [req.params.id],
        );
        supportUserId = supportUser ? Number(supportUser.userId) : null;
        if (
          supportUserId &&
          !notificationRecipients.some(
            (recipient) => Number(recipient.userId) === supportUserId,
          )
        )
          notificationRecipients.push({ userId: supportUserId });
      }
      const result = await transaction(async (connection) => {
        const [created] = await connection.execute<any>(
          "INSERT INTO messages (application_id,sender_id,recipient_id,message_type,body,attachment_document_id) VALUES (?,?,?,?,?,?)",
          [
            req.params.id,
            req.user!.id,
            recipientId,
            input.type,
            input.body,
            input.attachmentDocumentId ?? null,
          ],
        );
        for (const recipient of notificationRecipients)
          await connection.execute(
            "INSERT INTO notifications (user_id,application_id,title,body) VALUES (?,?,?,?)",
            [
              recipient.userId,
              req.params.id,
              "پیام جدید پرونده",
              input.body.slice(0, 500),
            ],
          );
        if (!recipientId && input.type === "support") {
          const [existingTickets] = await connection.execute<any>(
            "SELECT id FROM support_tickets WHERE application_id=? AND status<>'closed' ORDER BY id DESC LIMIT 1 FOR UPDATE",
            [String(req.params.id)],
          );
          let ticketId = existingTickets[0]?.id as number | undefined;
          if (!ticketId) {
            const [ticket] = await connection.execute<any>(
              "INSERT INTO support_tickets (tracking_code,applicant_id,application_id,subject,category,priority,status,assigned_to) VALUES (?,?,?,?,?,'normal',?,?)",
              [
                generateCode("TKT"),
                application.applicant_id,
                req.params.id,
                "پیام پشتیبانی پرونده",
                "other",
                supportUserId ? "assigned" : "open",
                supportUserId,
              ],
            );
            ticketId = Number(ticket.insertId);
          }
          await connection.execute(
            "INSERT INTO ticket_messages (ticket_id,sender_id,body) VALUES (?,?,?)",
            [ticketId, req.user!.id, input.body],
          );
        }
        return created;
      });
      await audit(req, "message.create", "message", String(result.insertId), {
        applicationId: req.params.id,
        type: input.type,
      });
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/applications/:id/payments/initiate",
  authorize("applicant", "representative", "finance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      if (config.PAYMENT_MODE !== "production")
        return res.status(503).json({
          message:
            "درگاه پرداخت واقعی تا ثبت حساب حقوقی و دریافت دسترسی رسمی غیرفعال است.",
        });
      const [application] = await rows<any[]>(
        "SELECT a.applicant_id,s.fee_rials,s.legal_fee_rials,s.service_fee_rials FROM applications a JOIN services s ON s.id=a.service_id WHERE a.id=?",
        [req.params.id],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      if (
        ["applicant", "representative"].includes(req.user!.role) &&
        application.applicant_id !== req.user!.id
      )
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      const quote = tariffBreakdown(
        Number(application.legal_fee_rials ?? 0),
        Number(application.service_fee_rials ?? application.fee_rials ?? 0),
      );
      if (!quote.totalRials)
        return res
          .status(409)
          .json({ message: "تعرفه مصوب برای این خدمت ثبت نشده است." });
      return res.status(501).json({
        message: "آداپتور درگاه باید با مشخصات PSP رسمی کارگزاری تکمیل شود.",
        quote,
      });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get(
  "/applications/:id/payment-quote",
  authorize(
    "applicant",
    "representative",
    "finance",
    "operations_manager",
    "compliance",
    "admin",
    "observer",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const [application] = await rows<any[]>(
        "SELECT a.applicant_id,a.file_number,s.title_fa serviceTitle,s.fee_rials,s.legal_fee_rials,s.service_fee_rials FROM applications a JOIN services s ON s.id=a.service_id WHERE a.id=?",
        [req.params.id],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      if (
        !canAccessPayment(
          req.user!.role,
          req.user!.id,
          application.applicant_id,
        )
      )
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      const breakdown = tariffBreakdown(
        Number(application.legal_fee_rials ?? 0),
        Number(application.service_fee_rials ?? application.fee_rials ?? 0),
      );
      res.json({
        applicationId: Number(req.params.id),
        fileNumber: application.file_number,
        serviceTitle: application.serviceTitle,
        ...breakdown,
        gateway: officialPaymentGateway,
        paymentMode: config.PAYMENT_MODE,
        payable:
          config.PAYMENT_MODE === "production" && breakdown.totalRials > 0,
        warnings: [
          "پرداخت فقط از درگاه رسمی متصل به حساب حقوقی کارگزاری مجاز است.",
          "کارت‌به‌کارت، حساب واسط و پرداخت وجه به کارکنان ممنوع است.",
        ],
      });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get(
  "/payments/:id/receipt",
  authorize(
    "applicant",
    "representative",
    "finance",
    "operations_manager",
    "compliance",
    "admin",
    "observer",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const [payment] = await rows<any[]>(
        "SELECT p.*,a.applicant_id,a.file_number,s.title_fa service_title FROM payments p JOIN applications a ON a.id=p.application_id JOIN services s ON s.id=a.service_id WHERE p.id=?",
        [req.params.id],
      );
      if (!payment)
        return res.status(404).json({ message: "پرداخت پیدا نشد." });
      if (!canAccessPayment(req.user!.role, req.user!.id, payment.applicant_id))
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      if (payment.status !== "successful")
        return res
          .status(409)
          .json({ message: "رسید فقط برای پرداخت موفق صادر می‌شود." });
      const receiptNumber =
        payment.receipt_number ?? `RCP-${String(payment.id).padStart(10, "0")}`;
      if (!payment.receipt_number)
        await execute(
          "UPDATE payments SET receipt_number=? WHERE id=? AND receipt_number IS NULL",
          [receiptNumber, payment.id],
        );
      await audit(req, "payment.receipt_view", "payment", String(payment.id));
      const receipt = {
        receiptNumber,
        paymentId: payment.id,
        applicationId: payment.application_id,
        fileNumber: payment.file_number,
        serviceTitle: payment.service_title,
        legalFeeRials: Number(payment.legal_fee_rials),
        serviceFeeRials: Number(payment.service_fee_rials),
        totalRials: Number(payment.amount_rials),
        gateway: payment.gateway,
        transactionId: payment.transaction_id,
        paidAt: payment.paid_at,
      };
      res.json(
        req.user!.role === "observer"
          ? observerPaymentReceipt(receipt)
          : receipt,
      );
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get(
  "/financial-report",
  authorize("finance", "operations_manager", "compliance", "admin", "observer"),
  async (req: AuthRequest, res, next) => {
    try {
      const [summary, daily] = await Promise.all([
        rows<any[]>(
          "SELECT status,COUNT(*) count,COALESCE(SUM(legal_fee_rials),0) legalFeeRials,COALESCE(SUM(service_fee_rials),0) serviceFeeRials,COALESCE(SUM(amount_rials),0) totalRials FROM payments GROUP BY status ORDER BY status",
        ),
        rows<any[]>(
          "SELECT DATE(paid_at) day,COUNT(*) count,COALESCE(SUM(amount_rials),0) totalRials FROM payments WHERE status='successful' AND paid_at>=DATE_SUB(NOW(),INTERVAL 90 DAY) GROUP BY DATE(paid_at) ORDER BY day DESC",
        ),
      ]);
      await audit(req, "payment.financial_report_view", "report", "payments");
      res.json({ summary, daily });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get("/tickets", async (req: AuthRequest, res, next) => {
  try {
    const page = pagination(req, { limit: 50, maxLimit: 250 });
    const supervisoryStaff = [
      "operations_manager",
      "compliance",
      "admin",
    ].includes(req.user!.role);
    const supportStaff = req.user!.role === "support";
    const ticketWhere = supervisoryStaff
      ? ""
      : supportStaff
        ? "WHERE (t.assigned_to=? OR (t.assigned_to IS NULL AND t.status<>'closed'))"
        : "WHERE t.applicant_id=?";
    const params: unknown[] = supervisoryStaff ? [] : [req.user!.id];
    params.push(page.limit, page.offset);
    const tickets = await rows<any[]>(
      `SELECT t.*,u.full_name applicantName FROM support_tickets t JOIN users u ON u.id=t.applicant_id ${ticketWhere} ORDER BY t.updated_at DESC,t.id DESC LIMIT ? OFFSET ?`,
      params,
    );
    paginationHeaders(res, page);
    res.json(
      req.user!.role === "observer"
        ? tickets.map((ticket) => observerTicket(ticket))
        : tickets,
    );
  } catch (error) {
    next(error);
  }
});

operationsRouter.post("/tickets", async (req: AuthRequest, res, next) => {
  try {
    const input = ticketSchema.parse(req.body);
    if (
      input.applicationId &&
      !(await hasApplicationAccess(req, String(input.applicationId)))
    )
      return res
        .status(403)
        .json({ message: "پرونده انتخاب‌شده متعلق به شما نیست." });
    const trackingCode = generateCode("TKT");
    const ticketId = await transaction(async (connection) => {
      const [ticket] = await connection.execute<any>(
        "INSERT INTO support_tickets (tracking_code,applicant_id,application_id,subject,category,priority) VALUES (?,?,?,?,?,?)",
        [
          trackingCode,
          req.user!.id,
          input.applicationId ?? null,
          input.subject,
          input.category,
          input.priority,
        ],
      );
      await connection.execute(
        "INSERT INTO ticket_messages (ticket_id,sender_id,body) VALUES (?,?,?)",
        [ticket.insertId, req.user!.id, input.body],
      );
      return ticket.insertId as number;
    });
    await audit(
      req,
      "support_ticket.create",
      "support_ticket",
      String(ticketId),
      { trackingCode },
    );
    res.status(201).json({ id: ticketId, trackingCode });
  } catch (error) {
    next(error);
  }
});

operationsRouter.get("/tickets/:id", async (req: AuthRequest, res, next) => {
  try {
    const [ticket] = await rows<any[]>(
      "SELECT t.*,u.full_name applicantName FROM support_tickets t JOIN users u ON u.id=t.applicant_id WHERE t.id=?",
      [req.params.id],
    );
    if (!ticket) return res.status(404).json({ message: "تیکت پیدا نشد." });
    const supervisoryStaff = [
      "operations_manager",
      "compliance",
      "admin",
    ].includes(req.user!.role);
    const supportStaff = req.user!.role === "support";
    const supportAssignmentAllowed =
      supportStaff &&
      (Number(ticket.assigned_to) === Number(req.user!.id) ||
        (ticket.assigned_to === null && ticket.status !== "closed"));
    const applicantAllowed =
      !supervisoryStaff &&
      !supportStaff &&
      Number(ticket.applicant_id) === Number(req.user!.id);
    if (!supervisoryStaff && !supportAssignmentAllowed && !applicantAllowed)
      return res.status(403).json({ message: "دسترسی مجاز نیست." });
    const canViewInternalMessages = [
      "support",
      "operations_manager",
      "compliance",
      "admin",
    ].includes(req.user!.role);
    const messages = await rows<any[]>(
      `SELECT tm.id,tm.body,tm.is_internal isInternal,tm.created_at createdAt,u.full_name senderName FROM ticket_messages tm JOIN users u ON u.id=tm.sender_id WHERE tm.ticket_id=? ${canViewInternalMessages ? "" : "AND tm.is_internal=0"} ORDER BY tm.created_at`,
      [req.params.id],
    );
    res.json({
      ...(req.user!.role === "observer" ? observerTicket(ticket) : ticket),
      messages,
    });
  } catch (error) {
    next(error);
  }
});

operationsRouter.post(
  "/tickets/:id/reply",
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          body: z.string().trim().min(2).max(5000),
          status: z
            .enum([
              "open",
              "assigned",
              "waiting_applicant",
              "answered",
              "closed",
            ])
            .optional(),
          internal: z.boolean().default(false),
        })
        .parse(req.body);
      const [ticket] = await rows<any[]>(
        "SELECT applicant_id,assigned_to,status FROM support_tickets WHERE id=?",
        [req.params.id],
      );
      if (!ticket) return res.status(404).json({ message: "تیکت پیدا نشد." });
      const supervisoryStaff = [
        "operations_manager",
        "compliance",
        "admin",
        "observer",
      ].includes(req.user!.role);
      const supportStaff = req.user!.role === "support";
      const supportAssignmentAllowed =
        supportStaff &&
        (Number(ticket.assigned_to) === Number(req.user!.id) ||
          (ticket.assigned_to === null && ticket.status !== "closed"));
      const applicantAllowed =
        !supervisoryStaff &&
        !supportStaff &&
        Number(ticket.applicant_id) === Number(req.user!.id);
      if (!supervisoryStaff && !supportAssignmentAllowed && !applicantAllowed)
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      const staff = supervisoryStaff || supportStaff;
      if (!staff && input.internal)
        return res
          .status(403)
          .json({ message: "یادداشت داخلی فقط برای کارکنان مجاز است." });
      await transaction(async (connection) => {
        await connection.execute(
          "INSERT INTO ticket_messages (ticket_id,sender_id,body,is_internal) VALUES (?,?,?,?)",
          [String(req.params.id), req.user!.id, input.body, input.internal],
        );
        await connection.execute(
          "UPDATE support_tickets SET status=COALESCE(?,status),assigned_to=IF(?,COALESCE(assigned_to,?),assigned_to),first_response_at=IF(? AND first_response_at IS NULL,NOW(),first_response_at),closed_at=IF(?='closed',NOW(),closed_at) WHERE id=?",
          [
            input.status ?? null,
            staff,
            req.user!.id,
            staff,
            input.status ?? "",
            String(req.params.id),
          ],
        );
      });
      await audit(
        req,
        "support_ticket.reply",
        "support_ticket",
        String(req.params.id),
        { status: input.status, internal: input.internal },
      );
      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get("/notifications", async (req: AuthRequest, res, next) => {
  try {
    res.json(
      await rows<any[]>(
        "SELECT id,application_id applicationId,title,body,delivery_status deliveryStatus,read_at readAt,created_at createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
        [req.user!.id],
      ),
    );
  } catch (error) {
    next(error);
  }
});

operationsRouter.patch(
  "/notifications/:id/read",
  async (req: AuthRequest, res, next) => {
    try {
      await execute(
        "UPDATE notifications SET read_at=NOW(),delivery_status='read' WHERE id=? AND user_id=?",
        [req.params.id, req.user!.id],
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get(
  "/refund-requests",
  authorize("finance", "operations_manager", "compliance", "admin"),
  async (req, res, next) => {
    try {
      const page = pagination(req, { limit: 50, maxLimit: 250 });
      res.json(
        await rows<any[]>(
          "SELECT rr.id,rr.reason,rr.status,rr.created_at createdAt,p.amount_rials amountRials,p.transaction_id transactionId,a.file_number fileNumber,u.full_name requestedBy FROM refund_requests rr JOIN payments p ON p.id=rr.payment_id JOIN applications a ON a.id=p.application_id JOIN users u ON u.id=rr.requested_by ORDER BY rr.created_at DESC,rr.id DESC LIMIT ? OFFSET ?",
          [page.limit, page.offset],
        ),
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/payments/:id/refund-requests",
  authorize("applicant", "representative", "finance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({ reason: z.string().trim().min(10).max(2000) })
        .parse(req.body);
      const [payment] = await rows<any[]>(
        "SELECT p.id,p.status,a.applicant_id FROM payments p JOIN applications a ON a.id=p.application_id WHERE p.id=?",
        [req.params.id],
      );
      if (!payment)
        return res.status(404).json({ message: "پرداخت پیدا نشد." });
      if (
        ["applicant", "representative"].includes(req.user!.role) &&
        payment.applicant_id !== req.user!.id
      )
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      if (payment.status !== "successful")
        return res
          .status(409)
          .json({ message: "فقط پرداخت موفق قابل استرداد است." });
      const result = await execute(
        "INSERT INTO refund_requests (payment_id,requested_by,reason) VALUES (?,?,?)",
        [payment.id, req.user!.id, input.reason],
      );
      await audit(
        req,
        "refund.request",
        "refund_request",
        String(result.insertId),
      );
      res.status(201).json({ id: result.insertId, status: "pending" });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.patch(
  "/refund-requests/:id",
  authorize("finance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          decision: z.enum(["approved", "rejected"]),
          note: z.string().trim().min(5).max(2000),
        })
        .parse(req.body);
      const decided = await transaction(async (connection) => {
        const [requests] = await connection.execute<any[]>(
          "SELECT payment_id FROM refund_requests WHERE id=? AND status='pending' FOR UPDATE",
          [String(req.params.id)],
        );
        const request = requests[0];
        if (!request) return null;
        await connection.execute(
          "UPDATE refund_requests SET status=?,decided_by=?,decision_note=?,decided_at=NOW() WHERE id=? AND status='pending'",
          [input.decision, req.user!.id, input.note, String(req.params.id)],
        );
        // An approved refund must leave the payment ledger consistent: the
        // dashboard, financial report and receipt all read payments.status,
        // which previously stayed 'successful' forever after a refund.
        if (input.decision === "approved")
          await connection.execute(
            "UPDATE payments SET status='refunded' WHERE id=? AND status='successful'",
            [request.payment_id],
          );
        return request;
      });
      if (!decided)
        return res
          .status(404)
          .json({ message: "درخواست استرداد باز پیدا نشد." });
      await audit(
        req,
        `refund.${input.decision}`,
        "refund_request",
        String(req.params.id),
      );
      res.json({ status: input.decision });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.get(
  "/support-interactions",
  authorize("support", "operations_manager", "compliance", "admin"),
  async (req, res, next) => {
    try {
      const page = pagination(req, { limit: 100, maxLimit: 250 });
      res.json(
        await rows<any[]>(
          "SELECT si.*,u.full_name handledByName FROM support_interactions si JOIN users u ON u.id=si.handled_by ORDER BY si.created_at DESC,si.id DESC LIMIT ? OFFSET ?",
          [page.limit, page.offset],
        ),
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/support-interactions",
  authorize("support", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          applicantId: z.number().int().positive().optional(),
          applicationId: z.number().int().positive().optional(),
          channel: z.enum([
            "phone",
            "email",
            "chat",
            "ticket",
            "sms",
            "in_person",
          ]),
          subject: z.string().trim().min(5).max(180),
          summary: z.string().trim().min(10).max(5000),
          responseText: z.string().trim().min(2).max(5000).optional(),
          outcome: z.enum([
            "resolved",
            "follow_up",
            "referred",
            "complaint_registered",
          ]),
          durationSeconds: z.number().int().min(0).max(86_400).optional(),
          referredTo: z.number().int().positive().optional(),
          containsSensitiveData: z.boolean().default(false),
          qualityScore: z.number().int().min(1).max(5).optional(),
        })
        .refine((value) => value.outcome !== "referred" || value.referredTo, {
          message: "برای ارجاع، کارشناس مقصد الزامی است.",
          path: ["referredTo"],
        })
        .parse(req.body);
      if (
        input.containsSensitiveData &&
        !allowsSensitiveSupportData(input.channel)
      )
        return res.status(400).json({
          message: "ثبت اطلاعات حساس دریافتی از کانال غیررسمی مجاز نیست.",
        });
      if (
        input.applicationId &&
        !(await hasApplicationAccess(req, String(input.applicationId)))
      )
        return res
          .status(403)
          .json({ message: "دسترسی به پرونده انتخاب‌شده مجاز نیست." });
      let effectiveApplicantId = input.applicantId ?? null;
      if (input.applicationId) {
        const [application] = await rows<any[]>(
          "SELECT applicant_id applicantId FROM applications WHERE id=?",
          [input.applicationId],
        );
        if (!application)
          return res.status(404).json({ message: "پرونده پیدا نشد." });
        if (
          input.applicantId &&
          Number(input.applicantId) !== Number(application.applicantId)
        )
          return res.status(400).json({
            message: "متقاضی تعامل با متقاضی پرونده سازگار نیست.",
          });
        effectiveApplicantId = Number(application.applicantId);
      }
      if (effectiveApplicantId) {
        const [applicant] = await rows<any[]>(
          "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND r.code IN ('applicant','representative')",
          [effectiveApplicantId],
        );
        if (!applicant)
          return res.status(400).json({ message: "متقاضی معتبر پیدا نشد." });
      }
      if (input.referredTo) {
        const [expert] = await rows<any[]>(
          "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='active' AND r.code IN ('registry_expert','surveyor','compliance','finance','operations_manager')",
          [input.referredTo],
        );
        if (!expert)
          return res.status(400).json({ message: "کارشناس مقصد معتبر نیست." });
      }
      const result = await execute(
        "INSERT INTO support_interactions (applicant_id,application_id,channel,subject,summary,response_text,outcome,duration_seconds,handled_by,referred_to,quality_score) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
          effectiveApplicantId,
          input.applicationId ?? null,
          input.channel,
          input.subject,
          input.summary,
          input.responseText ?? null,
          input.outcome,
          input.durationSeconds ?? null,
          req.user!.id,
          input.referredTo ?? null,
          input.qualityScore ?? null,
        ],
      );
      await audit(
        req,
        "support_interaction.create",
        "support_interaction",
        String(result.insertId),
        { channel: input.channel },
      );
      res.status(201).json({ id: result.insertId });
    } catch (error) {
      next(error);
    }
  },
);
