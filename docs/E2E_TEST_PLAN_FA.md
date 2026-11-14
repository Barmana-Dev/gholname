# برنامه آزمون یکپارچه و End-to-End

این برنامه مسیرهای اصلی سامانه را به تست قابل تکرار تبدیل می‌کند. اجرای ثبت‌شده این فایل روی MariaDB 10.4.28 سازگار با XAMPP در محیط ایزوله، API پورت ۴۰۰۰ و UI پورت ۵۱۷۳ انجام شده است؛ برای staging/production باید با credential و سرویس واقعی تکرار شود.

## پیش‌شرط‌های محیط

```bash
npm run db:setup:xampp
npm run dev
curl -fsS http://localhost:4000/api/health
```

XAMPP daemon اصلی به‌دلیل نیاز به دسترسی root از داخل این محیط start نشد؛ برای جلوگیری از ادعای نادرست، یک MariaDB سازگار با XAMPP در مسیر موقت و پورت ۳۳۰۷ اجرا شد و schema/seed/migration روی همان DB اعتبارسنجی شد. این جایگزین فقط برای تست داخلی است و اثبات سرویس XAMPP نصب مقصد نیست.

## سناریوها

| شناسه | مسیر | نتیجه مورد انتظار | وضعیت این اجرا |
|---|---|---|---|
| E2E-01 | متقاضی: ثبت‌نام ← ورود ← تکمیل پروفایل ← انتخاب خدمت ← پیش‌نویس ← ملک ← مدارک ← ارسال | شماره پرونده یکتا، tracking token و وضعیت `submitted` ثبت شود | `PASS`؛ ثبت‌نام، draft، ملک، سه مدرک، submit و tracking اجرا شد |
| E2E-02 | عملیات: مشاهده پرونده جدید ← اعلام نقص ← اعلان متقاضی ← بارگذاری اصلاحی | پرونده به صف بررسی بازگردد و پشتیبان/کارشناس خارج از دامنه آن 403 بگیرد | `PASS`؛ notification transactional اضافه و مسیر دوباره اجرا شد |
| E2E-03 | کارشناس: پرونده ارجاعی ← مشاهده فقط پرونده مجاز ← گزارش کارشناسی ← وضعیت مجاز | پرونده غیرارجاعی و transition غیرمجاز 403/409 برگرداند | `PASS`؛ assignment، detail و report اجرا شد |
| E2E-04 | پرداخت: ایجاد درخواست ← callback ← verification ← رسید | idempotency از callback تکراری جلوگیری و رابطه payment/case حفظ شود | `PARTIAL / BLOCKED_BY_EXTERNAL_DEPENDENCY`؛ quote Pass و initiate در حالت توسعه 503؛ PSP callback/verification نیازمند credential رسمی است |
| E2E-05 | ناظر سازمان: ورود ← داشبورد ← metrics/log مجاز ← تلاش Write | همه Writeها 403 و پاسخ‌های حساس redacted/read-only باشند | `PASS`؛ role matrix تمام مسیرهای read و سه Write منفی را پوشش داد |
| E2E-06 | متقاضی A برای پرونده/مدرک/پرداخت متقاضی B درخواست می‌فرستد | هر سه درخواست 403 یا 404 غیرقابل‌enumeration برگرداند | `PASS`؛ detail، document download و payment quote با 403 رد شدند |

## پوشش خودکار محلی

تست‌های policy و واحدِ `server` (۱۸ فایل/۹۰ تست) و `client` (۱۰ فایل/۲۳ تست) بخشی از مجوز نقش، transition، redaction ناظر، tracking token، validation، تبدیل رقم و کنترل‌های فایل را پوشش می‌دهند. اجرای زنده این سند نیز API/DB را بررسی کرده است؛ مرور بصری دستی مرورگر، PSP رسمی و Registry API همچنان باید در staging تکرار شوند.

## شواهد اجرای ثبت‌شده

```text
DB setup/validate/status: PASS — 43 tables, 11 roles, 9 services, 13 migrations
API health: PASS — database=connected
Frontend smoke: PASS — HTTP 200 on :5173
Role matrix: PASS — 9 staff roles, allowed and denied endpoints
Applicant E2E: PASS — application 1, tracking token, document versions
Dynamic services: PASS — booklet-to-cadastral and apartment subdivision
Legal applicant registration: PASS — organization identity and profile fields
Security regression: PASS — IDOR, observer write, redaction, complaint scope
Payment: BLOCKED_BY_EXTERNAL_DEPENDENCY — official PSP credentials/callback contract absent
```
