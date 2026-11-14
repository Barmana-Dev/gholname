import type { AuthUser, RoleCode } from "./types.js";

export interface ComplaintAccessFacts {
  applicantId: number;
  assignedTo: number | null;
  status: string;
}

const supervisoryRoles: readonly RoleCode[] = [
  "compliance",
  "operations_manager",
  "admin",
];

export function canAccessComplaint(
  user: Pick<AuthUser, "id" | "role">,
  facts: ComplaintAccessFacts,
): boolean {
  if (supervisoryRoles.includes(user.role)) return true;
  if (user.role === "support")
    return (
      facts.assignedTo === user.id ||
      (facts.assignedTo === null && facts.status !== "closed")
    );
  if (["applicant", "representative"].includes(user.role))
    return facts.applicantId === user.id;
  return false;
}

export function canUpdateComplaint(
  user: Pick<AuthUser, "id" | "role">,
  facts: ComplaintAccessFacts,
): boolean {
  if (supervisoryRoles.includes(user.role)) return true;
  return (
    user.role === "support" &&
    facts.status !== "closed" &&
    (facts.assignedTo === null || facts.assignedTo === user.id)
  );
}
