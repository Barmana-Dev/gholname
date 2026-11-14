type RecordValue = Record<string, unknown>;
type ScopedStaffRole = "support" | "finance";

function pick(source: RecordValue, keys: readonly string[]): RecordValue {
  return Object.fromEntries(
    keys
      .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
      .map((key) => [key, source[key]]),
  );
}

const applicationSummaryKeys = [
  "id",
  "file_number",
  "status",
  "risk_level",
  "archived_at",
  "created_at",
  "updated_at",
  "serviceCode",
  "serviceTitle",
] as const;

export function observerApplicationListItem(item: RecordValue): RecordValue {
  return Object.fromEntries(
    Object.entries({
      id: item.id,
      fileNumber: item.fileNumber ?? item.file_number,
      status: item.status,
      riskLevel: item.riskLevel ?? item.risk_level,
      archivedAt: item.archivedAt ?? item.archived_at,
      createdAt: item.createdAt ?? item.created_at,
      updatedAt: item.updatedAt ?? item.updated_at,
      serviceTitle: item.serviceTitle,
    }).filter(([, value]) => value !== undefined),
  );
}

export function observerApplicationDetail(
  application: RecordValue,
  sections: {
    property: RecordValue | null;
    relatedProperties: RecordValue[];
    parties: RecordValue[];
    documents: RecordValue[];
    history: RecordValue[];
    payments: RecordValue[];
    assignments: RecordValue[];
    reports: RecordValue[];
    riskReviews: RecordValue[];
    servicePolicy: unknown;
  },
): RecordValue {
  const property = sections.property
    ? pick(sections.property, [
        "province",
        "county",
        "registry_section",
        "main_plate",
        "sub_plate",
        "parcel",
        "property_type",
        "deed_type",
        "area",
      ])
    : null;
  const documents = sections.documents
    .filter((document) => document.sensitivity !== "highly_confidential")
    .map((document) =>
      pick(document, [
        "id",
        "documentType",
        "originalName",
        "mimeType",
        "sizeBytes",
        "version",
        "sensitivity",
        "reviewStatus",
        "uploadedAt",
      ]),
    );
  const payments = sections.payments.map((payment) =>
    pick(payment, [
      "id",
      "amountRials",
      "legalFeeRials",
      "serviceFeeRials",
      "status",
      "paidAt",
      "createdAt",
    ]),
  );
  const assignments = sections.assignments.map((assignment) =>
    pick(assignment, ["id", "assignmentType", "createdAt", "completedAt"]),
  );
  const reports = sections.reports.map((report) =>
    pick(report, ["id", "reportType", "result", "signedAt", "createdAt"]),
  );
  const riskReviews = sections.riskReviews.map((review) =>
    pick(review, ["id", "level", "created_at"]),
  );

  return {
    ...pick(application, applicationSummaryKeys),
    property,
    relatedProperties: [],
    parties: [],
    documents,
    history: sections.history.map((event) =>
      pick(event, ["id", "to_status", "created_at"]),
    ),
    messages: [],
    payments,
    assignments,
    reports,
    riskReviews,
    servicePolicy: sections.servicePolicy,
    allowedActions: {},
  };
}

export function restrictedApplicationDetail(
  application: RecordValue,
  sections: {
    property: RecordValue | null;
    documents: RecordValue[];
    history: RecordValue[];
    messages: RecordValue[];
    payments: RecordValue[];
    assignments: RecordValue[];
    servicePolicy: unknown;
  },
  role: ScopedStaffRole,
): RecordValue {
  const support = role === "support";
  const property =
    support && sections.property
      ? pick(sections.property, [
          "province",
          "county",
          "registry_section",
          "main_plate",
          "sub_plate",
          "parcel",
          "property_type",
          "deed_type",
          "area",
        ])
      : null;
  const documents = support
    ? sections.documents
        .filter((document) => document.sensitivity !== "highly_confidential")
        .map((document) =>
          pick(document, [
            "id",
            "documentType",
            "version",
            "sensitivity",
            "reviewStatus",
            "uploadedAt",
          ]),
        )
    : [];
  const messages = sections.messages
    .filter(
      (message) =>
        !support ||
        [
          "support",
          "deficiency",
          "deadline",
          "general",
          "document_receipt",
        ].includes(String(message.message_type)),
    )
    .map((message) =>
      pick(message, ["id", "message_type", "body", "created_at", "senderName"]),
    );
  const assignments = support
    ? sections.assignments.map((assignment) =>
        pick(assignment, ["id", "assignmentType", "createdAt", "completedAt"]),
      )
    : [];

  return {
    ...pick(application, [
      "id",
      "file_number",
      "status",
      "risk_level",
      "archived_at",
      "created_at",
      "updated_at",
      "closed_at",
      "serviceCode",
      "serviceTitle",
    ]),
    property,
    relatedProperties: [],
    parties: [],
    documents,
    form_data: {},
    history: sections.history.map((event) =>
      pick(event, ["id", "to_status", "created_at"]),
    ),
    messages,
    payments: support ? [] : sections.payments,
    assignments,
    reports: [],
    riskReviews: [],
    servicePolicy: sections.servicePolicy,
    allowedActions: {},
  };
}

export function observerPaymentReceipt(payment: RecordValue): RecordValue {
  return pick(payment, [
    "receiptNumber",
    "paymentId",
    "applicationId",
    "fileNumber",
    "serviceTitle",
    "legalFeeRials",
    "serviceFeeRials",
    "totalRials",
    "gateway",
    "paidAt",
  ]);
}

export function observerTicket(ticket: RecordValue): RecordValue {
  return pick(ticket, [
    "id",
    "tracking_code",
    "application_id",
    "subject",
    "category",
    "priority",
    "status",
    "created_at",
    "updated_at",
  ]);
}

export function observerReviewItem(item: RecordValue): RecordValue {
  return pick(item, [
    "reportId",
    "applicationId",
    "reportType",
    "result",
    "createdAt",
    "fileNumber",
  ]);
}

export function observerArchiveItem(item: RecordValue): RecordValue {
  return pick(item, [
    "id",
    "fileNumber",
    "serviceTitle",
    "status",
    "archivedAt",
  ]);
}

export function observerSecurityEvent(item: RecordValue): RecordValue {
  return pick(item, [
    "id",
    "event_type",
    "eventType",
    "severity",
    "status",
    "created_at",
    "createdAt",
  ]);
}

export function observerAuditLog(item: RecordValue): RecordValue {
  return pick(item, ["id", "action", "entityType", "createdAt"]);
}

export function observerIncident(item: RecordValue): RecordValue {
  return pick(item, [
    "incidentCode",
    "incident_code",
    "serviceCode",
    "service_code",
    "severity",
    "title",
    "startedAt",
    "started_at",
    "resolvedAt",
    "resolved_at",
  ]);
}

export function observerService(item: RecordValue): RecordValue {
  return pick(item, [
    "id",
    "code",
    "title",
    "category",
    "description",
    "requirements",
    "workflow",
    "allowedRoles",
    "automaticMessages",
    "feeRials",
    "legalFeeRials",
    "serviceFeeRials",
    "requirementsVersion",
    "isActive",
    "updatedAt",
  ]);
}

export function observerIntegrationJob(item: RecordValue): RecordValue {
  return pick(item, [
    "id",
    "fileNumber",
    "serviceCode",
    "environment",
    "status",
    "attempts",
    "maxAttempts",
    "availableAt",
    "completedAt",
    "createdAt",
  ]);
}

export function observerBackup(item: RecordValue): RecordValue {
  return pick(item, [
    "id",
    "backupCode",
    "status",
    "sizeBytes",
    "startedAt",
    "completedAt",
    "verifiedAt",
  ]);
}
