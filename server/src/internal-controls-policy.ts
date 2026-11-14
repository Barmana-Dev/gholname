export const STAFF_ROLES = [
  "registry_expert",
  "surveyor",
  "support",
  "finance",
  "operations_manager",
  "compliance",
  "technical",
  "admin",
  "observer",
] as const;

export function isReviewPeriodValid(start: Date, end: Date, due: Date): boolean {
  return start.getTime() <= end.getTime() && end.getTime() <= due.getTime();
}

export function hasCompleteCaseChecklist(input: {
  conflictChecked: boolean;
  scopeChecked: boolean;
  privacyChecked: boolean;
  paymentChecked: boolean;
}): boolean {
  return (
    input.conflictChecked &&
    input.scopeChecked &&
    input.privacyChecked &&
    input.paymentChecked
  );
}

export function evidenceRequiresLicensedProvider(type: string): boolean {
  return type === "contractor_contract" || type === "penetration_test";
}
