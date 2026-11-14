import { Router } from "express";
import { z } from "zod";
import { config, registryConnection } from "../config.js";
import { decryptField, encryptField } from "../crypto.js";
import { rows, transaction } from "../db.js";
import { newRequestId, processIntegrationJobs } from "../integration-queue.js";
import {
  jsonValue,
  parsePayloadFields,
  selectAllowedPayloadFields,
  sha256,
} from "../registry-integration.js";
import { audit, authenticate, enforceReadOnlyRole } from "../security.js";
import { requireCapability } from "../access.js";
import type { AuthRequest } from "../types.js";
import { observerIntegrationJob } from "../observer-data.js";

export const integrationsRouter = Router();
integrationsRouter.use(authenticate, enforceReadOnlyRole("observer"));

function decryptedFormData(value: unknown): unknown {
  const stored = jsonValue(value);
  const encrypted =
    typeof stored === "string" ? stored : JSON.stringify(stored);
  const decrypted = decryptField(encrypted);
  return decrypted ? jsonValue(decrypted) : {};
}

integrationsRouter.post(
  "/registry/jobs",
  requireCapability("registry.enqueue"),
  async (req: AuthRequest, res, next) => {
    try {
      const input = z
        .object({
          applicationId: z.number().int().positive(),
          idempotencyKey: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9._:-]{12,100}$/),
        })
        .strict()
        .parse(req.body);
      if (!registryConnection())
        return res.status(503).json({
          message: "دسترسی امن محیط انتخاب‌شده سازمان ثبت پیکربندی نشده است.",
        });
      const [application] = await rows<any[]>(
        "SELECT a.id,a.file_number fileNumber,a.registry_tracking_id registryTrackingId,a.status,a.form_data formData,a.submitted_at submittedAt,s.api_code apiCode,s.api_payload_fields apiPayloadFields,s.requirements_version requirementsVersion,s.is_active isActive FROM applications a JOIN services s ON s.id=a.service_id WHERE a.id=?",
        [input.applicationId],
      );
      if (!application)
        return res.status(404).json({ message: "پرونده پیدا نشد." });
      if (!application.isActive || !application.apiCode)
        return res.status(409).json({
          message: "کد API فعال برای خدمت این پرونده تعریف نشده است.",
        });
      const exchangeableStatus = [
        "registry_exchange",
        "ready_to_send",
      ].includes(application.status)
        ? application.status
        : null;
      if (!exchangeableStatus)
        return res.status(409).json({
          message:
            "پرونده باید پیش از ارسال در وضعیت آماده ارسال یا تبادل با سازمان باشد.",
        });
      const allowedFields = parsePayloadFields(application.apiPayloadFields);
      if (!allowedFields.length)
        return res.status(409).json({
          message:
            "فهرست حداقلی فیلدهای مجاز این خدمت مطابق سند API تعریف نشده است.",
        });
      const serviceData = selectAllowedPayloadFields(
        decryptedFormData(application.formData),
        allowedFields,
      );
      const payload = JSON.stringify({
        schemaVersion: application.requirementsVersion,
        fileNumber: application.fileNumber,
        registryTrackingId: application.registryTrackingId ?? undefined,
        submittedAt: application.submittedAt,
        data: serviceData,
      });
      if (Buffer.byteLength(payload, "utf8") > 256 * 1024)
        return res
          .status(413)
          .json({ message: "حجم داده مجاز برای تبادل بیش از حد است." });
      const requestId = newRequestId();
      const payloadHash = sha256(payload);
      let jobId: number | bigint;
      try {
        jobId = await transaction(async (connection) => {
          const [result] = await connection.execute<any>(
            "INSERT INTO integration_jobs (application_id,service_code,environment,request_id,idempotency_key,encrypted_payload,payload_sha256) VALUES (?,?,?,?,?,?,?)",
            [
              input.applicationId,
              application.apiCode,
              config.REGISTRY_API_MODE,
              requestId,
              input.idempotencyKey,
              encryptField(payload),
              payloadHash,
            ],
          );
          await connection.execute(
            "INSERT INTO api_logs (application_id,environment,service_code,request_id,idempotency_key,request_payload_sha256,outcome) VALUES (?,?,?,?,?,?,'queued')",
            [
              input.applicationId,
              config.REGISTRY_API_MODE,
              application.apiCode,
              requestId,
              input.idempotencyKey,
              payloadHash,
            ],
          );
          const [updated] = await connection.execute<any>(
            "UPDATE applications SET status='awaiting_registry' WHERE id=? AND status=?",
            [input.applicationId, exchangeableStatus],
          );
          if (!updated.affectedRows)
            throw new Error("APPLICATION_STATUS_CHANGED");
          await connection.execute(
            "INSERT INTO status_history (application_id,from_status,to_status,reason,note,changed_by) VALUES (?,?,?,'ارسال امن به صف تبادل سازمان ثبت',?,?)",
            [
              input.applicationId,
              exchangeableStatus,
              "awaiting_registry",
              requestId,
              req.user!.id,
            ],
          );
          return result.insertId as number | bigint;
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ER_DUP_ENTRY"
        )
          return res.status(409).json({
            message: "این درخواست قبلاً با همین کلید یکتا ثبت شده است.",
          });
        throw error;
      }
      await audit(
        req,
        "integration.enqueue",
        "integration_job",
        String(jobId),
        {
          requestId,
          applicationId: input.applicationId,
          environment: config.REGISTRY_API_MODE,
          serviceCode: application.apiCode,
          payloadHash,
        },
      );
      void processIntegrationJobs();
      res.status(202).json({ id: jobId, requestId, status: "queued" });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "APPLICATION_STATUS_CHANGED"
      )
        return res.status(409).json({
          message: "وضعیت پرونده هم‌زمان تغییر کرده است؛ دوباره بررسی کنید.",
        });
      next(error);
    }
  },
);

integrationsRouter.get(
  "/registry/jobs",
  requireCapability("registry.read"),
  async (req: AuthRequest, res, next) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          status: z
            .enum([
              "queued",
              "processing",
              "succeeded",
              "failed",
              "dead_letter",
            ])
            .optional(),
        })
        .parse(req.query);
      const offset = (query.page - 1) * query.limit;
      const parameters: unknown[] = [];
      const where = query.status ? "WHERE j.status=?" : "";
      if (query.status) parameters.push(query.status);
      parameters.push(query.limit, offset);
      const technicalDetails = ["technical", "admin"].includes(req.user!.role)
        ? ",j.last_error lastError"
        : "";
      const items = await rows<any[]>(
        `SELECT j.id,j.application_id applicationId,a.file_number fileNumber,j.service_code serviceCode,j.environment,j.request_id requestId,j.status,j.attempts,j.max_attempts maxAttempts,j.available_at availableAt,j.completed_at completedAt,j.created_at createdAt${technicalDetails} FROM integration_jobs j LEFT JOIN applications a ON a.id=j.application_id ${where} ORDER BY j.id DESC LIMIT ? OFFSET ?`,
        parameters,
      );
      res.json(
        req.user!.role === "observer"
          ? items.map((item) => observerIntegrationJob(item))
          : items,
      );
    } catch (error) {
      next(error);
    }
  },
);
