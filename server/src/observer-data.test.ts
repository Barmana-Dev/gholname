import { describe, expect, it } from "vitest";
import {
  observerApplicationDetail,
  observerApplicationListItem,
  observerAuditLog,
  observerIncident,
  observerIntegrationJob,
  observerPaymentReceipt,
  observerReviewItem,
  observerService,
  observerTicket,
  restrictedApplicationDetail,
} from "./observer-data.js";

describe("observer least-privilege projections", () => {
  it("removes identity, location, message, report and highly confidential data", () => {
    const result = observerApplicationDetail(
      {
        id: 7,
        file_number: "RB-20260811-AB12CD34",
        status: "submitted",
        risk_level: "high",
        applicantName: "نام متقاضی",
        form_data: { nationalId: "0013546831" },
        serviceCode: "duplicate-deed",
        serviceTitle: "سند المثنی",
      },
      {
        property: {
          province: "تهران",
          county: "تهران",
          registry_section: "۱",
          main_plate: "۲۳",
          address: "نشانی خصوصی",
          notes: "یادداشت خصوصی",
          coordinates: { lat: 1, lng: 2 },
        },
        relatedProperties: [{ id: 2, main_plate: "۲۴" }],
        parties: [{ full_name: "مالک", national_id: "enc:v1:private" }],
        documents: [
          {
            id: 1,
            documentType: "عادی",
            originalName: "normal.pdf",
            sensitivity: "normal",
            reviewStatus: "received",
          },
          {
            id: 2,
            documentType: "هویتی",
            originalName: "identity.pdf",
            sensitivity: "highly_confidential",
            reviewStatus: "received",
          },
        ],
        history: [{ id: 1, to_status: "submitted", reason: "نام خصوصی" }],
        payments: [
          {
            id: 9,
            amountRials: 100,
            transactionId: "secret-transaction",
            status: "successful",
          },
        ],
        assignments: [
          { id: 4, expertName: "کارشناس", assignmentType: "survey" },
        ],
        reports: [
          {
            id: 5,
            body: "جزئیات کارشناسی",
            expertName: "کارشناس",
            result: "accepted",
          },
        ],
        riskReviews: [{ id: 6, note: "جزئیات ریسک", level: "high" }],
        servicePolicy: { documentTypes: ["عادی"] },
      },
    );

    expect(result).not.toHaveProperty("applicantName");
    expect(result).not.toHaveProperty("form_data");
    expect(result.property).not.toHaveProperty("address");
    expect(result.property).not.toHaveProperty("coordinates");
    expect(result.relatedProperties).toEqual([]);
    expect(result.parties).toEqual([]);
    expect(result.documents).toHaveLength(1);
    const detail = result as {
      history: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
      assignments: Array<Record<string, unknown>>;
      reports: Array<Record<string, unknown>>;
      riskReviews: Array<Record<string, unknown>>;
    };
    expect(detail.history[0]).not.toHaveProperty("reason");
    expect(result.messages).toEqual([]);
    expect(detail.payments[0]).not.toHaveProperty("transactionId");
    expect(detail.assignments[0]).not.toHaveProperty("expertName");
    expect(detail.reports[0]).not.toHaveProperty("body");
    expect(detail.riskReviews[0]).not.toHaveProperty("note");
    expect(result.allowedActions).toEqual({});
  });

  it("keeps list, payment receipt and review/ticket projections bounded", () => {
    expect(
      observerApplicationListItem({
        id: 1,
        file_number: "RB-1",
        applicantName: "خصوصی",
        status: "submitted",
      }),
    ).toEqual({
      id: 1,
      fileNumber: "RB-1",
      status: "submitted",
    });
    expect(
      observerPaymentReceipt({
        paymentId: 1,
        totalRials: 100,
        transactionId: "secret",
        receiptNumber: "RCP-1",
      }),
    ).not.toHaveProperty("transactionId");
    expect(
      observerReviewItem({ reportId: 1, body: "secret", result: "accepted" }),
    ).not.toHaveProperty("body");
    expect(
      observerTicket({ id: 1, applicantName: "خصوصی", subject: "راهنما" }),
    ).not.toHaveProperty("applicantName");
  });

  it("does not expose audit, incident or integration internals", () => {
    expect(
      observerAuditLog({
        id: "audit-1",
        action: "user.access_update",
        entityType: "user",
        entityId: "42",
        actorName: "مدیر",
        ipAddress: "127.0.0.1",
        createdAt: "2026-08-11T00:00:00Z",
      }),
    ).toEqual({
      id: "audit-1",
      action: "user.access_update",
      entityType: "user",
      createdAt: "2026-08-11T00:00:00Z",
    });
    expect(
      observerIncident({
        incidentCode: "INC-1",
        serviceCode: "api",
        severity: "major",
        title: "اختلال",
        rootCause: "جزئیات داخلی",
        correctiveAction: "اقدام داخلی",
        createdByName: "فنی",
      }),
    ).toEqual({
      incidentCode: "INC-1",
      serviceCode: "api",
      severity: "major",
      title: "اختلال",
    });
    expect(
      observerService({
        id: 1,
        code: "service",
        title: "خدمت",
        apiCode: "private-api",
        apiPayloadFields: ["nationalId"],
      }),
    ).toEqual({ id: 1, code: "service", title: "خدمت" });
    expect(
      observerIntegrationJob({
        id: 1,
        applicationId: 10,
        fileNumber: "RB-1",
        requestId: "request-secret",
        serviceCode: "registry",
        status: "failed",
        lastError: "stack trace",
      }),
    ).toEqual({
      id: 1,
      fileNumber: "RB-1",
      serviceCode: "registry",
      status: "failed",
    });
  });

  it("keeps support and finance application details role-scoped", () => {
    const sections = {
      property: {
        province: "تهران",
        main_plate: "۲۳",
        address: "نشانی خصوصی",
      },
      documents: [
        {
          id: 1,
          documentType: "عادی",
          originalName: "نام خصوصی.pdf",
          sensitivity: "normal",
        },
        {
          id: 2,
          documentType: "هویتی",
          originalName: "identity.pdf",
          sensitivity: "highly_confidential",
        },
      ],
      history: [{ id: 1, to_status: "submitted", reason: "متن خصوصی" }],
      messages: [
        {
          id: 2,
          message_type: "support",
          body: "پیام مرتبط",
          senderName: "پشتیبان",
        },
        {
          id: 5,
          message_type: "payment",
          body: "مبلغ خصوصی",
          senderName: "مالی",
        },
      ],
      payments: [{ id: 3, transactionId: "tx-secret", amountRials: 10 }],
      assignments: [{ id: 4, expertName: "کارشناس", assignmentType: "survey" }],
      servicePolicy: { documentTypes: ["عادی"] },
    };
    const support = restrictedApplicationDetail(
      { id: 7, applicantName: "مالک", form_data: { nationalId: "secret" } },
      sections,
      "support",
    );
    expect(support).not.toHaveProperty("applicantName");
    expect(support.form_data).toEqual({});
    expect(support.property).not.toHaveProperty("address");
    const supportDocuments = support.documents as Array<
      Record<string, unknown>
    >;
    expect(supportDocuments).toHaveLength(1);
    expect(supportDocuments[0]).not.toHaveProperty("originalName");
    expect(support.payments).toEqual([]);
    expect(support.messages).toHaveLength(1);
    expect(support.reports).toEqual([]);

    const finance = restrictedApplicationDetail(
      { id: 7, applicantName: "مالک", form_data: { nationalId: "secret" } },
      sections,
      "finance",
    );
    expect(finance.form_data).toEqual({});
    expect(finance.property).toBeNull();
    expect(finance.documents).toEqual([]);
    expect(finance.payments).toEqual(sections.payments);
    expect(finance.assignments).toEqual([]);
  });
});
