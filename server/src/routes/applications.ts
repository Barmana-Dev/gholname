import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
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
import { applicationSchema, validateServiceFormData } from "../validation.js";
import { blindIndex, decryptField, encryptField } from "../crypto.js";
import {
  missingRequiredDocuments,
  page04AllowedActions,
  page04ServiceRules,
  validatePage04Structure,
} from "../page04-services.js";
import {
  canChangeApplicationStatus,
  canTransitionApplicationStatus,
  userCanAccessApplication,
} from "../application-access.js";
import { hasArchivedApplicationAccess } from "../archive-access.js";
import { pagination, paginationHeaders } from "../pagination.js";
import {
  contentDispositionFilename,
  normalizeOriginalFilename,
  safeStoragePath,
  storageFilename,
} from "../upload-files.js";
import {
  observerApplicationDetail,
  observerApplicationListItem,
  restrictedApplicationDetail,
} from "../observer-data.js";
import { createTrackingToken } from "../tracking.js";

const uploadRoot = path.resolve(config.UPLOAD_DIR);
fs.mkdirSync(uploadRoot, { recursive: true });
const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/zip",
  "application/vnd.google-earth.kml+xml",
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (_req, file, cb) =>
      cb(null, storageFilename(file.originalname, file.mimetype)),
  }),
  limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, allowedTypes.has(file.mimetype)),
});

function hasAllowedSignature(filePath: string, mimeType: string): boolean {
  const head = fs.readFileSync(filePath).subarray(0, 16);
  if (mimeType === "application/pdf")
    return head.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "image/jpeg")
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mimeType === "image/png")
    return head
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp")
    return (
      head.subarray(0, 4).toString() === "RIFF" &&
      head.subarray(8, 12).toString() === "WEBP"
    );
  if (mimeType === "application/zip")
    return head.subarray(0, 2).toString() === "PK";
  if (mimeType === "application/vnd.google-earth.kml+xml")
    return ["<?xml", "<kml "].some((marker) =>
      head.toString().trimStart().startsWith(marker),
    );
  return false;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function jsonStorageText(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value);
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return value;
  }
}

class DuplicateApplicationError extends Error {
  constructor(
    readonly fileNumber: string,
    readonly applicationId: number,
  ) {
    super("DUPLICATE_APPLICATION");
    this.name = "DuplicateApplicationError";
  }
}

class ConcurrentStatusChangeError extends Error {
  constructor() {
    super("CONCURRENT_STATUS_CHANGE");
    this.name = "ConcurrentStatusChangeError";
  }
}

class ConcurrentSubmitError extends Error {
  constructor() {
    super("CONCURRENT_SUBMIT");
    this.name = "ConcurrentSubmitError";
  }
}

export const applicationsRouter = Router();
applicationsRouter.use(authenticate);
applicationsRouter.use(enforceReadOnlyRole("observer"));

applicationsRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const page = pagination(req, { limit: 50, maxLimit: 250 });
    const privileged = !["applicant", "representative"].includes(
      req.user!.role,
    );
    const params: unknown[] = [];
    let assignmentJoin = "";
    let where = "";
    if (!privileged) {
      where = "WHERE a.applicant_id=?";
      params.push(req.user!.id);
    } else if (["registry_expert", "surveyor"].includes(req.user!.role)) {
      assignmentJoin = "JOIN assignments x ON x.application_id=a.id";
      where = "WHERE x.expert_id=?";
      params.push(req.user!.id);
    } else if (req.user!.role === "support") {
      assignmentJoin =
        "JOIN support_tickets st ON st.application_id=a.id AND st.status<>'closed' AND (st.assigned_to IS NULL OR st.assigned_to=?)";
      params.push(req.user!.id);
    } else if (req.user!.role === "finance") {
      assignmentJoin = "JOIN payments p ON p.application_id=a.id";
    } else if (req.user!.role === "technical") {
      where = "WHERE 1=0";
    }
    if (privileged && req.user!.role !== "technical") {
      where += where
        ? " AND (a.archived_at IS NULL OR EXISTS (SELECT 1 FROM archive_access_requests aar WHERE aar.application_id=a.id AND aar.requested_by=? AND aar.status='approved' AND aar.valid_until>=NOW()))"
        : "WHERE (a.archived_at IS NULL OR EXISTS (SELECT 1 FROM archive_access_requests aar WHERE aar.application_id=a.id AND aar.requested_by=? AND aar.status='approved' AND aar.valid_until>=NOW()))";
      params.push(req.user!.id);
    }
    params.push(page.limit, page.offset);
    const items = await rows<any[]>(
      `SELECT DISTINCT a.id,a.file_number fileNumber,a.status,a.risk_level riskLevel,a.archived_at archivedAt,a.created_at createdAt,a.updated_at updatedAt,s.title_fa serviceTitle${req.user!.role === "observer" ? "" : ",u.full_name applicantName"} FROM applications a JOIN users u ON u.id=a.applicant_id JOIN services s ON s.id=a.service_id ${assignmentJoin} ${where} ORDER BY a.updated_at DESC,a.id DESC LIMIT ? OFFSET ?`,
      params,
    );
    paginationHeaders(res, page);
    res.json(
      req.user!.role === "observer"
        ? items.map((item) => observerApplicationListItem(item))
        : items,
    );
  } catch (error) {
    next(error);
  }
});

applicationsRouter.post(
  "/",
  authorize("applicant", "representative", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = applicationSchema.parse(req.body);
      const [service] = await rows<any[]>(
        "SELECT id,code FROM services WHERE id=? AND is_active=1",
        [input.serviceId],
      );
      if (!service)
        return res.status(400).json({ message: "خدمت انتخاب‌شده فعال نیست." });
      const serviceFormData = validateServiceFormData(
        service.code,
        input.formData,
      );
      const subdivisionUnits = validatePage04Structure(service.code, {
        relatedProperties: input.relatedProperties,
        parties: input.parties,
        subdivisionUnits: input.subdivisionUnits,
        formData: serviceFormData,
      });
      if (subdivisionUnits.length)
        serviceFormData.subdivisionUnits = subdivisionUnits;
      const [duplicate] = await rows<any[]>(
        "SELECT a.id,a.file_number fileNumber,a.status FROM applications a JOIN properties p ON p.application_id=a.id WHERE a.applicant_id=? AND a.service_id=? AND p.registry_section=? AND p.main_plate=? AND a.status NOT IN ('completed','closed_incomplete','out_of_scope','stopped_legal_technical','stopped_security','cancelled_by_applicant','referred_complaint') AND a.created_at>=DATE_SUB(NOW(),INTERVAL 180 DAY) ORDER BY a.id DESC LIMIT 1",
        [
          req.user!.id,
          input.serviceId,
          input.property.registrySection,
          input.property.mainPlate,
        ],
      );
      if (duplicate)
        return res.status(409).json({
          message: `درخواست فعال مشابه با شماره ${duplicate.fileNumber} وجود دارد.`,
          duplicateApplicationId: duplicate.id,
        });
      const fileNumber = generateCode("RB");
      const applicationId = await transaction(async (connection) => {
        // Recheck while holding row/gap locks. The preflight check above is a
        // fast response for normal traffic, while this check closes the race
        // where two requests for the same property arrive concurrently.
        const [concurrentDuplicate] = await connection.execute<any[]>(
          "SELECT a.id,a.file_number fileNumber FROM applications a JOIN properties p ON p.application_id=a.id WHERE a.applicant_id=? AND a.service_id=? AND p.registry_section=? AND p.main_plate=? AND a.status NOT IN ('completed','closed_incomplete','out_of_scope','stopped_legal_technical','stopped_security','cancelled_by_applicant','referred_complaint') AND a.created_at>=DATE_SUB(NOW(),INTERVAL 180 DAY) ORDER BY a.id DESC LIMIT 1 FOR UPDATE",
          [
            req.user!.id,
            input.serviceId,
            input.property.registrySection,
            input.property.mainPlate,
          ],
        );
        if (concurrentDuplicate[0])
          throw new DuplicateApplicationError(
            concurrentDuplicate[0].fileNumber,
            Number(concurrentDuplicate[0].id),
          );
        const [created] = await connection.execute<any>(
          "INSERT INTO applications (file_number,applicant_id,service_id,applicant_capacity,form_data) VALUES (?,?,?,?,?)",
          [
            fileNumber,
            req.user!.id,
            input.serviceId,
            input.applicantCapacity,
            JSON.stringify(encryptField(JSON.stringify(serviceFormData))),
          ],
        );
        const p = input.property;
        await connection.execute(
          "INSERT INTO properties (application_id,province,county,registry_section,main_plate,sub_plate,parcel,address,postal_code,property_type,deed_type,area,coordinates,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            created.insertId,
            p.province,
            p.county,
            p.registrySection,
            p.mainPlate,
            p.subPlate ?? null,
            p.parcel ?? null,
            encryptField(p.address),
            p.postalCode ?? null,
            p.propertyType,
            p.deedType ?? null,
            p.area ?? null,
            p.coordinates
              ? JSON.stringify(encryptField(JSON.stringify(p.coordinates)))
              : null,
            encryptField(p.notes),
          ],
        );
        for (const related of input.relatedProperties) {
          await connection.execute(
            "INSERT INTO properties (application_id,province,county,registry_section,main_plate,sub_plate,parcel,address,postal_code,property_type,deed_type,area,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              created.insertId,
              p.province,
              p.county,
              p.registrySection,
              related.mainPlate,
              related.subPlate ?? null,
              related.parcel ?? null,
              encryptField(p.address),
              p.postalCode ?? null,
              p.propertyType,
              p.deedType ?? null,
              related.area ?? null,
              encryptField("ملک مرتبط"),
            ],
          );
        }
        for (const party of input.parties) {
          await connection.execute(
            "INSERT INTO application_parties (application_id,party_type,full_name,national_id,national_id_hash,share_description) VALUES (?,?,?,?,?,?)",
            [
              created.insertId,
              party.partyType,
              party.fullName,
              encryptField(party.nationalId),
              party.nationalId ? blindIndex(party.nationalId) : null,
              party.shareDescription ?? null,
            ],
          );
        }
        return created.insertId as number;
      });
      await audit(
        req,
        "application.create",
        "application",
        String(applicationId),
        { fileNumber, service: service.code },
      );
      res.status(201).json({
        id: applicationId,
        fileNumber,
        trackingToken: createTrackingToken(applicationId, fileNumber),
        status: "draft",
      });
    } catch (error) {
      if (error instanceof DuplicateApplicationError)
        return res.status(409).json({
          message: `درخواست فعال مشابه با شماره ${error.fileNumber} وجود دارد.`,
          duplicateApplicationId: error.applicationId,
        });
      next(error);
    }
  },
);

applicationsRouter.get("/:id", async (req: AuthRequest, res, next) => {
  try {
    const [application] = await rows<any[]>(
      "SELECT a.*,s.code serviceCode,s.title_fa serviceTitle,u.full_name applicantName FROM applications a JOIN services s ON s.id=a.service_id JOIN users u ON u.id=a.applicant_id WHERE a.id=?",
      [req.params.id],
    );
    if (!application)
      return res.status(404).json({ message: "پرونده پیدا نشد." });
    if (!(await userCanAccessApplication(req.user!, application.id)))
      return res.status(403).json({ message: "دسترسی مجاز نیست." });
    if (
      application.archived_at &&
      !(await hasArchivedApplicationAccess(
        req.user!,
        application.id,
        application.applicant_id,
        "view",
      ))
    )
      return res.status(403).json({
        code: "ARCHIVE_ACCESS_APPROVAL_REQUIRED",
        message:
          "دسترسی کارکنان به پرونده بایگانی‌شده نیازمند تأیید مدیر با احراز هویت دومرحله‌ای است.",
      });
    const messageVisibilityClause =
      req.user!.role === "observer"
        ? "AND 1=0"
        : req.user!.role === "finance"
          ? "AND m.message_type IN ('payment','system','document_receipt')"
          : "";
    const [
      properties,
      parties,
      documents,
      history,
      messages,
      payments,
      assignments,
      reports,
      riskReviews,
    ] = await Promise.all([
      rows<any[]>(
        "SELECT * FROM properties WHERE application_id=? ORDER BY id",
        [application.id],
      ),
      rows<any[]>(
        "SELECT * FROM application_parties WHERE application_id=? ORDER BY id",
        [application.id],
      ),
      rows<any[]>(
        "SELECT id,document_type documentType,original_name originalName,mime_type mimeType,size_bytes sizeBytes,version,sensitivity,review_status reviewStatus,review_note reviewNote,uploaded_at uploadedAt FROM documents WHERE application_id=? AND deleted_at IS NULL ORDER BY uploaded_at DESC",
        [application.id],
      ),
      rows<any[]>(
        "SELECT h.*,u.full_name changedByName FROM status_history h JOIN users u ON u.id=h.changed_by WHERE h.application_id=? ORDER BY h.created_at DESC",
        [application.id],
      ),
      rows<any[]>(
        `SELECT m.*,u.full_name senderName FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.application_id=? ${messageVisibilityClause} ORDER BY m.created_at DESC`,
        [application.id],
      ),
      rows<any[]>(
        "SELECT id,amount_rials amountRials,legal_fee_rials legalFeeRials,service_fee_rials serviceFeeRials,gateway,status,transaction_id transactionId,receipt_number receiptNumber,paid_at paidAt,created_at createdAt FROM payments WHERE application_id=? ORDER BY created_at DESC",
        [application.id],
      ),
      rows<any[]>(
        "SELECT x.id,x.expert_id expertId,x.assignment_type assignmentType,x.created_at createdAt,x.completed_at completedAt,u.full_name expertName FROM assignments x JOIN users u ON u.id=x.expert_id WHERE x.application_id=? ORDER BY x.created_at DESC",
        [application.id],
      ),
      rows<any[]>(
        "SELECT r.id,r.report_type reportType,r.result,r.body,r.signed_at signedAt,r.created_at createdAt,u.full_name expertName FROM expert_reports r JOIN users u ON u.id=r.expert_id WHERE r.application_id=? ORDER BY r.created_at DESC",
        [application.id],
      ),
      rows<any[]>(
        "SELECT rr.*,u.full_name reviewerName FROM risk_reviews rr JOIN users u ON u.id=rr.reviewer_id WHERE rr.application_id=? ORDER BY rr.created_at DESC",
        [application.id],
      ),
    ]);
    await audit(req, "application.view", "application", String(application.id));
    const owner = application.applicant_id === req.user!.id;
    const assigned = assignments.some(
      (assignment) =>
        assignment.expertId === req.user!.id && !assignment.completedAt,
    );
    const page04Rule = page04ServiceRules[application.serviceCode];
    const property = properties[0]
      ? {
          ...properties[0],
          address: decryptField(properties[0].address),
          coordinates: (() => {
            const raw = jsonStorageText(properties[0].coordinates);
            const decrypted = decryptField(raw);
            try {
              return decrypted ? JSON.parse(decrypted) : null;
            } catch {
              return properties[0].coordinates;
            }
          })(),
          notes: decryptField(properties[0].notes),
        }
      : null;
    const relatedProperties = properties.slice(1).map((property) => ({
      ...property,
      address: decryptField(property.address),
      notes: decryptField(property.notes),
    }));
    const partiesWithPlaintext = parties.map((party) => ({
      ...party,
      national_id: decryptField(party.national_id),
    }));
    const documentsWithNames = documents.map((document) => ({
      ...document,
      originalName: normalizeOriginalFilename(document.originalName),
    }));
    const servicePolicy = page04Rule
      ? {
          documentTypes: page04Rule.documentTypes,
          requiredDocuments: page04Rule.requiredDocuments,
          requiresRiskReview: Boolean(page04Rule.requiresRiskReview),
        }
      : null;
    const fullDetail = {
      ...application,
      form_data: (() => {
        const raw = jsonStorageText(application.form_data);
        const decrypted = decryptField(raw);
        try {
          return decrypted ? JSON.parse(decrypted) : {};
        } catch {
          return application.form_data;
        }
      })(),
      property,
      relatedProperties,
      parties: partiesWithPlaintext,
      documents: documentsWithNames,
      history,
      messages,
      payments,
      assignments,
      reports,
      riskReviews,
      servicePolicy,
      allowedActions: page04AllowedActions({
        role: req.user!.role,
        owner,
        assigned,
        status: application.status,
      }),
      ...(owner
        ? {
            trackingToken: createTrackingToken(
              application.id,
              application.file_number,
            ),
          }
        : {}),
    };
    if (req.user!.role === "observer")
      return res.json(
        observerApplicationDetail(application, {
          property,
          relatedProperties,
          parties: partiesWithPlaintext,
          documents: documentsWithNames,
          history,
          payments,
          assignments,
          reports,
          riskReviews,
          servicePolicy,
        }),
      );
    if (req.user!.role === "support" || req.user!.role === "finance")
      return res.json(
        restrictedApplicationDetail(
          application,
          {
            property,
            documents: documentsWithNames,
            history,
            messages,
            payments,
            assignments,
            servicePolicy,
          },
          req.user!.role,
        ),
      );
    res.json(fullDetail);
  } catch (error) {
    next(error);
  }
});

applicationsRouter.get("/:id/report", async (req: AuthRequest, res, next) => {
  try {
    const [application] = await rows<any[]>(
      "SELECT a.id,a.file_number,a.status,a.applicant_id,a.archived_at,a.created_at,s.title_fa serviceTitle,u.full_name applicantName FROM applications a JOIN services s ON s.id=a.service_id JOIN users u ON u.id=a.applicant_id WHERE a.id=?",
      [req.params.id],
    );
    if (!application)
      return res.status(404).json({ message: "پرونده پیدا نشد." });
    if (!(await userCanAccessApplication(req.user!, application.id)))
      return res.status(403).json({ message: "دسترسی مجاز نیست." });
    if (
      application.archived_at &&
      !(await hasArchivedApplicationAccess(
        req.user!,
        application.id,
        application.applicant_id,
        "export",
      ))
    )
      return res.status(403).json({
        code: "ARCHIVE_EXPORT_APPROVAL_REQUIRED",
        message: "استخراج پرونده بایگانی‌شده به مجوز معتبر صادرات نیاز دارد.",
      });
    const [documents, history, reports] = await Promise.all([
      rows<any[]>(
        "SELECT document_type,version,review_status,uploaded_at,sensitivity FROM documents WHERE application_id=? AND deleted_at IS NULL",
        [application.id],
      ),
      rows<any[]>(
        "SELECT to_status,reason,created_at FROM status_history WHERE application_id=? ORDER BY created_at",
        [application.id],
      ),
      rows<any[]>(
        "SELECT report_type,result,body,signed_at FROM expert_reports WHERE application_id=? ORDER BY created_at",
        [application.id],
      ),
    ]);
    const rowsHtml = (items: any[], cells: string[]) =>
      items
        .map(
          (item) =>
            `<tr>${cells.map((cell) => `<td>${escapeHtml(item[cell])}</td>`).join("")}</tr>`,
        )
        .join("");
    const observer = req.user!.role === "observer";
    const reportDocuments = observer
      ? documents.filter(
          (document) => document.sensitivity !== "highly_confidential",
        )
      : documents;
    const reportHistory = observer
      ? history.map((event) => ({
          to_status: event.to_status,
          created_at: event.created_at,
        }))
      : history;
    const reportRows = observer
      ? reports.map((report) => ({
          report_type: report.report_type,
          result: report.result,
          signed_at: report.signed_at,
        }))
      : reports;
    const html = `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>گزارش ${escapeHtml(application.file_number)}</title><style>body{font-family:Tahoma,sans-serif;margin:40px;color:#173832}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #ccd9d5;padding:9px;text-align:right}small{color:#667}</style><h1>گزارش مجاز پرونده ${escapeHtml(application.file_number)}</h1><p>خدمت: ${escapeHtml(application.serviceTitle)} | ${observer ? "متقاضی: غیرقابل نمایش" : `متقاضی: ${escapeHtml(application.applicantName)}`} | وضعیت: ${escapeHtml(application.status)}</p><h2>مدارک</h2><table><tr><th>نوع</th><th>نسخه</th><th>وضعیت</th><th>زمان</th></tr>${rowsHtml(reportDocuments, ["document_type", "version", "review_status", "uploaded_at"])}</table><h2>تاریخچه</h2><table><tr><th>وضعیت</th>${observer ? "" : "<th>دلیل</th>"}<th>زمان</th></tr>${rowsHtml(reportHistory, observer ? ["to_status", "created_at"] : ["to_status", "reason", "created_at"])}</table><h2>گزارش‌های کارشناسی</h2><table><tr><th>نوع</th><th>نتیجه</th>${observer ? "" : "<th>شرح</th>"}<th>امضا</th></tr>${rowsHtml(reportRows, observer ? ["report_type", "result", "signed_at"] : ["report_type", "result", "body", "signed_at"])}</table><small>این خروجی فقط گزارش داخلی و مجاز سامانه است و جایگزین تصمیم مرجع ثبتی نیست.</small></html>`;
    await audit(
      req,
      "application.report_export",
      "application",
      String(application.id),
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${application.file_number}.html"`,
    );
    res.send(html);
  } catch (error) {
    next(error);
  }
});

applicationsRouter.get(
  "/:id/report.csv",
  async (req: AuthRequest, res, next) => {
    try {
      const [application] = await rows<any[]>(
        "SELECT a.id,a.file_number,a.status,a.applicant_id,a.archived_at,a.created_at,s.title_fa serviceTitle,u.full_name applicantName FROM applications a JOIN services s ON s.id=a.service_id JOIN users u ON u.id=a.applicant_id WHERE a.id=?",
        [req.params.id],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      if (!(await userCanAccessApplication(req.user!, application.id)))
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      if (
        application.archived_at &&
        !(await hasArchivedApplicationAccess(
          req.user!,
          application.id,
          application.applicant_id,
          "export",
        ))
      )
        return res.status(403).json({
          code: "ARCHIVE_EXPORT_APPROVAL_REQUIRED",
          message: "استخراج پرونده بایگانی‌شده به مجوز معتبر صادرات نیاز دارد.",
        });
      const history = await rows<any[]>(
        "SELECT to_status,reason,note,created_at FROM status_history WHERE application_id=? ORDER BY created_at",
        [application.id],
      );
      const observer = req.user!.role === "observer";
      const csvCell = (value: unknown) => {
        const text = String(value ?? "");
        const safe = /^[-+=@]/.test(text) ? `'${text}` : text;
        return `"${safe.replaceAll('"', '""')}"`;
      };
      const lines = observer
        ? [
            ["شماره پرونده", "خدمت", "وضعیت", "تاریخ ایجاد"],
            [
              application.file_number,
              application.serviceTitle,
              application.status,
              application.created_at,
            ],
            [],
            ["وضعیت", "زمان"],
            ...history.map((item) => [item.to_status, item.created_at]),
          ]
        : [
            ["شماره پرونده", "خدمت", "متقاضی", "وضعیت", "تاریخ ایجاد"],
            [
              application.file_number,
              application.serviceTitle,
              application.applicantName,
              application.status,
              application.created_at,
            ],
            [],
            ["وضعیت", "دلیل", "یادداشت", "زمان"],
            ...history.map((item) => [
              item.to_status,
              item.reason,
              item.note,
              item.created_at,
            ]),
          ];
      await audit(
        req,
        "application.csv_export",
        "application",
        String(application.id),
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${application.file_number}.csv"`,
      );
      res.send(
        `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`,
      );
    } catch (error) {
      next(error);
    }
  },
);

applicationsRouter.post(
  "/:id/submit",
  authorize("applicant", "representative", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const [application] = await rows<any[]>(
        "SELECT a.id,a.file_number fileNumber,a.applicant_id,a.status,a.submitted_at submittedAt,s.code serviceCode FROM applications a JOIN services s ON s.id=a.service_id WHERE a.id=?",
        [req.params.id],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      if (
        req.user!.role !== "admin" &&
        application.applicant_id !== req.user!.id
      )
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      if (
        application.status !== "draft" &&
        application.status !== "awaiting_applicant"
      )
        return res
          .status(409)
          .json({ message: "پرونده در وضعیت قابل ارسال نیست." });
      const documents = await rows<any[]>(
        "SELECT DISTINCT document_type documentType FROM documents WHERE application_id=? AND deleted_at IS NULL AND review_status NOT IN ('rejected','needs_revision')",
        [application.id],
      );
      const missingDocuments = missingRequiredDocuments(
        application.serviceCode,
        documents.map((document) => document.documentType),
      );
      if (missingDocuments.length)
        return res.status(409).json({
          message: `مدارک الزامی کامل نیست: ${missingDocuments.join("، ")}`,
          missingDocuments,
        });
      await transaction(async (connection) => {
        const [updated] = await connection.execute<any>(
          "UPDATE applications SET status='submitted',declaration_accepted_at=NOW(),submitted_at=COALESCE(submitted_at,NOW()) WHERE id=? AND status=?",
          [application.id, application.status],
        );
        if (!updated.affectedRows) throw new ConcurrentSubmitError();
        await connection.execute(
          "INSERT INTO status_history (application_id,from_status,to_status,reason,changed_by) VALUES (?,?,?,?,?)",
          [
            application.id,
            application.status,
            "submitted",
            "ارسال نهایی توسط متقاضی و پذیرش مسئولیت صحت اطلاعات",
            req.user!.id,
          ],
        );
      });
      await audit(
        req,
        "application.submit",
        "application",
        String(application.id),
      );
      const [submitted] = await rows<any[]>(
        "SELECT submitted_at submittedAt FROM applications WHERE id=?",
        [application.id],
      );
      res.json({
        id: application.id,
        fileNumber: application.fileNumber,
        trackingToken: createTrackingToken(
          application.id,
          application.fileNumber,
        ),
        status: "submitted",
        submittedAt: submitted?.submittedAt ?? new Date().toISOString(),
        message: "پرونده شما با موفقیت ثبت و برای بررسی کارشناسی ارسال شد.",
      });
    } catch (error) {
      if (error instanceof ConcurrentSubmitError)
        return res.status(409).json({
          message:
            "وضعیت پرونده هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید.",
        });
      next(error);
    }
  },
);

applicationsRouter.post(
  "/:id/documents",
  authorize(
    "applicant",
    "representative",
    "registry_expert",
    "surveyor",
    "operations_manager",
    "compliance",
    "admin",
  ),
  upload.single("file"),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "فایل معتبر انتخاب نشده است." });
      if (!hasAllowedSignature(req.file.path, req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res
          .status(400)
          .json({ message: "محتوای فایل با نوع اعلام‌شده سازگار نیست." });
      }
      const documentType = String(req.body.documentType ?? "")
        .trim()
        .slice(0, 80);
      if (!documentType) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "نوع مدرک الزامی است." });
      }
      const sensitivity = [
        "normal",
        "confidential",
        "highly_confidential",
      ].includes(String(req.body.sensitivity))
        ? String(req.body.sensitivity)
        : "confidential";
      const [application] = await rows<any[]>(
        "SELECT a.applicant_id,a.status,s.code serviceCode FROM applications a JOIN services s ON s.id=a.service_id WHERE a.id=?",
        [req.params.id],
      );
      if (
        !application ||
        (["applicant", "representative"].includes(req.user!.role) &&
          application.applicant_id !== req.user!.id)
      ) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      }
      if (
        ["applicant", "representative"].includes(req.user!.role) &&
        !["draft", "awaiting_applicant", "documents_deficient"].includes(
          application.status,
        )
      ) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({
          message: "بارگذاری مدرک توسط متقاضی در این وضعیت مجاز نیست.",
        });
      }
      const serviceRule = page04ServiceRules[application.serviceCode];
      if (serviceRule && !serviceRule.documentTypes.includes(documentType)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: "نوع مدرک برای خدمت انتخاب‌شده معتبر نیست.",
          allowedDocumentTypes: serviceRule.documentTypes,
        });
      }
      if (
        [
          "completed",
          "closed_incomplete",
          "out_of_scope",
          "stopped_legal_technical",
          "stopped_security",
          "cancelled_by_applicant",
          "referred_complaint",
        ].includes(application.status)
      ) {
        fs.unlinkSync(req.file.path);
        return res
          .status(409)
          .json({ message: "پرونده بسته است و مدرک جدید نمی‌پذیرد." });
      }
      if (["registry_expert", "surveyor"].includes(req.user!.role)) {
        const [assignment] = await rows<any[]>(
          "SELECT id FROM assignments WHERE application_id=? AND expert_id=? AND completed_at IS NULL LIMIT 1",
          [req.params.id, req.user!.id],
        );
        if (!assignment) {
          fs.unlinkSync(req.file.path);
          return res
            .status(403)
            .json({ message: "این پرونده به شما ارجاع نشده است." });
        }
      }
      const hash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(req.file.path))
        .digest("hex");
      const originalName = normalizeOriginalFilename(req.file.originalname);
      const [latest] = await rows<any[]>(
        "SELECT MAX(version) version FROM documents WHERE application_id=? AND document_type=?",
        [req.params.id, documentType],
      );
      const version = (latest?.version ?? 0) + 1;
      const result = await transaction(async (connection) => {
        const [created] = await connection.execute<any>(
          "INSERT INTO documents (application_id,document_type,original_name,storage_name,mime_type,size_bytes,sha256,version,sensitivity,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [
            req.params.id,
            documentType,
            originalName,
            req.file!.filename,
            req.file!.mimetype,
            req.file!.size,
            hash,
            version,
            sensitivity,
            req.user!.id,
          ],
        );
        const confirmation = `دریافت مدرک «${documentType}» نسخه ${version} با موفقیت ثبت شد.`;
        await connection.execute(
          "INSERT INTO messages (application_id,sender_id,recipient_id,message_type,body,attachment_document_id) VALUES (?,?,?,?,?,?)",
          [
            req.params.id,
            req.user!.id,
            application.applicant_id === req.user!.id
              ? null
              : application.applicant_id,
            "document_receipt",
            confirmation,
            created.insertId,
          ],
        );
        if (application.applicant_id !== req.user!.id)
          await connection.execute(
            "INSERT INTO notifications (user_id,application_id,title,body) VALUES (?,?,?,?)",
            [
              application.applicant_id,
              req.params.id,
              "تأییدیه دریافت مدرک",
              confirmation,
            ],
          );
        return created;
      });
      await audit(req, "document.upload", "document", String(result.insertId), {
        applicationId: req.params.id,
        documentType,
        originalName,
        hash,
        confirmationMessage: true,
      });
      res.status(201).json({
        id: result.insertId,
        version,
        originalName,
        documentType,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      });
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      next(error);
    }
  },
);

applicationsRouter.post(
  "/:id/cancel",
  authorize("applicant", "representative", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({ reason: z.string().trim().min(5).max(1000) })
        .parse(req.body);
      const [application] = await rows<any[]>(
        "SELECT id,file_number fileNumber,applicant_id,status FROM applications WHERE id=?",
        [req.params.id],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      if (
        req.user!.role !== "admin" &&
        Number(application.applicant_id) !== Number(req.user!.id)
      )
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      const cancellable = [
        "draft",
        "submitted",
        "initial_review",
        "documents_deficient",
        "awaiting_applicant",
        "completed_documents",
        "awaiting_payment",
      ];
      if (!cancellable.includes(application.status))
        return res.status(409).json({
          message: "پرونده در این مرحله قابل لغو نیست.",
        });
      await transaction(async (connection) => {
        const [updated] = await connection.execute<any>(
          "UPDATE applications SET status='cancelled_by_applicant',closed_at=NOW(),archived_at=NOW() WHERE id=? AND status=?",
          [req.params.id, application.status],
        );
        if (!updated.affectedRows) throw new ConcurrentStatusChangeError();
        await connection.execute(
          "INSERT INTO status_history (application_id,from_status,to_status,reason,changed_by) VALUES (?,?,?,?,?)",
          [
            req.params.id,
            application.status,
            "cancelled_by_applicant",
            input.reason,
            req.user!.id,
          ],
        );
      });
      await audit(
        req,
        "application.cancel",
        "application",
        String(req.params.id),
        { fileNumber: application.fileNumber, reason: input.reason },
      );
      res.json({ status: "cancelled_by_applicant" });
    } catch (error) {
      if (error instanceof ConcurrentStatusChangeError)
        return res.status(409).json({
          message:
            "وضعیت پرونده هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید.",
        });
      next(error);
    }
  },
);

applicationsRouter.get(
  "/documents/:documentId/download",
  async (req: AuthRequest, res, next) => {
    try {
      const [document] = await rows<any[]>(
        "SELECT d.id,d.application_id,d.storage_name,d.original_name,d.mime_type,d.sensitivity,a.applicant_id,a.archived_at FROM documents d JOIN applications a ON a.id=d.application_id WHERE d.id=? AND d.deleted_at IS NULL",
        [req.params.documentId],
      );
      if (!document) return res.status(404).json({ message: "مدرک پیدا نشد." });
      if (
        document.archived_at &&
        !(await hasArchivedApplicationAccess(
          req.user!,
          document.application_id,
          document.applicant_id,
          "export",
        ))
      )
        return res.status(403).json({
          code: "ARCHIVE_EXPORT_APPROVAL_REQUIRED",
          message: "دریافت سند بایگانی‌شده به مجوز معتبر صادرات نیاز دارد.",
        });
      let allowed = document.applicant_id === req.user!.id;
      if (
        ["operations_manager", "compliance", "admin"].includes(req.user!.role)
      )
        allowed = true;
      if (
        req.user!.role === "observer" &&
        document.sensitivity !== "highly_confidential"
      )
        allowed = true;
      if (["registry_expert", "surveyor"].includes(req.user!.role)) {
        const [assignment] = await rows<any[]>(
          "SELECT id FROM assignments WHERE application_id=? AND expert_id=? AND completed_at IS NULL LIMIT 1",
          [document.application_id, req.user!.id],
        );
        allowed = Boolean(assignment);
      }
      if (!allowed)
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      const filePath = safeStoragePath(uploadRoot, document.storage_name);
      if (!filePath || !fs.existsSync(filePath))
        return res
          .status(410)
          .json({ message: "فایل در فضای ذخیره‌سازی موجود نیست." });
      await audit(req, "document.download", "document", String(document.id));
      res.setHeader("Content-Type", document.mime_type);
      res.setHeader(
        "Content-Disposition",
        contentDispositionFilename(document.original_name),
      );
      res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  },
);

applicationsRouter.delete(
  "/documents/:documentId",
  authorize("applicant", "representative", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const [document] = await rows<any[]>(
        "SELECT d.id,d.application_id,a.applicant_id,a.status FROM documents d JOIN applications a ON a.id=d.application_id WHERE d.id=? AND d.deleted_at IS NULL",
        [req.params.documentId],
      );
      if (!document) return res.status(404).json({ message: "مدرک پیدا نشد." });
      const applicant = ["applicant", "representative"].includes(
        req.user!.role,
      );
      if (applicant && document.applicant_id !== req.user!.id)
        return res.status(403).json({ message: "دسترسی مجاز نیست." });
      if (
        applicant &&
        !["draft", "awaiting_applicant", "documents_deficient"].includes(
          document.status,
        )
      )
        return res
          .status(409)
          .json({ message: "حذف مدرک در این مرحله مجاز نیست." });
      await execute("UPDATE documents SET deleted_at=NOW() WHERE id=?", [
        document.id,
      ]);
      await audit(req, "document.delete", "document", String(document.id), {
        applicationId: document.application_id,
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

applicationsRouter.patch(
  "/:id/status",
  authorize(
    "registry_expert",
    "surveyor",
    "operations_manager",
    "compliance",
    "admin",
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const allowed = new Set([
        "initial_review",
        "documents_deficient",
        "awaiting_applicant",
        "completed_documents",
        "awaiting_payment",
        "paid",
        "assigned_registry_expert",
        "assigned_surveyor",
        "under_expert_review",
        "registry_exchange",
        "awaiting_registry",
        "registry_return_deficient",
        "correcting_registry_deficiency",
        "additional_action",
        "ready_to_send",
        "completed",
        "closed_incomplete",
        "out_of_scope",
        "stopped_legal_technical",
        "stopped_security",
        "referred_complaint",
      ]);
      const status = String(req.body.status ?? "");
      const reason = String(req.body.reason ?? "").trim();
      const note = String(req.body.note ?? "").trim();
      if (!allowed.has(status) || reason.length < 5)
        return res
          .status(400)
          .json({ message: "وضعیت یا دلیل تغییر معتبر نیست." });
      if (!canChangeApplicationStatus(req.user!.role, status))
        return res.status(403).json({
          message: "ثبت این وضعیت برای نقش شما مجاز نیست.",
        });
      const [application] = await rows<any[]>(
        "SELECT a.status,a.applicant_id applicantId,s.code serviceCode FROM applications a JOIN services s ON s.id=a.service_id WHERE a.id=?",
        [req.params.id],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      if (!canTransitionApplicationStatus(application.status, status))
        return res.status(409).json({
          message: "تغییر وضعیت انتخاب‌شده با گردش فعلی پرونده سازگار نیست.",
          fromStatus: application.status,
          toStatus: status,
        });
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
      const serviceRule = page04ServiceRules[application.serviceCode];
      if (serviceRule) {
        const assignmentForStatus =
          status === "assigned_registry_expert"
            ? "registry_legal"
            : status === "assigned_surveyor"
              ? "survey"
              : null;
        if (assignmentForStatus) {
          const [assignment] = await rows<any[]>(
            "SELECT id FROM assignments WHERE application_id=? AND assignment_type=? AND completed_at IS NULL LIMIT 1",
            [req.params.id, assignmentForStatus],
          );
          if (!assignment)
            return res.status(409).json({
              message: "پیش از ثبت وضعیت ارجاع، کارشناس متناظر باید تعیین شود.",
            });
        }
        if (status === "completed") {
          const reports = await rows<any[]>(
            "SELECT DISTINCT report_type reportType FROM expert_reports WHERE application_id=? AND result='accepted' AND signed_at IS NOT NULL",
            [req.params.id],
          );
          const completedReportTypes = new Set(
            reports.map((report) => report.reportType),
          );
          const missingReports = serviceRule.requiredReports.filter(
            (reportType) => !completedReportTypes.has(reportType),
          );
          if (missingReports.length)
            return res.status(409).json({
              message: "گزارش‌های کارشناسی امضاشده خدمت کامل نیست.",
              missingReports,
            });
          if (serviceRule.requiresRiskReview) {
            const [riskReview] = await rows<any[]>(
              "SELECT id FROM risk_reviews WHERE application_id=? ORDER BY id DESC LIMIT 1",
              [req.params.id],
            );
            if (!riskReview)
              return res.status(409).json({
                message:
                  "کنترل هویت، تعارض منافع و اسناد مشکوک باید پیش از تکمیل ثبت شود.",
              });
          }
        }
      }
      if (
        ["registry_exchange", "ready_to_send", "completed"].includes(status)
      ) {
        const [requiredReview] = await rows<any[]>(
          "SELECT r.id FROM expert_reports r JOIN applications a ON a.id=r.application_id LEFT JOIN review_approvals ra ON ra.report_id=r.id AND ra.decision='approved' WHERE r.application_id=? AND (r.result='needs_second_review' OR a.risk_level IN ('high','critical')) AND ra.id IS NULL LIMIT 1",
          [req.params.id],
        );
        if (requiredReview)
          return res.status(409).json({
            message:
              "پرونده حساس پیش از ادامه به تأیید بازبین دوم مستقل نیاز دارد.",
          });
      }
      await transaction(async (connection) => {
        const [updated] = await connection.execute<any>(
          "UPDATE applications SET status=?,closed_at=IF(? IN ('completed','closed_incomplete','out_of_scope','stopped_legal_technical','stopped_security','cancelled_by_applicant','referred_complaint'),NOW(),closed_at),archived_at=IF(? IN ('closed_incomplete','out_of_scope','stopped_legal_technical','stopped_security','cancelled_by_applicant','referred_complaint'),NOW(),archived_at) WHERE id=? AND status=?",
          [status, status, status, String(req.params.id), application.status],
        );
        if (!updated.affectedRows) throw new ConcurrentStatusChangeError();
        await connection.execute(
          "INSERT INTO status_history (application_id,from_status,to_status,reason,note,changed_by) VALUES (?,?,?,?,?,?)",
          [
            String(req.params.id),
            application.status,
            status,
            reason,
            note || null,
            req.user!.id,
          ],
        );
        if (["documents_deficient", "awaiting_applicant"].includes(status)) {
          const title =
            status === "documents_deficient"
              ? "نقص مدارک پرونده"
              : "اقدام متقاضی لازم است";
          const body = note ? `${reason}\n${note}` : reason;
          await connection.execute(
            "INSERT INTO notifications (user_id,application_id,title,body) VALUES (?,?,?,?)",
            [application.applicantId, req.params.id, title, body],
          );
        }
      });
      await audit(
        req,
        "application.status_change",
        "application",
        String(req.params.id),
        { from: application.status, to: status, reason },
      );
      res.json({ status });
    } catch (error) {
      if (error instanceof ConcurrentStatusChangeError)
        return res.status(409).json({
          message:
            "وضعیت پرونده هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید.",
        });
      next(error);
    }
  },
);

applicationsRouter.patch(
  "/:id/archive",
  authorize("operations_manager", "compliance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await execute(
        "UPDATE applications SET archived_at=NOW() WHERE id=? AND closed_at IS NOT NULL",
        [req.params.id],
      );
      if (!result.affectedRows)
        return res
          .status(409)
          .json({ message: "فقط پرونده مختومه قابل بایگانی است." });
      await audit(
        req,
        "application.archive",
        "application",
        String(req.params.id),
      );
      res.json({ archived: true });
    } catch (error) {
      next(error);
    }
  },
);
