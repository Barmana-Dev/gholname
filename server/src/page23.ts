export const officialPaymentGateway = "official_psp";

export function tariffBreakdown(
  legalFeeRials: number,
  serviceFeeRials: number,
) {
  for (const amount of [legalFeeRials, serviceFeeRials]) {
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new RangeError("Tariff amounts must be non-negative safe integers");
  }
  const totalRials = legalFeeRials + serviceFeeRials;
  if (!Number.isSafeInteger(totalRials))
    throw new RangeError("Tariff total exceeds the safe integer range");
  return { legalFeeRials, serviceFeeRials, totalRials };
}

export function canAccessPayment(
  role: string,
  userId: number,
  applicantId: number,
) {
  if (["applicant", "representative"].includes(role))
    return userId === applicantId;
  return [
    "finance",
    "operations_manager",
    "compliance",
    "admin",
    "observer",
  ].includes(role);
}

export function allowsSensitiveSupportData(channel: string) {
  return ["chat", "ticket"].includes(channel);
}
