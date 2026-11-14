export const reviewStatusOptions: ReadonlyArray<readonly [string, string]> = [
  ["initial_review", "در بررسی اولیه"],
  ["documents_deficient", "نقص مدارک"],
  ["awaiting_applicant", "در انتظار تکمیل متقاضی"],
  ["completed_documents", "مدارک تکمیل"],
  ["additional_action", "نیازمند اقدام تکمیلی"],
];

export const managedStatusOptions: ReadonlyArray<readonly [string, string]> = [
  ...reviewStatusOptions,
  ["assigned_registry_expert", "ارجاع به کارشناس ثبتی"],
  ["assigned_surveyor", "ارجاع به کارشناس نقشه‌برداری"],
  ["registry_exchange", "در حال تبادل اطلاعات با سازمان"],
  ["awaiting_registry", "در انتظار پاسخ سازمان"],
  ["awaiting_payment", "در انتظار پرداخت"],
  ["paid", "پرداخت‌شده"],
  ["under_expert_review", "در حال بررسی کارشناسی"],
  ["ready_to_send", "آماده ارسال و تبادل اطلاعات"],
  ["registry_return_deficient", "بازگشت از سازمان با نقص"],
  ["correcting_registry_deficiency", "در حال اصلاح نقص سازمان"],
  ["completed", "خاتمه‌یافته"],
  ["closed_incomplete", "مختومه به علت عدم تکمیل"],
  ["out_of_scope", "خارج از صلاحیت کارگزاری"],
  ["stopped_legal_technical", "متوقف به علت ایراد حقوقی یا فنی"],
  ["stopped_security", "متوقف به علت ایراد امنیتی"],
  ["cancelled_by_applicant", "لغوشده توسط متقاضی"],
  ["referred_complaint", "ارجاع به شکایت"],
];
