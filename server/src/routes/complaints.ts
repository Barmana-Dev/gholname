import { Router } from "express";
import { execute, rows, transaction } from "../db.js";
import {
  audit,
  authenticate,
  authorize,
  enforceReadOnlyRole,
  generateCode,
} from "../security.js";
import type { AuthRequest } from "../types.js";
import { complaintSchema } from "../validation.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "../config.js";
import {
  contentDispositionFilename,
  normalizeOriginalFilename,
  safeStoragePath,
  storageFilename,
} from "../upload-files.js";
import {
  complaintDueSql,
  isUrgentFinancialComplaint,
} from "../financial-abuse.js";
import { pagination, paginationHeaders } from "../pagination.js";
import { canAccessComplaint, canUpdateComplaint } from "../complaint-access.js";
import { userCanAccessApplication } from "../application-access.js";
import {
  UploadRejectedError,
  enforceUploadQuota,
  disarmStoredUpload,
  inspectUploadContent,
  scanUpload,
  uploadConcurrencyGuard,
  uploadRateLimiter,
} from "../upload-security.js";

const complaintUploadRoot = path.resolve(config.UPLOAD_DIR, "complaints");
fs.mkdirSync(complaintUploadRoot, { recursive: true });
const complaintUpload = multer({
  storage: multer.diskStorage({
    destination: complaintUploadRoot,
    filename: (_req, file, callback) =>
      callback(null, storageFilename(file.originalname, file.mimetype)),
  }),
  limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) =>
    callback(
      null,
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
        file.mimetype,
      ),
    ),
});

function validComplaintFile(filePath: string, mimeType: string): boolean {
  const head = fs.readFileSync(filePath).subarray(0, 12);
  if (mimeType === "application/pdf")
    return head.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8;
  if (mimeType === "image/png")
    return head
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return (
    mimeType === "image/webp" &&
    head.subarray(0, 4).toString() === "RIFF" &&
    head.subarray(8, 12).toString() === "WEBP"
  );
}

export const complaintsRouter = Router();
complaintsRouter.use(authenticate);
complaintsRouter.use(enforceReadOnlyRole("observer"));

complaintsRouter.get(
  "/",
  authorize(
    "applicant",
    "representative",
    "support",
    "compliance",
    "operations_manager",
    "admin",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const page = pagination(req, { limit: 50, maxLimit: 250 });
      const privileged = ["compliance", "operations_manager", "admin"].includes(
        req.user!.role,
      );
      const support = req.user!.role === "support";
      const params: unknown[] = privileged
        ? []
        : support
          ? [req.user!.id]
          : [req.user!.id];
      params.push(page.limit, page.offset);
      const items = await rows<any[]>(
        `SELECT c.*,u.full_name applicantName FROM complaints c LEFT JOIN users u ON u.id=c.applicant_id ${privileged ? "" : support ? "WHERE (c.assigned_to=? OR (c.assigned_to IS NULL AND c.status<>'closed'))" : "WHERE c.applicant_id=?"} ORDER BY c.created_at DESC,c.id DESC LIMIT ? OFFSET ?`,
        params,
      );
      paginationHeaders(res, page);
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);

complaintsRouter.post(
  "/",
  authorize(
    "applicant",
    "representative",
    "support",
    "compliance",
    "operations_manager",
    "admin",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const input = complaintSchema.parse(req.body);
      if (
        input.applicationId &&
        !(await userCanAccessApplication(req.user!, input.applicationId))
      )
        return res.status(403).json({
          message: "دسترسی به پرونده انتخاب‌شده برای ثبت شکایت مجاز نیست.",
        });
      const trackingCode = generateCode("CMP");
      const urgent = isUrgentFinancialComplaint(input.category);
      const recipients = await rows<any[]>(
        "SELECT u.id,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code IN ('compliance','operations_manager') AND u.status='active' ORDER BY FIELD(r.code,'compliance','operations_manager'),u.id",
      );
      const compliance = recipients.find((item) => item.role === "compliance");
      const complaintId = await transaction(async (connection) => {
        const [result] = await connection.execute<any>(
          `INSERT INTO complaints (tracking_code,applicant_id,application_id,category,subject,description,priority,assigned_to,response_due_at) VALUES (?,?,?,?,?,?,?, ?,${complaintDueSql(input.category)})`,
          [
            trackingCode,
            req.user!.id,
            input.applicationId ?? null,
            input.category,
            input.subject,
            input.description,
            urgent ? "urgent" : "normal",
            compliance?.id ?? null,
          ],
        );
        if (urgent && recipients.length) {
          const notificationValues = recipients
            .map(() => "(?,NULL,?,?, 'in_app','queued')")
            .join(",");
          const notificationParams = recipients.flatMap((recipient) => [
            recipient.id,
            "گزارش فوری سوءاستفاده مالی",
            `گزارش ${trackingCode} درباره درخواست پرداخت غیرمجاز ثبت شد و باید حداکثر ظرف چهار ساعت بررسی اولیه شود.`,
          ]);
          await connection.execute(
            `INSERT INTO notifications (user_id,application_id,title,body,channel,delivery_status) VALUES ${notificationValues}`,
            notificationParams,
          );
        }
        return result.insertId as number;
      });
      await audit(req, "complaint.create", "complaint", String(complaintId), {
        trackingCode,
        category: input.category,
        priority: urgent ? "urgent" : "normal",
      });
      res.status(201).json({
        id: complaintId,
        trackingCode,
        priority: urgent ? "urgent" : "normal",
      });
    } catch (error) {
      next(error);
    }
  },
);

complaintsRouter.get(
  "/:id/attachments",
  authorize(
    "applicant",
    "representative",
    "support",
    "compliance",
    "operations_manager",
    "admin",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const [complaint] = await rows<any[]>(
        "SELECT applicant_id,assigned_to,status FROM complaints WHERE id=?",
        [req.params.id],
      );
      if (!complaint)
        return res.status(404).json({ message: "شکایت پیدا نشد." });
      if (
        !canAccessComplaint(req.user!, {
          applicantId: Number(complaint.applicant_id),
          assignedTo:
            complaint.assigned_to === null
              ? null
              : Number(complaint.assigned_to),
          status: complaint.status,
        })
      )
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      const attachments = await rows<any[]>(
        "SELECT id,original_name originalName,mime_type mimeType,size_bytes sizeBytes,created_at createdAt FROM complaint_attachments WHERE complaint_id=? ORDER BY id",
        [req.params.id],
      );
      res.json(
        attachments.map((attachment) => ({
          ...attachment,
          originalName: normalizeOriginalFilename(attachment.originalName),
        })),
      );
    } catch (error) {
      next(error);
    }
  },
);

complaintsRouter.post(
  "/:id/attachments",
  authorize(
    "applicant",
    "representative",
    "support",
    "compliance",
    "operations_manager",
    "admin",
  ),
  uploadRateLimiter,
  uploadConcurrencyGuard,
  complaintUpload.single("file"),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "فایل معتبر انتخاب نشده است." });
      const [complaint] = await rows<any[]>(
        "SELECT applicant_id,assigned_to,status FROM complaints WHERE id=?",
        [req.params.id],
      );
      if (
        !complaint ||
        !canAccessComplaint(req.user!, {
          applicantId: Number(complaint.applicant_id),
          assignedTo:
            complaint.assigned_to === null
              ? null
              : Number(complaint.assigned_to),
          status: complaint.status,
        })
      ) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      }
      if (
        complaint.status === "closed" ||
        !validComplaintFile(req.file.path, req.file.mimetype)
      ) {
        fs.unlinkSync(req.file.path);
        return res
          .status(409)
          .json({ message: "شکایت بسته است یا محتوای فایل معتبر نیست." });
      }
      let cdr: Awaited<ReturnType<typeof disarmStoredUpload>>;
      try {
        await enforceUploadQuota(req.user!.id, req.file.size);
        inspectUploadContent(req.file.path, req.file.mimetype);
        await scanUpload(req.file.path); // ClamAV, mandatory in production
        cdr = await disarmStoredUpload(req.file); // rebuild a clean copy
      } catch (error) {
        fs.unlinkSync(req.file.path);
        if (error instanceof UploadRejectedError)
          return res.status(error.status).json({ message: error.message });
        throw error;
      }
      const hash = cdr.sha256;
      const originalName = normalizeOriginalFilename(req.file.originalname);
      const result = await execute(
        "INSERT INTO complaint_attachments (complaint_id,original_name,storage_name,mime_type,size_bytes,sha256,original_sha256,uploaded_by) VALUES (?,?,?,?,?,?,?,?)",
        [
          req.params.id,
          originalName,
          req.file.filename,
          req.file.mimetype,
          cdr.sizeBytes,
          hash,
          cdr.originalSha256,
          req.user!.id,
        ],
      );
      await audit(
        req,
        "complaint.attachment_upload",
        "complaint_attachment",
        String(result.insertId),
        { complaintId: req.params.id, hash, originalSha256: cdr.originalSha256 },
      );
      res.status(201).json({
        id: result.insertId,
        originalName,
        mimeType: req.file.mimetype,
        sizeBytes: cdr.sizeBytes,
      });
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      next(error);
    }
  },
);

complaintsRouter.get(
  "/attachments/:attachmentId/download",
  authorize(
    "applicant",
    "representative",
    "support",
    "compliance",
    "operations_manager",
    "admin",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const [attachment] = await rows<any[]>(
        "SELECT ca.*,c.applicant_id,c.assigned_to,c.status FROM complaint_attachments ca JOIN complaints c ON c.id=ca.complaint_id WHERE ca.id=?",
        [req.params.attachmentId],
      );
      if (!attachment)
        return res.status(404).json({ message: "ضمیمه پیدا نشد." });
      if (
        !canAccessComplaint(req.user!, {
          applicantId: Number(attachment.applicant_id),
          assignedTo:
            attachment.assigned_to === null
              ? null
              : Number(attachment.assigned_to),
          status: attachment.status,
        })
      )
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      const filePath = safeStoragePath(
        complaintUploadRoot,
        attachment.storage_name,
      );
      if (!filePath || !fs.existsSync(filePath))
        return res
          .status(410)
          .json({ message: "فایل در فضای ذخیره‌سازی موجود نیست." });
      await audit(
        req,
        "complaint.attachment_download",
        "complaint_attachment",
        String(attachment.id),
      );
      res.setHeader("Content-Type", attachment.mime_type);
      // Downloaded files must never execute or render as a page.
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        contentDispositionFilename(attachment.original_name),
      );
      res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  },
);

complaintsRouter.get(
  "/report/summary",
  authorize("compliance", "operations_manager", "admin", "observer"),
  async (_req, res, next) => {
    try {
      const [byCategory, byStatus, [sla]] = await Promise.all([
        rows<any[]>(
          "SELECT category,COUNT(*) count FROM complaints GROUP BY category ORDER BY count DESC",
        ),
        rows<any[]>(
          "SELECT status,COUNT(*) count FROM complaints GROUP BY status",
        ),
        rows<any[]>(
          "SELECT COUNT(*) total,SUM(response_due_at<NOW() AND status IN ('received','under_review')) overdue,ROUND(AVG(TIMESTAMPDIFF(HOUR,created_at,resolved_at)),1) averageResolutionHours FROM complaints",
        ),
      ]);
      res.json({ byCategory, byStatus, sla });
    } catch (error) {
      next(error);
    }
  },
);

complaintsRouter.patch(
  "/:id",
  authorize("support", "compliance", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const status = String(req.body.status ?? "");
      const response = String(req.body.response ?? "").trim();
      if (
        !["under_review", "answered", "closed"].includes(status) ||
        response.length < 10
      )
        return res
          .status(400)
          .json({ message: "پاسخ و وضعیت معتبر الزامی است." });
      const [complaint] = await rows<any[]>(
        "SELECT applicant_id,assigned_to,status FROM complaints WHERE id=?",
        [req.params.id],
      );
      if (
        !complaint ||
        !canUpdateComplaint(req.user!, {
          applicantId: Number(complaint.applicant_id),
          assignedTo:
            complaint.assigned_to === null
              ? null
              : Number(complaint.assigned_to),
          status: complaint.status,
        })
      )
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      const result = await execute(
        "UPDATE complaints SET status=?,response=?,assigned_to=?,first_response_at=COALESCE(first_response_at,NOW()),resolved_at=IF(? IN ('answered','closed'),NOW(),NULL) WHERE id=? AND (assigned_to IS NULL OR assigned_to=? OR ? IN ('compliance','operations_manager','admin'))",
        [
          status,
          response,
          req.user!.id,
          status,
          req.params.id,
          req.user!.id,
          req.user!.role,
        ],
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "شکایت پیدا نشد." });
      await audit(req, "complaint.update", "complaint", String(req.params.id), {
        status,
      });
      res.json({ status });
    } catch (error) {
      next(error);
    }
  },
);
