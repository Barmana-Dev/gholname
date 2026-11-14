export const PUBLIC_PAYMENT_WARNING =
  "پرداخت فقط از درگاه رسمی متصل به حساب حقوقی کارگزاری معتبر است. هر درخواست واریز به کارت یا حساب شخصی را فوراً گزارش کنید.";

export const SMS_PAYMENT_WARNING =
  "هشدار: کارگزاری هرگز پرداخت به کارت یا حساب شخصی درخواست نمی‌کند.";

export const FINANCIAL_COMPLAINT_SLA_HOURS = 4;

export function isUrgentFinancialComplaint(category: string): boolean {
  return category === "off_platform_payment";
}

export function complaintDueSql(category: string): string {
  return isUrgentFinancialComplaint(category)
    ? `DATE_ADD(NOW(),INTERVAL ${FINANCIAL_COMPLAINT_SLA_HOURS} HOUR)`
    : "DATE_ADD(NOW(),INTERVAL 3 DAY)";
}

export function withSmsPaymentWarning(message: string): string {
  const normalized = message.trim();
  return normalized.includes(SMS_PAYMENT_WARNING)
    ? normalized
    : `${normalized}\n${SMS_PAYMENT_WARNING}`;
}
