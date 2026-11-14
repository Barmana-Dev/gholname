import { z } from "zod";

export type Page04ServiceRule = {
  documentTypes: readonly string[];
  requiredDocuments: readonly string[];
  requiredAssignments: readonly ("registry_legal" | "survey")[];
  requiredReports: readonly ("registry_legal" | "survey")[];
  requiresRiskReview?: boolean;
};

export const page04ServiceRules: Record<string, Page04ServiceRule> = {
  "duplicate-deed": {
    documentTypes: [
      "مدارک هویتی",
      "تصویر سند مالکیت",
      "مستند علت درخواست",
      "وکالت‌نامه یا نمایندگی",
      "مستندات پشتیبان",
    ],
    requiredDocuments: [
      "مدارک هویتی",
      "تصویر سند مالکیت",
      "مستند علت درخواست",
    ],
    requiredAssignments: ["registry_legal"],
    requiredReports: ["registry_legal"],
  },
  "booklet-to-cadastral": {
    documentTypes: [
      "مدارک هویتی",
      "تصویر سند دفترچه‌ای",
      "نقشه و مختصات",
      "وکالت‌نامه یا نمایندگی",
      "مستندات پشتیبان",
    ],
    requiredDocuments: ["مدارک هویتی", "تصویر سند دفترچه‌ای"],
    requiredAssignments: ["registry_legal", "survey"],
    requiredReports: ["registry_legal", "survey"],
  },
  "land-apartment-subdivision": {
    documentTypes: [
      "مدارک مالکیت",
      "نقشه و مختصات",
      "مدارک هویتی",
      "وکالت‌نامه یا نمایندگی",
      "مستندات فنی",
    ],
    requiredDocuments: ["مدارک مالکیت", "نقشه و مختصات"],
    requiredAssignments: ["survey"],
    requiredReports: ["survey"],
  },
  "merge-partition": {
    documentTypes: [
      "مدارک مالکیت",
      "مدارک هویتی ذی‌نفعان",
      "نقشه و مختصات",
      "وکالت‌نامه یا نمایندگی",
      "مستندات فنی",
    ],
    requiredDocuments: [
      "مدارک مالکیت",
      "مدارک هویتی ذی‌نفعان",
      "نقشه و مختصات",
    ],
    requiredAssignments: ["survey"],
    requiredReports: ["survey"],
  },
  "property-status-change": {
    documentTypes: [
      "مدارک مالکیت",
      "مستندات تغییر وضعیت",
      "مدارک هویتی",
      "وکالت‌نامه یا نمایندگی",
      "مستندات پشتیبان",
    ],
    requiredDocuments: ["مدارک مالکیت", "مستندات تغییر وضعیت"],
    requiredAssignments: ["registry_legal"],
    requiredReports: ["registry_legal"],
  },
  "boundary-determination": {
    documentTypes: [
      "مدارک مالکیت",
      "نقشه یا کروکی",
      "مدارک هویتی",
      "وکالت‌نامه یا نمایندگی",
      "مستندات فنی",
    ],
    requiredDocuments: ["مدارک مالکیت", "نقشه یا کروکی"],
    requiredAssignments: ["survey"],
    requiredReports: ["survey"],
  },
  "deed-correction": {
    documentTypes: [
      "مدارک هویتی",
      "تصویر سند مالکیت",
      "مدارک پشتیبان",
      "وکالت‌نامه یا نمایندگی",
    ],
    requiredDocuments: [
      "مدارک هویتی",
      "تصویر سند مالکیت",
      "مدارک پشتیبان",
    ],
    requiredAssignments: ["registry_legal"],
    requiredReports: ["registry_legal"],
  },
  "occupant-cadastral-deed": {
    documentTypes: [
      "مدارک هویتی",
      "مدارک مثبت تصرف",
      "نقشه و مختصات",
      "استشهادیه یا مستند حسب مورد",
      "وکالت‌نامه یا نمایندگی",
      "مستندات پشتیبان",
    ],
    requiredDocuments: [
      "مدارک هویتی",
      "مدارک مثبت تصرف",
      "نقشه و مختصات",
      "استشهادیه یا مستند حسب مورد",
    ],
    requiredAssignments: ["registry_legal", "survey"],
    requiredReports: ["registry_legal", "survey"],
    requiresRiskReview: true,
  },
  "article-10-claim": {
    documentTypes: [
      "مدارک هویتی",
      "مستندات ادعا",
      "مدارک مالکیت",
      "وکالت‌نامه یا نمایندگی",
      "مستندات پشتیبان",
    ],
    requiredDocuments: ["مدارک هویتی", "مستندات ادعا"],
    requiredAssignments: ["registry_legal"],
    requiredReports: ["registry_legal"],
  },
};

const subdivisionUnitSchema = z.object({
  identifier: z.string().trim().min(1).max(80),
  floor: z.string().trim().max(40).optional(),
  useType: z.string().trim().min(2).max(80),
  area: z.coerce.number().positive().max(1_000_000_000),
});

type StructureInput = {
  relatedProperties: unknown[];
  parties: unknown[];
  subdivisionUnits: unknown[];
  formData: Record<string, unknown>;
};

export function validatePage04Structure(
  serviceCode: string,
  input: StructureInput,
): Record<string, unknown>[] {
  if (serviceCode === "merge-partition") {
    const expected = Number(input.formData.relatedPlateCount);
    if (input.relatedProperties.length + 1 !== expected)
      throw new z.ZodError([
        {
          code: "custom",
          path: ["relatedProperties"],
          message: "تعداد پلاک‌های اصلی و مرتبط باید با تعداد اعلام‌شده برابر باشد.",
        },
      ]);
    if (input.parties.length === 0)
      throw new z.ZodError([
        {
          code: "custom",
          path: ["parties"],
          message: "ثبت حداقل یک مالک یا ذی‌نفع الزامی است.",
        },
      ]);
  }
  if (serviceCode !== "land-apartment-subdivision") return [];
  const units = z.array(subdivisionUnitSchema).min(2).max(10_000).parse(
    input.subdivisionUnits,
  );
  if (units.length !== Number(input.formData.unitCount))
    throw new z.ZodError([
      {
        code: "custom",
        path: ["subdivisionUnits"],
        message: "تعداد قطعات یا واحدهای ثبت‌شده باید با تعداد اعلام‌شده برابر باشد.",
      },
    ]);
  return units;
}

export function missingRequiredDocuments(
  serviceCode: string,
  documentTypes: readonly string[],
): string[] {
  const rule = page04ServiceRules[serviceCode];
  if (!rule) return [];
  const received = new Set(documentTypes);
  return rule.requiredDocuments.filter((type) => !received.has(type));
}

export function page04AllowedActions(input: {
  role: string;
  owner: boolean;
  assigned: boolean;
  status: string;
}) {
  const editable = [
    "draft",
    "awaiting_applicant",
    "documents_deficient",
    "registry_return_deficient",
    "correcting_registry_deficiency",
  ].includes(input.status);
  const closed = [
    "completed",
    "closed_incomplete",
    "out_of_scope",
    "stopped_legal_technical",
    "stopped_security",
    "cancelled_by_applicant",
    "referred_complaint",
  ].includes(input.status);
  const cancellable = [
    "draft",
    "submitted",
    "initial_review",
    "documents_deficient",
    "awaiting_applicant",
    "completed_documents",
    "awaiting_payment",
  ].includes(input.status);
  return {
    uploadDocument:
      !closed &&
      ((editable &&
        input.owner &&
        ["applicant", "representative"].includes(input.role)) ||
        input.assigned ||
        ["operations_manager", "compliance", "admin"].includes(input.role)),
    deleteDocument:
      editable &&
      ((input.owner && ["applicant", "representative"].includes(input.role)) ||
        ["operations_manager", "admin"].includes(input.role)),
    submit:
      ["draft", "awaiting_applicant"].includes(input.status) &&
      ((input.owner && ["applicant", "representative"].includes(input.role)) ||
        input.role === "admin"),
    cancel:
      cancellable &&
      ((input.owner && ["applicant", "representative"].includes(input.role)) ||
        input.role === "admin"),
  };
}
