/**
 * Persian labels for machine codes the API returns. UI code must never render
 * a raw enum value ("received", "registry_legal"…): use fa() / roleLabel().
 */
export const roleLabels: Record<string, string> = {
  applicant: "متقاضی",
  representative: "نماینده یا وکیل",
  registry_expert: "کارشناس ثبتی",
  surveyor: "کارشناس نقشه‌برداری",
  support: "پشتیبانی",
  finance: "مسئول مالی",
  operations_manager: "مدیر عملیات",
  compliance: "مسئول تطبیق",
  technical: "مسئول فنی",
  admin: "مدیر سامانه",
  observer: "ناظر سازمان ثبت",
};

const codeLabels: Record<string, string> = {
  // generic lifecycle
  open: "باز",
  closed: "بسته",
  pending: "در انتظار",
  approved: "تأیید شد",
  rejected: "رد شد",
  revoked: "لغوشده",
  processed: "پردازش شد",
  completed: "تکمیل‌شده",
  active: "فعال",
  suspended: "تعلیق‌شده",
  disabled: "غیرفعال",
  // complaints / tickets / interactions
  received: "دریافت‌شده",
  under_review: "در حال بررسی",
  answered: "پاسخ داده شد",
  assigned: "ارجاع‌شده",
  waiting_applicant: "منتظر متقاضی",
  resolved: "حل‌شده",
  follow_up: "نیازمند پیگیری",
  referred: "ارجاع شد",
  complaint_registered: "شکایت ثبت شد",
  // payments / refunds
  successful: "موفق",
  failed: "ناموفق",
  refunded: "بازپرداخت‌شده",
  // integrations / backups / health
  queued: "در صف",
  processing: "در حال پردازش",
  succeeded: "موفق",
  dead_letter: "نیازمند بررسی دستی",
  running: "در حال اجرا",
  verified: "تأییدشده",
  success: "موفق",
  error: "خطا",
  timeout: "مهلت تمام شد",
  operational: "عملیاتی",
  degraded: "کاهش کیفیت",
  outage: "قطع سرویس",
  // security
  reviewed: "بررسی‌شده",
  false_positive: "هشدار کاذب",
  minor: "جزئی",
  major: "مهم",
  low: "کم",
  medium: "متوسط",
  high: "زیاد",
  critical: "بحرانی",
  // notifications
  sent: "ارسال‌شد",
  read: "خوانده‌شد",
  // controls
  retain: "ابقای دسترسی",
  restrict: "محدودسازی",
  suspend: "پیشنهاد تعلیق",
  compliant: "منطبق",
  escalated: "ارجاع به سطح بالاتر",
  valid: "معتبر",
  expired: "منقضی",
  superseded: "جایگزین‌شده",
  // reports
  initial_review: "بررسی اولیه",
  registry_legal: "بررسی حقوقی ثبتی",
  survey: "نقشه‌برداری",
  compliance: "تطبیق",
  risk: "ریسک",
  accepted: "پذیرفته‌شده",
  deficient: "دارای نقص",
  needs_second_review: "نیازمند بررسی دوم",
  // documents / publication
  draft: "پیش‌نویس",
  published: "منتشرشده",
  initially_accepted: "پذیرش اولیه",
  needs_revision: "نیازمند اصلاح",
  // evidence
  technical_document: "مستند فنی",
  operational_document: "مستند عملیاتی",
  contractor_contract: "قرارداد پیمانکار",
  backup_restore_test: "آزمون بازیابی پشتیبان",
  penetration_test: "آزمون نفوذ",
};

/** Persian label for an enum code; unknown codes are shown unchanged. */
export function fa(code: unknown): string {
  const value = String(code ?? "");
  return codeLabels[value] ?? value;
}

export function roleLabel(role: unknown): string {
  const value = String(role ?? "");
  return roleLabels[value] ?? value;
}
