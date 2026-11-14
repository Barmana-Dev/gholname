import { describe, expect, it } from "vitest";
import {
  canAccessApplication,
  canChangeApplicationStatus,
  canSendMessageType,
  canTransitionApplicationStatus,
  type ApplicationAccessFacts,
} from "./application-access.js";

const facts: ApplicationAccessFacts = {
  applicantId: 10,
  hasActiveAssignment: false,
  hasSupportTicket: false,
  hasPayment: false,
};

describe("page 12 access and messaging controls", () => {
  it("limits experts to actively assigned applications", () => {
    expect(
      canAccessApplication({ id: 20, role: "registry_expert" }, facts),
    ).toBe(false);
    expect(
      canAccessApplication(
        { id: 20, role: "registry_expert" },
        { ...facts, hasActiveAssignment: true },
      ),
    ).toBe(true);
    expect(canAccessApplication({ id: 20, role: "surveyor" }, facts)).toBe(
      false,
    );
  });

  it("keeps applicant, support and finance access scoped to their relationship", () => {
    expect(canAccessApplication({ id: 10, role: "applicant" }, facts)).toBe(
      true,
    );
    expect(canAccessApplication({ id: 11, role: "applicant" }, facts)).toBe(
      false,
    );
    expect(canAccessApplication({ id: 30, role: "support" }, facts)).toBe(
      false,
    );
    expect(
      canAccessApplication(
        { id: 30, role: "support" },
        { ...facts, hasSupportTicket: true },
      ),
    ).toBe(true);
    expect(canAccessApplication({ id: 40, role: "finance" }, facts)).toBe(
      false,
    );
  });

  it("prevents applicants from impersonating system, expert and payment messages", () => {
    expect(canSendMessageType("applicant", "support")).toBe(true);
    expect(canSendMessageType("applicant", "system")).toBe(false);
    expect(canSendMessageType("applicant", "deficiency")).toBe(false);
    expect(canSendMessageType("applicant", "payment")).toBe(false);
    expect(canSendMessageType("registry_expert", "deficiency")).toBe(true);
    expect(canSendMessageType("finance", "payment")).toBe(true);
    expect(canSendMessageType("observer", "general")).toBe(false);
  });

  it("lets experts record review states without granting final or assignment control", () => {
    expect(
      canChangeApplicationStatus("registry_expert", "documents_deficient"),
    ).toBe(true);
    expect(canChangeApplicationStatus("surveyor", "additional_action")).toBe(
      true,
    );
    expect(canChangeApplicationStatus("registry_expert", "completed")).toBe(
      false,
    );
    expect(
      canChangeApplicationStatus("surveyor", "assigned_registry_expert"),
    ).toBe(false);
    expect(canChangeApplicationStatus("operations_manager", "completed")).toBe(
      true,
    );
  });

  it("enforces the application workflow transition graph", () => {
    expect(canTransitionApplicationStatus("submitted", "initial_review")).toBe(
      true,
    );
    expect(
      canTransitionApplicationStatus("registry_exchange", "awaiting_registry"),
    ).toBe(true);
    expect(canTransitionApplicationStatus("awaiting_registry", "completed")).toBe(
      true,
    );
    expect(canTransitionApplicationStatus("completed", "initial_review")).toBe(
      false,
    );
    expect(canTransitionApplicationStatus("draft", "completed")).toBe(false);
    expect(canTransitionApplicationStatus("documents_deficient", "draft")).toBe(
      false,
    );
    expect(canTransitionApplicationStatus("submitted", "submitted")).toBe(
      false,
    );
    expect(
      canTransitionApplicationStatus("completed_documents", "awaiting_payment"),
    ).toBe(true);
    expect(canTransitionApplicationStatus("awaiting_payment", "paid")).toBe(
      true,
    );
    expect(canTransitionApplicationStatus("paid", "under_expert_review")).toBe(
      true,
    );
    expect(
      canTransitionApplicationStatus("under_expert_review", "ready_to_send"),
    ).toBe(true);
    expect(
      canTransitionApplicationStatus(
        "registry_return_deficient",
        "correcting_registry_deficiency",
      ),
    ).toBe(true);
    expect(
      canTransitionApplicationStatus(
        "correcting_registry_deficiency",
        "ready_to_send",
      ),
    ).toBe(true);
    expect(canTransitionApplicationStatus("stopped_security", "completed")).toBe(
      false,
    );
    expect(
      canTransitionApplicationStatus("cancelled_by_applicant", "initial_review"),
    ).toBe(false);
  });
});
