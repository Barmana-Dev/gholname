import { z } from "zod";

export const iranianNationalId = z
  .string()
  .regex(/^\d{10}$/)
  .refine((value) => {
    if (/^(\d)\1{9}$/.test(value)) return false;
    const sum = value
      .slice(0, 9)
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
    const remainder = sum % 11;
    const check = Number(value[9]);
    return remainder < 2 ? check === remainder : check === 11 - remainder;
  }, "کد ملی معتبر نیست.");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(3).max(150),
    nationalId: iranianNationalId,
    mobile: z.string().regex(/^09\d{9}$/),
    // Registration is phone-first. Email remains optional only for existing
    // back-office integrations; the public form does not need to collect it.
    email: z.string().email().max(190).optional(),
    password: z
      .string()
      .min(10)
      .max(128)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/\d/)
      .regex(/[^A-Za-z0-9]/),
    personType: z.enum(["individual", "legal"]).default("individual"),
    organizationName: z.string().trim().min(3).max(190).optional(),
    organizationNationalId: z
      .string()
      .regex(/^\d{11}$/)
      .optional(),
    acceptTerms: z.literal(true),
    acceptPrivacy: z.literal(true),
    confirmAccuracy: z.literal(true),
  })
  .superRefine((value, context) => {
    if (
      value.personType === "legal" &&
      (!value.organizationName || !value.organizationNationalId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organizationName"],
        message: "اطلاعات شخص حقوقی کامل نیست.",
      });
    }
  });

export const loginSchema = z.object({
  mobile: z
    .string()
    .regex(/^09\d{9}$/)
    .optional(),
  // Keep legacy staff login working while public login uses mobile only.
  email: z.string().email().optional(),
  password: z.string().min(1).max(128),
  otp: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  ),
  recoveryCode: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[A-Fa-f0-9]{10}$/)
      .optional(),
  ),
}).refine((value) => Boolean(value.mobile || value.email), {
  message: "شماره همراه الزامی است.",
  path: ["mobile"],
});

export const applicationSchema = z.object({
  serviceId: z.number().int().positive(),
  applicantCapacity: z.enum([
    "owner",
    "attorney",
    "legal_representative",
    "company_manager",
    "heir",
    "occupant",
    "beneficiary",
    "other",
  ]),
  formData: z
    .record(z.unknown())
    .superRefine((data, context) => {
      const deedNumber = data.deedNumber;
      if (
        typeof deedNumber === "string" &&
        deedNumber.length > 0 &&
        !/^[A-Za-z0-9/-]{1,50}$/.test(deedNumber)
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deedNumber"],
          message:
            "شماره سند فقط می‌تواند شامل رقم، حرف لاتین، خط تیره و ممیز باشد.",
        });
    })
    .default({}),
  property: z.object({
    province: z.string().trim().min(2).max(100),
    county: z.string().trim().min(2).max(100),
    registrySection: z.string().trim().min(1).max(60),
    mainPlate: z.string().trim().min(1).max(50),
    subPlate: z.string().trim().max(50).optional(),
    parcel: z.string().trim().max(50).optional(),
    address: z.string().trim().min(10).max(1000),
    postalCode: z
      .string()
      .regex(/^\d{10}$/)
      .optional(),
    propertyType: z.string().trim().min(2).max(80),
    deedType: z.string().trim().max(80).optional(),
    area: z.number().positive().max(1_000_000_000).optional(),
    coordinates: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    notes: z.string().max(2000).optional(),
  }),
  relatedProperties: z
    .array(
      z.object({
        mainPlate: z.string().trim().min(1).max(50),
        subPlate: z.string().trim().max(50).optional(),
        parcel: z.string().trim().max(50).optional(),
        area: z.number().positive().max(1_000_000_000).optional(),
      }),
    )
    .max(50)
    .default([]),
  parties: z
    .array(
      z.object({
        partyType: z.enum([
          "owner",
          "beneficiary",
          "attorney",
          "claimant",
          "related_party",
        ]),
        fullName: z.string().trim().min(3).max(150),
        nationalId: iranianNationalId.optional(),
        shareDescription: z.string().trim().max(120).optional(),
      }),
    )
    .max(100)
    .default([]),
  subdivisionUnits: z.array(z.unknown()).max(10_000).default([]),
});

const requiredText = (minimum = 1) => z.string().trim().min(minimum).max(5000);

const serviceFormSchemas: Record<string, z.ZodType> = {
  "duplicate-deed": z
    .object({
      duplicateReason: z.enum(["lost", "destroyed", "unreadable"]),
      incidentDate: z.string().max(20).optional(),
      incidentDescription: requiredText(10),
      duplicateDeclarationCommitment: z.literal("accepted"),
    })
    .passthrough(),
  "booklet-to-cadastral": z
    .object({
      registryBookNumber: requiredText(),
      bookletPage: requiredText(),
      bookletSerial: requiredText(),
    })
    .passthrough(),
  "land-apartment-subdivision": z
    .object({
      subdivisionType: z.enum(["land", "apartment"]),
      unitCount: z.coerce.number().int().min(2).max(10000),
    })
    .passthrough(),
  "merge-partition": z
    .object({
      mergePartitionType: z.enum(["merge", "partition"]),
      relatedPlateCount: z.coerce.number().int().min(2).max(10000),
    })
    .passthrough(),
  "property-status-change": z
    .object({
      currentPropertyStatus: requiredText(2),
      requestedPropertyStatus: requiredText(2),
      applicantExplanation: requiredText(10),
    })
    .passthrough(),
  "boundary-determination": z
    .object({
      coordinateType: z.enum(["utm", "official"]),
      boundaryDescription: requiredText(20),
    })
    .passthrough(),
  "deed-correction": z
    .object({
      correctionType: z.enum(["owner", "property", "deed", "other"]),
      currentEntry: requiredText(2),
      correctedEntry: requiredText(2),
      correctionReason: requiredText(10),
    })
    .passthrough(),
  "occupant-cadastral-deed": z
    .object({
      propertyHistory: requiredText(10),
      legalBasis: requiredText(10),
      possessionDuration: requiredText(),
      possessionBasis: requiredText(20),
      witnessEvidenceDescription: requiredText(10),
      conflictOfInterestDeclaration: z.enum(["none", "declared"]),
      suspiciousDocumentDeclaration: z.enum(["none", "declared"]),
      documentAuthenticityCommitment: z.literal("accepted"),
    })
    .passthrough(),
  "article-10-claim": z
    .object({
      propertyHistory: requiredText(10),
      legalBasis: requiredText(10),
      claimDescription: requiredText(30),
      relatedParties: z.string().max(5000).optional(),
      claimAuthenticityCommitment: z.literal("accepted"),
    })
    .passthrough(),
};

export function validateServiceFormData(
  serviceCode: string,
  formData: Record<string, unknown>,
): Record<string, unknown> {
  const schema = serviceFormSchemas[serviceCode];
  if (!schema) throw new Error(`Unsupported service code: ${serviceCode}`);
  return schema.parse(formData) as Record<string, unknown>;
}

export const complaintSchema = z.object({
  applicationId: z.number().int().positive().optional(),
  category: z.enum([
    "service",
    "staff",
    "off_platform_payment",
    "impersonation",
    "privacy",
    "other",
  ]),
  subject: z.string().trim().min(5).max(180),
  description: z.string().trim().min(20).max(5000),
});
