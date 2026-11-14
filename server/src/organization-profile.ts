import { z } from "zod";

const persianText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

export function isIranianLegalNationalId(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const controlFactor = Number(value[9]) + 2;
  const weights = [29, 27, 23, 19, 17];
  const remainder =
    value
      .slice(0, 10)
      .split("")
      .reduce(
        (sum, digit, index) =>
          sum +
          (Number(digit) + controlFactor) * weights[index % weights.length]!,
        0,
      ) % 11;
  return Number(value[10]) === (remainder === 10 ? 0 : remainder);
}

export const organizationProfileSchema = z
  .object({
    legalName: persianText(3, 190),
    nationalId: z.string().trim().refine(isIranianLegalNationalId, {
      message: "شناسه ملی شخص حقوقی معتبر نیست.",
    }),
    registrationNumber: z
      .string()
      .trim()
      .regex(/^\d{1,20}$/),
    activitySubject: persianText(20, 2000),
    legalBasis: persianText(20, 2000),
    supervisoryAuthority: persianText(10, 1000),
    planType: persianText(10, 1000),
    documentVersion: persianText(3, 120),
    publicationStatus: z.enum(["draft", "published"]),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export type OrganizationProfileInput = z.infer<
  typeof organizationProfileSchema
>;

export function organizationProfileFromRow(row: Record<string, unknown>) {
  return {
    legalName: String(row.legalName ?? ""),
    nationalId: String(row.nationalId ?? ""),
    registrationNumber: String(row.registrationNumber ?? ""),
    activitySubject: String(row.activitySubject ?? ""),
    legalBasis: String(row.legalBasis ?? ""),
    supervisoryAuthority: String(row.supervisoryAuthority ?? ""),
    planType: String(row.planType ?? ""),
    documentVersion: String(row.documentVersion ?? ""),
    publicationStatus:
      row.publicationStatus === "published" ? "published" : "draft",
    revision: Number(row.revision ?? 0),
    publishedAt: row.publishedAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}
