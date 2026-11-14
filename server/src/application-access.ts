import { rows } from "./db.js";
import type { AuthUser, RoleCode } from "./types.js";

export interface ApplicationAccessFacts {
  applicantId: number;
  hasActiveAssignment: boolean;
  hasSupportTicket: boolean;
  hasPayment: boolean;
}

export function canAccessApplication(
  user: Pick<AuthUser, "id" | "role">,
  facts: ApplicationAccessFacts,
): boolean {
  if (
    ["operations_manager", "compliance", "admin", "observer"].includes(
      user.role,
    )
  )
    return true;
  if (["applicant", "representative"].includes(user.role))
    return facts.applicantId === user.id;
  if (["registry_expert", "surveyor"].includes(user.role))
    return facts.hasActiveAssignment;
  if (user.role === "support") return facts.hasSupportTicket;
  if (user.role === "finance") return facts.hasPayment;
  return false;
}

export async function userCanAccessApplication(
  user: Pick<AuthUser, "id" | "role">,
  applicationId: string | number,
): Promise<boolean> {
  const [facts] = await rows<any[]>(
    `SELECT a.applicant_id applicantId,
      EXISTS(SELECT 1 FROM assignments x WHERE x.application_id=a.id AND x.expert_id=? AND x.completed_at IS NULL) hasActiveAssignment,
      EXISTS(SELECT 1 FROM support_tickets st WHERE st.application_id=a.id AND st.status<>'closed' AND (st.assigned_to IS NULL OR st.assigned_to=?)) hasSupportTicket,
      EXISTS(SELECT 1 FROM payments p WHERE p.application_id=a.id) hasPayment
     FROM applications a WHERE a.id=?`,
    [user.id, user.id, applicationId],
  );
  return Boolean(
    facts &&
    canAccessApplication(user, {
      applicantId: Number(facts.applicantId),
      hasActiveAssignment: Boolean(facts.hasActiveAssignment),
      hasSupportTicket: Boolean(facts.hasSupportTicket),
      hasPayment: Boolean(facts.hasPayment),
    }),
  );
}

export type MessageType =
  | "system"
  | "support"
  | "deficiency"
  | "deadline"
  | "document_receipt"
  | "payment"
  | "general";

const messageTypesByRole: Record<RoleCode, readonly MessageType[]> = {
  applicant: ["general", "support"],
  representative: ["general", "support"],
  registry_expert: ["general", "deficiency", "deadline"],
  surveyor: ["general", "deficiency", "deadline"],
  support: ["general", "support", "deficiency", "deadline"],
  finance: ["general", "payment"],
  operations_manager: [
    "system",
    "support",
    "deficiency",
    "deadline",
    "document_receipt",
    "payment",
    "general",
  ],
  compliance: ["system", "general", "deficiency", "deadline"],
  technical: [],
  admin: [
    "system",
    "support",
    "deficiency",
    "deadline",
    "document_receipt",
    "payment",
    "general",
  ],
  observer: [],
};

export function canSendMessageType(
  role: RoleCode,
  messageType: MessageType,
): boolean {
  return messageTypesByRole[role].includes(messageType);
}

const expertStatuses = new Set([
  "initial_review",
  "documents_deficient",
  "awaiting_applicant",
  "completed_documents",
  "additional_action",
]);

export function canChangeApplicationStatus(
  role: RoleCode,
  status: string,
): boolean {
  if (["operations_manager", "compliance", "admin"].includes(role)) return true;
  return (
    ["registry_expert", "surveyor"].includes(role) && expertStatuses.has(status)
  );
}

/**
 * Application status changes are explicitly bounded at the workflow boundary.
 * Exceptional returns (for example a registry response with a deficiency)
 * are represented explicitly rather than allowing an arbitrary jump to any
 * status. The integration queue owns the
 * `registry_exchange -> awaiting_registry` transition, but it is included
 * here so the transition policy remains auditable in one place. The payment,
 * registry-return, stop, cancellation, and complaint states are kept in sync
 * with the forward database migration that extends applications.status.
 */
const applicationStatusTransitions: Readonly<Record<string, readonly string[]>> =
  {
    draft: [
      "submitted",
      "initial_review",
      "documents_deficient",
      "awaiting_applicant",
      "completed_documents",
      "awaiting_payment",
      "assigned_registry_expert",
      "assigned_surveyor",
      "additional_action",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "cancelled_by_applicant",
      "referred_complaint",
      "closed_incomplete",
    ],
    submitted: [
      "initial_review",
      "documents_deficient",
      "awaiting_applicant",
      "completed_documents",
      "awaiting_payment",
      "assigned_registry_expert",
      "assigned_surveyor",
      "additional_action",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "cancelled_by_applicant",
      "referred_complaint",
      "closed_incomplete",
    ],
    initial_review: [
      "documents_deficient",
      "awaiting_applicant",
      "completed_documents",
      "awaiting_payment",
      "assigned_registry_expert",
      "assigned_surveyor",
      "additional_action",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    documents_deficient: [
      "awaiting_applicant",
      "additional_action",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    awaiting_applicant: [
      "submitted",
      "documents_deficient",
      "completed_documents",
      "additional_action",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "cancelled_by_applicant",
      "referred_complaint",
      "closed_incomplete",
    ],
    completed_documents: [
      "awaiting_payment",
      "assigned_registry_expert",
      "assigned_surveyor",
      "registry_exchange",
      "additional_action",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "cancelled_by_applicant",
      "referred_complaint",
      "closed_incomplete",
    ],
    awaiting_payment: [
      "paid",
      "documents_deficient",
      "cancelled_by_applicant",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    paid: [
      "assigned_registry_expert",
      "assigned_surveyor",
      "under_expert_review",
      "additional_action",
      "cancelled_by_applicant",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    assigned_registry_expert: [
      "assigned_surveyor",
      "under_expert_review",
      "registry_exchange",
      "awaiting_registry",
      "documents_deficient",
      "additional_action",
      "completed",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    assigned_surveyor: [
      "assigned_registry_expert",
      "under_expert_review",
      "registry_exchange",
      "awaiting_registry",
      "documents_deficient",
      "additional_action",
      "completed",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    under_expert_review: [
      "documents_deficient",
      "additional_action",
      "ready_to_send",
      "registry_return_deficient",
      "completed",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    ready_to_send: [
      "registry_exchange",
      "additional_action",
      "documents_deficient",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    registry_exchange: [
      "awaiting_registry",
      "documents_deficient",
      "additional_action",
      "completed",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    awaiting_registry: [
      "registry_exchange",
      "registry_return_deficient",
      "documents_deficient",
      "additional_action",
      "completed",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    registry_return_deficient: [
      "correcting_registry_deficiency",
      "additional_action",
      "documents_deficient",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    correcting_registry_deficiency: [
      "ready_to_send",
      "registry_exchange",
      "awaiting_registry",
      "additional_action",
      "documents_deficient",
      "stopped_legal_technical",
      "stopped_security",
      "referred_complaint",
      "closed_incomplete",
    ],
    additional_action: [
      "awaiting_applicant",
      "completed_documents",
      "awaiting_payment",
      "paid",
      "assigned_registry_expert",
      "assigned_surveyor",
      "under_expert_review",
      "ready_to_send",
      "registry_exchange",
      "awaiting_registry",
      "registry_return_deficient",
      "correcting_registry_deficiency",
      "documents_deficient",
      "completed",
      "out_of_scope",
      "stopped_legal_technical",
      "stopped_security",
      "cancelled_by_applicant",
      "referred_complaint",
      "closed_incomplete",
    ],
    completed: [],
    closed_incomplete: [],
    out_of_scope: [],
    stopped_legal_technical: [],
    stopped_security: [],
    cancelled_by_applicant: [],
    referred_complaint: [],
  };

export function canTransitionApplicationStatus(
  fromStatus: string,
  toStatus: string,
): boolean {
  if (fromStatus === toStatus) return false;
  return applicationStatusTransitions[fromStatus]?.includes(toStatus) ?? false;
}
