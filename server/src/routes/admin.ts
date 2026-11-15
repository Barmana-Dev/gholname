import { Router } from "express";
import os from "node:os";
import fs from "node:fs";
import { config } from "../config.js";
import { execute, rows } from "../db.js";
import {
  audit,
  authenticate,
  authorize,
  enforceReadOnlyRole,
  generateCode,
} from "../security.js";
import type { AuthRequest } from "../types.js";
import { z } from "zod";
import bcrypt from "bcrypt";
import { requireCapability } from "../access.js";
import crypto from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  organizationProfileFromRow,
  organizationProfileSchema,
} from "../organization-profile.js";
import {
  canApproveArchiveAccess,
  isValidArchiveGrantPeriod,
} from "../archive-access.js";
import { pagination, paginationHeaders } from "../pagination.js";
import {
  observerArchiveItem,
  observerAuditLog,
  observerBackup,
  observerIncident,
  observerSecurityEvent,
  observerService,
} from "../observer-data.js";

const execFileAsync = promisify(execFile);

export const adminRouter = Router();
adminRouter.use(
  authenticate,
  enforceReadOnlyRole("observer"),
  requireCapability("dashboard.view"),
);

adminRouter.get(
  "/organization-profile",
  requireCapability("organization_profile.read"),
  async (_req, res, next) => {
    try {
      const [profile] = await rows<any[]>(
        "SELECT legal_name legalName,national_id nationalId,registration_number registrationNumber,activity_subject activitySubject,legal_basis legalBasis,supervisory_authority supervisoryAuthority,plan_type planType,document_version documentVersion,publication_status publicationStatus,revision,published_at publishedAt,updated_at updatedAt FROM organization_profile WHERE id=1 LIMIT 1",
      );
      if (!profile)
        return res.status(503).json({
          message: "ساختار اطلاعات ثبتی کارگزاری راه‌اندازی نشده است.",
        });
      res.json(organizationProfileFromRow(profile));
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.put(
  "/organization-profile",
  requireCapability("organization_profile.manage"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = organizationProfileSchema.parse(req.body);
      const result = await execute(
        "UPDATE organization_profile SET legal_name=?,national_id=?,registration_number=?,activity_subject=?,legal_basis=?,supervisory_authority=?,plan_type=?,document_version=?,publication_status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,NOW()) ELSE NULL END,updated_by=?,revision=revision+1 WHERE id=1 AND revision=?",
        [
          input.legalName,
          input.nationalId,
          input.registrationNumber,
          input.activitySubject,
          input.legalBasis,
          input.supervisoryAuthority,
          input.planType,
          input.documentVersion,
          input.publicationStatus,
          input.publicationStatus,
          req.user!.id,
          input.expectedRevision,
        ],
      );
      if (!result.affectedRows)
        return res.status(409).json({
          message:
            "اطلاعات در نشست دیگری تغییر کرده است. صفحه را تازه‌سازی و دوباره بررسی کنید.",
        });
      await audit(
        req,
        "organization_profile.update",
        "organization_profile",
        "1",
        {
          publicationStatus: input.publicationStatus,
          revision: input.expectedRevision + 1,
        },
      );
      const [profile] = await rows<any[]>(
        "SELECT legal_name legalName,national_id nationalId,registration_number registrationNumber,activity_subject activitySubject,legal_basis legalBasis,supervisory_authority supervisoryAuthority,plan_type planType,document_version documentVersion,publication_status publicationStatus,revision,published_at publishedAt,updated_at updatedAt FROM organization_profile WHERE id=1",
      );
      res.json(organizationProfileFromRow(profile));
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  "/archives",
  requireCapability("archives.read"),
  async (req: AuthRequest, res, next) => {
    try {
      const page = pagination(req, { limit: 100, maxLimit: 500 });
      const items = await rows<any[]>(
        "SELECT a.id,a.file_number fileNumber,s.title_fa serviceTitle,u.full_name applicantName,a.status,a.archived_at archivedAt,GROUP_CONCAT(DISTINCT CONCAT_WS(' / ',p.province,p.county,p.registry_section,p.main_plate,p.sub_plate) SEPARATOR '، ') propertySummary FROM applications a JOIN services s ON s.id=a.service_id JOIN users u ON u.id=a.applicant_id LEFT JOIN properties p ON p.application_id=a.id WHERE a.archived_at IS NOT NULL GROUP BY a.id,s.title_fa,u.full_name ORDER BY a.archived_at DESC,a.id DESC LIMIT ? OFFSET ?",
        [page.limit, page.offset],
      );
      res.json(
        req.user?.role === "observer"
          ? items.map((item) => observerArchiveItem(item))
          : items,
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  "/archive-access-requests",
  requireCapability("archives.read"),
  async (req: AuthRequest, res, next) => {
    try {
      const page = pagination(req, { limit: 100, maxLimit: 500 });
      const manager = ["operations_manager", "admin"].includes(req.user!.role);
      const params: unknown[] = manager ? [] : [req.user!.id];
      params.push(page.limit, page.offset);
      res.json(
        await rows<any[]>(
          `SELECT ar.id,ar.application_id applicationId,a.file_number fileNumber,ar.access_mode accessMode,ar.reason,ar.valid_until validUntil,ar.status,ar.decision_note decisionNote,ar.created_at createdAt,r.full_name requesterName,d.full_name decidedByName FROM archive_access_requests ar JOIN applications a ON a.id=ar.application_id JOIN users r ON r.id=ar.requested_by LEFT JOIN users d ON d.id=ar.decided_by ${manager ? "" : "WHERE ar.requested_by=?"} ORDER BY ar.id DESC LIMIT ? OFFSET ?`,
          params,
        ),
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  "/archive-access-requests",
  requireCapability("archives.request"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          applicationId: z.coerce.number().int().positive(),
          accessMode: z.enum(["view", "export"]),
          reason: z.string().trim().min(10).max(2000),
          validUntil: z.coerce.date(),
        })
        .parse(req.body);
      if (!isValidArchiveGrantPeriod(input.validUntil))
        return res.status(400).json({
          message: "اعتبار دسترسی باید در آینده و حداکثر تا یک سال باشد.",
        });
      const [application] = await rows<any[]>(
        "SELECT id FROM applications WHERE id=? AND archived_at IS NOT NULL",
        [input.applicationId],
      );
      if (!application)
        return res
          .status(404)
          .json({ message: "پرونده بایگانی‌شده پیدا نشد." });
      const [pending] = await rows<any[]>(
        "SELECT id FROM archive_access_requests WHERE application_id=? AND requested_by=? AND status='pending' LIMIT 1",
        [input.applicationId, req.user!.id],
      );
      if (pending)
        return res
          .status(409)
          .json({ message: "یک درخواست باز قبلاً ثبت شده است." });
      const result = await execute(
        "INSERT INTO archive_access_requests (application_id,requested_by,access_mode,reason,valid_until) VALUES (?,?,?,?,?)",
        [
          input.applicationId,
          req.user!.id,
          input.accessMode,
          input.reason,
          input.validUntil,
        ],
      );
      await audit(
        req,
        "archive_access.request",
        "archive_access_request",
        String(result.insertId),
        { applicationId: input.applicationId, accessMode: input.accessMode },
      );
      res.status(201).json({ id: result.insertId, status: "pending" });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  "/archive-access-requests/:id",
  authorize("operations_manager", "admin"),
  requireCapability("archives.approve"),
  async (req: AuthRequest, res, next) => {
    try {
      if (!canApproveArchiveAccess(req.user!))
        return res.status(403).json({
          code: "MANAGER_MFA_REQUIRED",
          message: "تأیید دسترسی بایگانی فقط با ورود دومرحله‌ای مدیر مجاز است.",
        });
      const input = z
        .object({
          decision: z.enum(["approved", "rejected"]),
          note: z.string().trim().min(5).max(2000),
        })
        .parse(req.body);
      const result = await execute(
        "UPDATE archive_access_requests SET status=?,decided_by=?,decision_note=?,decided_at=NOW() WHERE id=? AND status='pending' AND requested_by<>?",
        [input.decision, req.user!.id, input.note, req.params.id, req.user!.id],
      );
      if (!result.affectedRows)
        return res.status(409).json({
          message:
            "درخواست باز پیدا نشد یا مدیر نمی‌تواند درخواست خود را تأیید کند.",
        });
      await audit(
        req,
        `archive_access.${input.decision}`,
        "archive_access_request",
        String(req.params.id),
      );
      res.json({ status: input.decision });
    } catch (error) {
      next(error);
    }
  },
);

const serviceDefinitionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(60),
    title: z.string().trim().min(3).max(180),
    category: z.enum(["legal", "technical"]),
    description: z.string().trim().min(20).max(5000),
    requirements: z.array(z.string().trim().min(2).max(300)).min(1).max(100),
    workflow: z.array(z.string().trim().min(2).max(80)).min(1).max(100),
    allowedRoles: z.array(z.string().trim().min(2).max(40)).min(1).max(30),
    automaticMessages: z
      .array(z.string().trim().min(2).max(500))
      .max(50)
      .default([]),
    legalFeeRials: z.number().int().nonnegative().default(0),
    serviceFeeRials: z.number().int().nonnegative().default(0),
    requirementsVersion: z.string().trim().min(1).max(30).default("draft-1"),
    apiCode: z.string().trim().max(80).nullable().optional(),
    apiPayloadFields: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/)
          .refine(
            (value) =>
              value
                .split(".")
                .every(
                  (segment) =>
                    !["__proto__", "constructor", "prototype"].includes(
                      segment,
                    ),
                ),
            "فیلدهای payload مجاز نیستند.",
          ),
      )
      .max(100)
      .default([]),
  })
  .strict();

adminRouter.post(
  "/services",
  authorize("operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = serviceDefinitionSchema.parse(req.body);
      const result = await execute(
        "INSERT INTO services (code,title_fa,category,description,requirements,workflow,allowed_roles,automatic_messages,fee_rials,legal_fee_rials,service_fee_rials,requirements_version,api_code,api_payload_fields) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          input.code,
          input.title,
          input.category,
          input.description,
          JSON.stringify(input.requirements),
          JSON.stringify(input.workflow),
          JSON.stringify(input.allowedRoles),
          JSON.stringify(input.automaticMessages),
          input.legalFeeRials + input.serviceFeeRials,
          input.legalFeeRials,
          input.serviceFeeRials,
          input.requirementsVersion,
          input.apiCode ?? null,
          JSON.stringify(input.apiPayloadFields),
        ],
      );
      await audit(req, "service.create", "service", String(result.insertId), {
        code: input.code,
        category: input.category,
      });
      res.status(201).json({ id: result.insertId, code: input.code });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ER_DUP_ENTRY"
      )
        return res.status(409).json({
          message: "کد خدمت قبلاً ثبت شده است.",
        });
      next(error);
    }
  },
);

adminRouter.get(
  "/reports/sla.csv",
  requireCapability("reports.export"),
  async (req: AuthRequest, res, next) => {
    try {
      const month = z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .default(new Date().toISOString().slice(0, 7))
        .parse(req.query.month);
      const [summary] = await rows<any[]>(
        "SELECT COUNT(*) observations,SUM(status='operational') operational,SUM(status='degraded') degraded,SUM(status='outage') outage,ROUND(100*SUM(status='operational')/NULLIF(COUNT(*),0),2) availabilityRate,ROUND(AVG(response_time_ms),2) averageResponseMs FROM service_health WHERE observed_at>=CONCAT(?,'-01') AND observed_at<DATE_ADD(CONCAT(?,'-01'),INTERVAL 1 MONTH)",
        [month, month],
      );
      const incidents = await rows<any[]>(
        "SELECT incident_code,service_code,severity,title,started_at,resolved_at,root_cause,corrective_action FROM system_incidents WHERE started_at>=CONCAT(?,'-01') AND started_at<DATE_ADD(CONCAT(?,'-01'),INTERVAL 1 MONTH) ORDER BY started_at",
        [month, month],
      );
      const cell = (value: unknown) => {
        const text = String(value ?? "");
        const safe = /^[-+=@]/.test(text) ? `'${text}` : text;
        return `"${safe.replaceAll('"', '""')}"`;
      };
      const observer = req.user?.role === "observer";
      const lines: unknown[][] = [
        ["ماه", month],
        ["هدف SLA", "99%"],
        ["نرخ پایداری", `${summary?.availabilityRate ?? 0}%`],
        ["تعداد نمونه", summary?.observations ?? 0],
        ["عملیاتی", summary?.operational ?? 0],
        ["اختلال", summary?.degraded ?? 0],
        ["قطعی", summary?.outage ?? 0],
        ["میانگین پاسخ ms", summary?.averageResponseMs ?? 0],
        [],
        observer
          ? ["کد رخداد", "سرویس", "شدت", "عنوان", "شروع", "رفع"]
          : [
              "کد رخداد",
              "سرویس",
              "شدت",
              "عنوان",
              "شروع",
              "رفع",
              "علت",
              "اقدام اصلاحی",
            ],
        ...incidents.map((item) =>
          observer
            ? [
                item.incident_code,
                item.service_code,
                item.severity,
                item.title,
                item.started_at,
                item.resolved_at,
              ]
            : [
                item.incident_code,
                item.service_code,
                item.severity,
                item.title,
                item.started_at,
                item.resolved_at,
                item.root_cause,
                item.corrective_action,
              ],
        ),
      ];
      await audit(req, "sla.monthly_export", "sla_report", month);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="sla-${month}.csv"`,
      );
      res.send(
        `\uFEFF${lines.map((line) => line.map(cell).join(",")).join("\r\n")}`,
      );
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/dashboard", async (req: AuthRequest, res, next) => {
  try {
    const [
      [counts],
      byStatus,
      complaints,
      api,
      apiTrend,
      auditEvents,
      [support],
      [payments],
      [archive],
      incidents,
      [queue],
      [quality],
      [reviewTime],
      [health],
      securityEvents,
      [backup],
    ] = await Promise.all([
      rows<any[]>(
        "SELECT COUNT(*) totalApplications,SUM(status='completed') completed,SUM(risk_level IN ('high','critical')) highRisk FROM applications",
      ),
      rows<any[]>(
        "SELECT status,COUNT(*) count FROM applications GROUP BY status ORDER BY count DESC",
      ),
      rows<any[]>(
        "SELECT status,COUNT(*) count FROM complaints GROUP BY status",
      ),
      rows<any[]>(
        "SELECT service_code serviceCode,COUNT(*) requests,ROUND(AVG(duration_ms)) averageDurationMs,MIN(duration_ms) minimumDurationMs,MAX(duration_ms) maximumDurationMs,SUM(outcome='error') errors FROM api_logs WHERE created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) GROUP BY service_code",
      ),
      rows<any[]>(
        "SELECT DATE(created_at) day,COUNT(*) requests,ROUND(AVG(duration_ms)) averageDurationMs,SUM(outcome='error') errors FROM api_logs WHERE created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY day",
      ),
      rows<any[]>(
        "SELECT action,entity_type entityType,created_at createdAt FROM audit_logs ORDER BY id DESC LIMIT 12",
      ),
      rows<any[]>(
        "SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE,created_at,first_response_at))) averageFirstResponseMinutes,COUNT(*) totalTickets,SUM(status='closed') closedTickets FROM support_tickets",
      ),
      rows<any[]>(
        "SELECT COUNT(*) totalPayments,SUM(status='successful') successfulPayments,SUM(status='refunded') refundedPayments,COALESCE(SUM(IF(status='successful',amount_rials,0)),0) successfulAmount FROM payments",
      ),
      rows<any[]>(
        "SELECT SUM(archived_at IS NOT NULL) archivedApplications FROM applications",
      ),
      rows<any[]>(
        "SELECT incident_code incidentCode,service_code serviceCode,severity,title,started_at startedAt,resolved_at resolvedAt,root_cause rootCause,corrective_action correctiveAction FROM system_incidents ORDER BY started_at DESC LIMIT 30",
      ),
      rows<any[]>(
        "SELECT SUM(status IN ('queued','failed','processing')) pendingJobs,SUM(status='dead_letter') deadLetterJobs,SUM(status='succeeded') succeededJobs FROM integration_jobs",
      ),
      rows<any[]>(
        "SELECT ROUND(AVG(quality_score),2) averageQualityScore,COUNT(quality_score) ratedInteractions FROM support_interactions",
      ),
      rows<any[]>(
        "SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR,a.submitted_at,h.created_at)),2) averageInitialReviewHours FROM applications a JOIN status_history h ON h.application_id=a.id AND h.to_status='initial_review' WHERE a.submitted_at IS NOT NULL",
      ),
      rows<any[]>(
        "SELECT COUNT(*) observations,SUM(status='operational') operational,SUM(status='degraded') degraded,SUM(status='outage') outage,ROUND(100*SUM(status='operational')/NULLIF(COUNT(*),0),2) availabilityRate,ROUND(AVG(response_time_ms),2) averageResponseMs FROM service_health WHERE observed_at>=DATE_SUB(NOW(),INTERVAL 30 DAY)",
      ),
      rows<any[]>(
        "SELECT id,event_type eventType,severity,status,created_at createdAt FROM security_events ORDER BY id DESC LIMIT 30",
      ),
      rows<any[]>(
        "SELECT status,completed_at completedAt,verified_at verifiedAt FROM backup_runs ORDER BY id DESC LIMIT 1",
      ),
    ]);
    const memory = process.memoryUsage();
    const disk = fs.statfsSync(config.MONITOR_DISK_PATH);
    res.json({
      counts: counts ?? { totalApplications: 0, completed: 0, highRisk: 0 },
      byStatus,
      complaints,
      api,
      apiTrend,
      auditEvents,
      incidents:
        req.user?.role === "observer"
          ? incidents.map((item) => observerIncident(item))
          : incidents,
      securityEvents,
      resources: {
        processUptimeSeconds: Math.round(process.uptime()),
        systemUptimeSeconds: Math.round(os.uptime()),
        processMemoryMb: Math.round(memory.rss / 1024 / 1024),
        totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
        freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
        diskTotalMb: Math.round((disk.blocks * disk.bsize) / 1024 / 1024),
        diskFreeMb: Math.round((disk.bavail * disk.bsize) / 1024 / 1024),
        pendingJobs: Number(queue?.pendingJobs ?? 0),
        deadLetterJobs: Number(queue?.deadLetterJobs ?? 0),
        database: "connected",
      },
      kpis: {
        completionRate: counts?.totalApplications
          ? Number(
              ((counts.completed / counts.totalApplications) * 100).toFixed(2),
            )
          : 0,
        averageFirstResponseMinutes: support?.averageFirstResponseMinutes ?? 0,
        complaintResolutionRate: complaints.reduce(
          (total: number, item: any) => total + Number(item.count),
          0,
        )
          ? Number(
              (
                (complaints
                  .filter((item: any) =>
                    ["answered", "closed"].includes(item.status),
                  )
                  .reduce(
                    (total: number, item: any) => total + Number(item.count),
                    0,
                  ) /
                  complaints.reduce(
                    (total: number, item: any) => total + Number(item.count),
                    0,
                  )) *
                100
              ).toFixed(2),
            )
          : 0,
        successfulPayments: payments?.successfulPayments ?? 0,
        archivedApplications: archive?.archivedApplications ?? 0,
        averageInitialReviewHours: reviewTime?.averageInitialReviewHours ?? 0,
        supportQualityScore: quality?.averageQualityScore ?? 0,
        serviceAvailabilityRate: health?.availabilityRate ?? 0,
        apiSuccessRate: api.reduce(
          (total: number, item: any) => total + Number(item.requests),
          0,
        )
          ? Number(
              (
                (1 -
                  api.reduce(
                    (total: number, item: any) => total + Number(item.errors),
                    0,
                  ) /
                    api.reduce(
                      (total: number, item: any) =>
                        total + Number(item.requests),
                      0,
                    )) *
                100
              ).toFixed(2),
            )
          : 0,
        backupStatus: backup?.status ?? "not_run",
      },
      sla: {
        targetPercent: 99,
        periodDays: 30,
        availabilityPercent: Number(health?.availabilityRate ?? 0),
        observations: Number(health?.observations ?? 0),
        degradedObservations: Number(health?.degraded ?? 0),
        outageObservations: Number(health?.outage ?? 0),
        averageResponseMs: Number(health?.averageResponseMs ?? 0),
        openIncidents: incidents.filter((item: any) => !item.resolvedAt).length,
        targetMet:
          Number(health?.observations ?? 0) > 0 &&
          Number(health?.availabilityRate ?? 0) >= 99,
        fallbackReady:
          ["successful", "verified"].includes(backup?.status ?? "") &&
          Number(queue?.deadLetterJobs ?? 0) === 0,
      },
      integrations: {
        payment: config.PAYMENT_MODE,
        registryApi: config.REGISTRY_API_MODE,
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get(
  "/audit-logs",
  requireCapability("audit.read"),
  async (req: AuthRequest, res, next) => {
    try {
      const page = pagination(req, { limit: 100, maxLimit: 500 });
      const items = await rows<any[]>(
        "SELECT combined.id,combined.action,combined.entityType,combined.entityId,combined.ipAddress,combined.createdAt,combined.actorName FROM (SELECT CONCAT('audit-',l.id) id,l.action,l.entity_type entityType,l.entity_id entityId,l.ip_address ipAddress,l.created_at createdAt,u.full_name actorName FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id UNION ALL SELECT CONCAT('api-',r.id) id,CONCAT('api.request.',LOWER(r.method)) action,'api_request' entityType,r.request_id entityId,r.ip_address ipAddress,r.created_at createdAt,u.full_name actorName FROM api_request_logs r LEFT JOIN users u ON u.id=r.actor_id) combined ORDER BY combined.createdAt DESC LIMIT ? OFFSET ?",
        [page.limit, page.offset],
      );
      res.json(
        req.user?.role === "observer"
          ? items.map((item) => observerAuditLog(item))
          : items,
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  "/reports/operations.csv",
  requireCapability("reports.export"),
  async (req: AuthRequest, res, next) => {
    try {
      const applications = await rows<any[]>(
        "SELECT a.file_number,s.title_fa service,a.status,a.risk_level,u.full_name applicant,a.created_at,a.updated_at,a.closed_at FROM applications a JOIN services s ON s.id=a.service_id JOIN users u ON u.id=a.applicant_id ORDER BY a.created_at DESC LIMIT 5000",
      );
      const cell = (value: unknown) => {
        const text = String(value ?? "");
        const safe = /^[-+=@]/.test(text) ? `'${text}` : text;
        return `"${safe.replaceAll('"', '""')}"`;
      };
      const observer = req.user?.role === "observer";
      const lines = [
        observer
          ? [
              "شماره پرونده",
              "خدمت",
              "وضعیت",
              "ریسک",
              "ایجاد",
              "آخرین تغییر",
              "خاتمه",
            ]
          : [
              "شماره پرونده",
              "خدمت",
              "وضعیت",
              "ریسک",
              "متقاضی",
              "ایجاد",
              "آخرین تغییر",
              "خاتمه",
            ],
        ...applications.map((item) =>
          observer
            ? [
                item.file_number,
                item.service,
                item.status,
                item.risk_level,
                item.created_at,
                item.updated_at,
                item.closed_at,
              ]
            : [
                item.file_number,
                item.service,
                item.status,
                item.risk_level,
                item.applicant,
                item.created_at,
                item.updated_at,
                item.closed_at,
              ],
        ),
      ];
      await audit(req, "admin.operations_export", "report", "operations");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="operations-report.csv"',
      );
      res.send(
        `\uFEFF${lines.map((line) => line.map(cell).join(",")).join("\r\n")}`,
      );
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  "/users/:id",
  authorize("admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          role: z.string().trim().min(2).max(40).optional(),
          status: z.enum(["active", "suspended", "pending"]).optional(),
        })
        .refine((value) => Object.keys(value).length > 0)
        .parse(req.body);
      const [role] = input.role
        ? await rows<any[]>("SELECT id FROM roles WHERE code=?", [input.role])
        : [null];
      if (input.role && !role)
        return res.status(400).json({ message: "نقش معتبر نیست." });
      const result = await execute(
        "UPDATE users SET role_id=COALESCE(?,role_id),status=COALESCE(?,status) WHERE id=?",
        [role?.id ?? null, input.status ?? null, req.params.id],
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "کاربر پیدا نشد." });
      await audit(
        req,
        "user.access_update",
        "user",
        String(req.params.id),
        input,
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  "/backups",
  authorize("technical", "admin", "observer"),
  async (req: AuthRequest, res, next) => {
    try {
      const page = pagination(req, { limit: 50, maxLimit: 100 });
      const items = await rows<any[]>(
        "SELECT id,backup_code backupCode,status,database_file databaseFile,checksum_sha256 checksumSha256,size_bytes sizeBytes,error_message errorMessage,started_at startedAt,completed_at completedAt,verified_at verifiedAt FROM backup_runs ORDER BY id DESC LIMIT ? OFFSET ?",
        [page.limit, page.offset],
      );
      res.json(
        req.user?.role === "observer"
          ? items.map((item) => observerBackup(item))
          : items,
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  "/backups",
  authorize("admin"),
  async (req: AuthRequest, res, next) => {
    const backupCode = generateCode("BKP");
    let backupId: number | bigint | undefined;
    try {
      if (!config.BACKUP_ENCRYPTION_PASSWORD)
        return res
          .status(503)
          .json({ message: "رمز مستقل backup در محیط تنظیم نشده است." });
      const created = await execute(
        "INSERT INTO backup_runs (backup_code,status,created_by) VALUES (?,'running',?)",
        [backupCode, req.user!.id],
      );
      backupId = created.insertId;
      const root = path.resolve(process.cwd());
      const { stdout } = await execFileAsync(
        "bash",
        [path.join(root, "database/backup.sh")],
        {
          cwd: root,
          env: {
            ...process.env,
            DB_HOST: config.DB_HOST,
            DB_PORT: String(config.DB_PORT),
            DB_USER: config.DB_USER,
            DB_PASSWORD: config.DB_PASSWORD,
            DB_NAME: config.DB_NAME,
            UPLOAD_DIR: config.UPLOAD_DIR,
            BACKUP_DIR: config.BACKUP_DIR,
            BACKUP_ENCRYPTION_PASSWORD: config.BACKUP_ENCRYPTION_PASSWORD,
            MYSQLDUMP_BIN: config.MYSQLDUMP_BIN,
          },
          timeout: 10 * 60_000,
          maxBuffer: 1024 * 1024,
        },
      );
      const filePath = path.resolve(stdout.trim().split("\n").at(-1) ?? "");
      const stat = fs.statSync(filePath);
      const checksum = crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
      await execute(
        "UPDATE backup_runs SET status='successful',database_file=?,checksum_sha256=?,size_bytes=?,completed_at=NOW() WHERE id=?",
        [filePath, checksum, stat.size, backupId],
      );
      await audit(req, "backup.create", "backup_run", String(backupId), {
        backupCode,
        checksum,
      });
      res
        .status(201)
        .json({ id: backupId, backupCode, checksum, sizeBytes: stat.size });
    } catch (error) {
      if (backupId)
        await execute(
          "UPDATE backup_runs SET status='failed',error_message=?,completed_at=NOW() WHERE id=?",
          [
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "unknown error",
            backupId,
          ],
        ).catch(() => undefined);
      next(error);
    }
  },
);

adminRouter.post(
  "/backups/:id/verify",
  authorize("technical", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const [backup] = await rows<any[]>(
        "SELECT database_file,checksum_sha256 FROM backup_runs WHERE id=? AND status IN ('successful','verified')",
        [req.params.id],
      );
      if (!backup || !fs.existsSync(backup.database_file))
        return res.status(404).json({ message: "فایل backup پیدا نشد." });
      const checksum = crypto
        .createHash("sha256")
        .update(fs.readFileSync(backup.database_file))
        .digest("hex");
      if (checksum !== backup.checksum_sha256)
        return res
          .status(409)
          .json({ message: "checksum فایل backup معتبر نیست." });
      await execute(
        "UPDATE backup_runs SET status='verified',verified_at=NOW() WHERE id=?",
        [req.params.id],
      );
      await audit(req, "backup.verify", "backup_run", String(req.params.id), {
        checksum,
      });
      res.json({ verified: true, checksum });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  "/users",
  authorize("admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          fullName: z.string().trim().min(3).max(150),
          email: z.string().email().max(190),
          mobile: z
            .string()
            .regex(/^09\d{9}$/)
            .optional(),
          role: z.string().trim().min(2).max(40),
          temporaryPassword: z
            .string()
            .min(12)
            .max(128)
            .regex(/[A-Z]/)
            .regex(/[a-z]/)
            .regex(/\d/)
            .regex(/[^A-Za-z0-9]/),
        })
        .parse(req.body);
      const [role] = await rows<any[]>("SELECT id FROM roles WHERE code=?", [
        input.role,
      ]);
      if (!role) return res.status(400).json({ message: "نقش معتبر نیست." });
      const passwordHash = await bcrypt.hash(input.temporaryPassword, 12);
      const result = await execute(
        "INSERT INTO users (role_id,full_name,email,mobile,password_hash,status) VALUES (?,?,?,?,?,'pending')",
        [
          role.id,
          input.fullName,
          input.email.toLowerCase(),
          input.mobile ?? null,
          passwordHash,
        ],
      );
      await audit(req, "user.admin_create", "user", String(result.insertId), {
        role: input.role,
      });
      res.status(201).json({ id: result.insertId, status: "pending" });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  "/security-events",
  authorize("technical", "compliance", "admin", "observer"),
  async (req: AuthRequest, res, next) => {
    try {
      const page = pagination(req, { limit: 100, maxLimit: 250 });
      const items = await rows<any[]>(
        "SELECT se.*,u.full_name userName,r.full_name reviewerName FROM security_events se LEFT JOIN users u ON u.id=se.user_id LEFT JOIN users r ON r.id=se.reviewed_by ORDER BY se.id DESC LIMIT ? OFFSET ?",
        [page.limit, page.offset],
      );
      res.json(
        req.user?.role === "observer"
          ? items.map((item) => observerSecurityEvent(item))
          : items,
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  "/security-events/:id",
  authorize("compliance", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          status: z.enum(["reviewed", "resolved", "false_positive"]),
        })
        .parse(req.body);
      const result = await execute(
        "UPDATE security_events SET status=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?",
        [input.status, req.user!.id, req.params.id],
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "رخداد پیدا نشد." });
      await audit(
        req,
        "security_event.review",
        "security_event",
        String(req.params.id),
        input,
      );
      res.json({ status: input.status });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/retention-policies", async (_req, res, next) => {
  try {
    res.json(
      await rows<any[]>(
        "SELECT * FROM retention_policies ORDER BY data_category",
      ),
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get(
  "/payments",
  authorize("operations_manager", "compliance", "admin"),
  async (req, res, next) => {
    try {
      const page = pagination(req, { limit: 100, maxLimit: 250 });
      res.json(
        await rows<any[]>(
          "SELECT p.id,p.application_id applicationId,p.amount_rials amountRials,p.legal_fee_rials legalFeeRials,p.service_fee_rials serviceFeeRials,p.gateway,p.status,p.transaction_id transactionId,p.receipt_number receiptNumber,p.paid_at paidAt,a.file_number fileNumber FROM payments p JOIN applications a ON a.id=p.application_id ORDER BY p.created_at DESC,p.id DESC LIMIT ? OFFSET ?",
          [page.limit, page.offset],
        ),
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  "/users",
  authorize("operations_manager", "compliance", "admin"),
  async (req, res, next) => {
    try {
      const page = pagination(req, { limit: 100, maxLimit: 250 });
      res.json(
        await rows<any[]>(
          "SELECT u.id,u.full_name fullName,u.email,u.mobile,u.status,r.code role,r.title_fa roleTitle,u.last_login_at lastLoginAt FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.created_at DESC,u.id DESC LIMIT ? OFFSET ?",
          [page.limit, page.offset],
        ),
      );
      paginationHeaders(res, page);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/services", async (req: AuthRequest, res, next) => {
  try {
    const items = await rows<any[]>(
      "SELECT id,code,title_fa title,category,description,requirements,workflow,allowed_roles allowedRoles,automatic_messages automaticMessages,fee_rials feeRials,legal_fee_rials legalFeeRials,service_fee_rials serviceFeeRials,requirements_version requirementsVersion,api_code apiCode,api_payload_fields apiPayloadFields,is_active isActive,updated_at updatedAt FROM services ORDER BY id",
    );
    res.json(
      req.user?.role === "observer"
        ? items.map((item) => observerService(item))
        : items,
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.patch(
  "/services/:id",
  authorize("operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          legalFeeRials: z.number().int().nonnegative().optional(),
          serviceFeeRials: z.number().int().nonnegative().optional(),
          isActive: z.boolean().optional(),
          requirementsVersion: z.string().trim().min(1).max(30).optional(),
          apiCode: z.string().trim().max(80).nullable().optional(),
          apiPayloadFields: z
            .array(z.string().regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/))
            .max(100)
            .optional(),
          title: z.string().trim().min(3).max(180).optional(),
          description: z.string().trim().min(20).max(5000).optional(),
          requirements: z
            .array(z.string().trim().min(2).max(300))
            .min(1)
            .max(100)
            .optional(),
          workflow: z
            .array(z.string().trim().min(2).max(80))
            .min(1)
            .max(100)
            .optional(),
          allowedRoles: z
            .array(z.string().trim().min(2).max(40))
            .min(1)
            .max(30)
            .optional(),
          automaticMessages: z
            .array(z.string().trim().min(2).max(500))
            .max(50)
            .optional(),
        })
        .refine((v) => Object.keys(v).length > 0)
        .parse(req.body);
      const result = await execute(
        "UPDATE services SET legal_fee_rials=COALESCE(?,legal_fee_rials),service_fee_rials=COALESCE(?,service_fee_rials),fee_rials=CASE WHEN ? OR ? THEN COALESCE(?,legal_fee_rials)+COALESCE(?,service_fee_rials) ELSE fee_rials END,is_active=COALESCE(?,is_active),requirements_version=COALESCE(?,requirements_version),api_code=CASE WHEN ? THEN ? ELSE api_code END,api_payload_fields=CASE WHEN ? THEN ? ELSE api_payload_fields END,title_fa=COALESCE(?,title_fa),description=COALESCE(?,description),requirements=COALESCE(?,requirements),workflow=COALESCE(?,workflow),allowed_roles=COALESCE(?,allowed_roles),automatic_messages=COALESCE(?,automatic_messages) WHERE id=?",
        [
          input.legalFeeRials ?? null,
          input.serviceFeeRials ?? null,
          input.legalFeeRials !== undefined,
          input.serviceFeeRials !== undefined,
          input.legalFeeRials ?? null,
          input.serviceFeeRials ?? null,
          input.isActive === undefined ? null : Number(input.isActive),
          input.requirementsVersion ?? null,
          Object.prototype.hasOwnProperty.call(input, "apiCode"),
          input.apiCode ?? null,
          Object.prototype.hasOwnProperty.call(input, "apiPayloadFields"),
          input.apiPayloadFields
            ? JSON.stringify(input.apiPayloadFields)
            : null,
          input.title ?? null,
          input.description ?? null,
          input.requirements ? JSON.stringify(input.requirements) : null,
          input.workflow ? JSON.stringify(input.workflow) : null,
          input.allowedRoles ? JSON.stringify(input.allowedRoles) : null,
          input.automaticMessages
            ? JSON.stringify(input.automaticMessages)
            : null,
          req.params.id,
        ],
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "خدمت پیدا نشد." });
      await audit(
        req,
        "service.update",
        "service",
        String(req.params.id),
        input,
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/incidents", async (req: AuthRequest, res, next) => {
  try {
    const items = await rows<any[]>(
      "SELECT i.incident_code incidentCode,i.service_code serviceCode,i.severity,i.title,i.started_at startedAt,i.resolved_at resolvedAt,i.root_cause rootCause,i.corrective_action correctiveAction,u.full_name createdByName FROM system_incidents i JOIN users u ON u.id=i.created_by ORDER BY i.started_at DESC LIMIT 100",
    );
    res.json(
      req.user?.role === "observer"
        ? items.map((item) => observerIncident(item))
        : items,
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/incidents",
  authorize("technical", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          serviceCode: z.string().trim().min(2).max(80),
          severity: z.enum(["minor", "major", "critical"]),
          title: z.string().trim().min(5).max(180),
          startedAt: z.coerce.date().default(() => new Date()),
        })
        .parse(req.body);
      const code = generateCode("INC");
      const result = await execute(
        "INSERT INTO system_incidents (incident_code,service_code,severity,title,started_at,created_by) VALUES (?,?,?,?,?,?)",
        [
          code,
          input.serviceCode,
          input.severity,
          input.title,
          input.startedAt,
          req.user!.id,
        ],
      );
      await audit(
        req,
        "incident.create",
        "system_incident",
        String(result.insertId),
        { code, severity: input.severity },
      );
      res.status(201).json({ id: result.insertId, code });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  "/incidents/:id/resolve",
  authorize("technical", "operations_manager", "admin"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          rootCause: z.string().trim().min(10).max(5000),
          correctiveAction: z.string().trim().min(10).max(5000),
        })
        .parse(req.body);
      await execute(
        "UPDATE system_incidents SET resolved_at=NOW(),root_cause=?,corrective_action=? WHERE id=?",
        [input.rootCause, input.correctiveAction, req.params.id],
      );
      await audit(
        req,
        "incident.resolve",
        "system_incident",
        String(req.params.id),
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);
