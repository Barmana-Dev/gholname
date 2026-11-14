import { Router } from "express";
import { rows } from "../db.js";
import { page04ServiceRules } from "../page04-services.js";
import { organizationProfileFromRow } from "../organization-profile.js";
import { config } from "../config.js";
import { PUBLIC_PAYMENT_WARNING } from "../financial-abuse.js";
import { createRateLimiter } from "../rate-limit.js";
import {
  isValidTrackingToken,
  normalizeTrackingFileNumber,
  trackingFileNumberPattern,
} from "../tracking.js";

export const publicRouter = Router();
const publicTrackingLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 20,
});

publicRouter.get("/organization-profile", async (_req, res, next) => {
  try {
    const [profile] = await rows<any[]>(
      "SELECT legal_name legalName,national_id nationalId,registration_number registrationNumber,activity_subject activitySubject,legal_basis legalBasis,supervisory_authority supervisoryAuthority,plan_type planType,document_version documentVersion,publication_status publicationStatus,revision,published_at publishedAt,updated_at updatedAt FROM organization_profile WHERE id=1 AND publication_status='published' LIMIT 1",
    );
    if (!profile)
      return res.status(404).json({
        message: "اطلاعات ثبتی تأییدشده کارگزاری هنوز منتشر نشده است.",
      });
    res.setHeader(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=600",
    );
    res.json(organizationProfileFromRow(profile));
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/payment-safety", (_req, res) => {
  const accountConfigured = Boolean(
    config.OFFICIAL_LEGAL_ACCOUNT_NAME &&
    config.OFFICIAL_LEGAL_ACCOUNT_NUMBER &&
    config.OFFICIAL_LEGAL_IBAN,
  );
  res.json({
    warning: PUBLIC_PAYMENT_WARNING,
    accountConfigured,
    account: accountConfigured
      ? {
          holder: config.OFFICIAL_LEGAL_ACCOUNT_NAME,
          number: config.OFFICIAL_LEGAL_ACCOUNT_NUMBER,
          iban: config.OFFICIAL_LEGAL_IBAN,
        }
      : null,
  });
});

publicRouter.get("/services", async (_req, res, next) => {
  try {
    const services = await rows<any[]>(
      "SELECT id,code,title_fa title,category,description,requirements,workflow,fee_rials feeRials,legal_fee_rials legalFeeRials,service_fee_rials serviceFeeRials,requirements_version requirementsVersion FROM services WHERE is_active=1 ORDER BY id",
    );
    res.json(
      services.map((service) => {
        const servicePolicy = page04ServiceRules[service.code];
        return {
          ...service,
          requirements:
            typeof service.requirements === "string"
              ? JSON.parse(service.requirements)
              : service.requirements,
          workflow:
            typeof service.workflow === "string"
              ? JSON.parse(service.workflow)
              : service.workflow,
          servicePolicy: servicePolicy
            ? {
                documentTypes: servicePolicy.documentTypes,
                requiredDocuments: servicePolicy.requiredDocuments,
              }
            : null,
        };
      }),
    );
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/services/:code", async (req, res, next) => {
  try {
    const [service] = await rows<any[]>(
      "SELECT id,code,title_fa title,category,description,requirements,workflow,fee_rials feeRials,legal_fee_rials legalFeeRials,service_fee_rials serviceFeeRials,requirements_version requirementsVersion FROM services WHERE code=? AND is_active=1",
      [req.params.code],
    );
    if (!service) return res.status(404).json({ message: "خدمت پیدا نشد." });
    for (const key of ["requirements", "workflow"]) {
      if (typeof service[key] === "string")
        service[key] = JSON.parse(service[key]);
    }
    const rule = page04ServiceRules[service.code];
    service.servicePolicy = rule
      ? {
          documentTypes: rule.documentTypes,
          requiredDocuments: rule.requiredDocuments,
        }
      : null;
    res.json(service);
  } catch (error) {
    next(error);
  }
});

publicRouter.get(
  "/tracking/:fileNumber",
  publicTrackingLimiter,
  async (req, res, next) => {
  try {
    const rawFileNumber = Array.isArray(req.params.fileNumber)
      ? req.params.fileNumber[0]
      : req.params.fileNumber;
    const fileNumber = normalizeTrackingFileNumber(String(rawFileNumber ?? ""));
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!trackingFileNumberPattern.test(fileNumber))
      return res.status(404).json({ message: "پرونده‌ای با این مشخصات پیدا نشد." });
    const [application] = await rows<any[]>(
      "SELECT a.id,a.file_number fileNumber,a.status,a.updated_at updatedAt,s.title_fa serviceTitle FROM applications a JOIN services s ON s.id=a.service_id WHERE a.file_number=?",
      [fileNumber],
    );
    if (
      !application ||
      !isValidTrackingToken(application.id, application.fileNumber, token)
    )
      return res
        .status(404)
        .json({ message: "پرونده‌ای با این مشخصات پیدا نشد." });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.json({
      fileNumber: application.fileNumber,
      status: application.status,
      updatedAt: application.updatedAt,
      serviceTitle: application.serviceTitle,
    });
  } catch (error) {
    next(error);
  }
  },
);

publicRouter.get("/announcements", async (_req, res, next) => {
  try {
    res.json(
      await rows<any[]>(
        "SELECT id,title,body,category,published_at publishedAt FROM announcements WHERE is_published=1 AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY published_at DESC LIMIT 10",
      ),
    );
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/system-status", async (_req, res, next) => {
  try {
    const incidents = await rows<any[]>(
      "SELECT service_code serviceCode,severity,title,started_at startedAt FROM system_incidents WHERE resolved_at IS NULL ORDER BY started_at DESC",
    );
    res.json({
      status: incidents.some((i) => i.severity === "critical")
        ? "outage"
        : incidents.length
          ? "degraded"
          : "operational",
      incidents,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
