# سامانه کارگزاری ثبتی

سامانه فارسی و راست‌به‌چپ برای مدیریت خدمات فنی، مهندسی، ثبتی و حقوقی؛ شامل سایت عمومی، پنل متقاضی، فضای کارشناسان، عملیات، مالی، پشتیبانی، تطبیق، مدیریت و داشبورد فقط‌خواندنی ناظر.

## وضعیت فعلی

نسخه حاضر برای تست داخلی آماده است. در اجرای نهایی محلی، schema و seed روی MariaDB سازگار با XAMPP بارگذاری شد، API با دیتابیس متصل پاسخ سلامت داد، تمام نقش‌های seed احراز هویت شدند، سه فرم خدمت به‌صورت End-to-End اجرا شدند و کنترل مالکیت/سطح دسترسی بررسی شد.

درگاه پرداخت PSP و API رسمی سازمان ثبت عمداً تا زمان دریافت credential، قرارداد فنی و محیط رسمی فعال نشده‌اند؛ در محیط توسعه این دو مسیر پاسخ کنترل‌شده و قابل مشاهده دارند و provider جعلی تولیدی وجود ندارد.

## فناوری و معماری

- **Frontend:** React 18، TypeScript، Vite، مسیرهای محافظت‌شده، RTL فارسی و طراحی responsive
- **Backend:** Node.js، Express 4، TypeScript، routeهای ماژولار و middlewareهای مرکزی
- **Database:** MySQL/MariaDB سازگار با XAMPP و phpMyAdmin، `mysql2`، ۴۲ جدول canonical به‌همراه `schema_migrations`
- **Validation:** Zod در Backend و تبدیل ارقام فارسی/عربی به انگلیسی در ورودی‌های کاربر و مدیر
- **Authentication:** bcrypt، JWT با اعتبارسنجی مجدد نقش/وضعیت حساب، OTP موبایل، TOTP/MFA و recovery code
- **Authorization:** RBAC و capability واقعی در Backend، کنترل ownership، assignment، پرداخت و archive؛ پنهان‌سازی UI به‌تنهایی ملاک دسترسی نیست
- **Files:** upload با allowlist MIME، بررسی signature، محدودیت حجم، نام تصادفی، versioning و دانلود احراز‌شده
- **Reliability:** transaction برای عملیات حساس، status history، idempotency برای صف integration، correlation ID و audit chain

## ماژول‌های تحویل‌شده

- سایت عمومی: خدمات، تعرفه، مدارک لازم، قوانین، حریم خصوصی، FAQ، پشتیبانی و پیگیری پرونده
- متقاضی: ثبت‌نام حقیقی/حقوقی، پروفایل، draft، اطلاعات ملک و طرف‌ها، بارگذاری/اصلاح مدارک، timeline، پیام، اعلان، پرداخت و شکایت
- خدمات پویا: ۹ تعریف خدمت با فرم و مدارک اختصاصی، شامل صدور المثنی، تبدیل سند دفترچه‌ای، تفکیک، تجمیع/افراز، اصلاح، تعیین حدود، سند متصرفان و ادعای ماده ۱۰
- عملیات و کارشناسان: صف پرونده، ارجاع، انتقال ارجاع، گزارش کارشناسی، بازبینی مستقل، نقص مدارک و کنترل تعارض منافع
- مالی: quote، receipt/refund model و gate پرداخت رسمی؛ کارت‌به‌کارت و حساب واسط در workflow وجود ندارد
- ارتباطات: پیام داخلی، اعلان، تیکت، SLA، شکایت و گزارش تخلف
- مدیریت و امنیت: مدیریت خدمت/تعرفه، کاربران و نقش‌ها، audit، رخداد امنیتی، backup، retention و داشبورد سازمانی read-only
- یکپارچه‌سازی: صف پایدار API سازمان با محیط configurable، timeout/retry، idempotency، logging و error mapping

## نقش‌ها و حدود دسترسی

مدیر سامانه، مدیر عملیات، مسئول فنی، کارشناس ثبتی و حقوقی، کارشناس نقشه‌برداری، پشتیبان، مسئول مالی، مسئول تطبیق، بازرس/کنترل داخلی، ناظر فقط‌خواندنی، متقاضی حقیقی، نماینده قانونی و شخص حقوقی متقاضی در schema و capability matrix تعریف شده‌اند.

هر endpoint حساس در Backend نقش و capability را بررسی می‌کند. ناظر سازمان ثبت فقط read-only است؛ تلاش برای عملیات Write با پاسخ 403 رد می‌شود. پرونده، مدرک و پرداخت کاربر دیگر نیز با کنترل ownership/assignment/payment قابل دسترسی نیست.

## راه‌اندازی محلی

### پیش‌نیاز

- Node.js 20 یا بالاتر
- XAMPP با Apache و MariaDB/MySQL
- npm

### نصب و تنظیم

```bash
npm install
cp .env.example .env
```

مقادیر `.env` را برای محیط خود تنظیم کنید. در نمونه توسعه این پروژه، MySQL روی `3307` قرار دارد؛ در نصب معمول XAMPP ممکن است `3306` باشد و باید `DB_PORT` با پورت واقعی یکی باشد.

### ساخت دیتابیس و migration

```bash
npm run db:setup:xampp
npm run db:validate
npm run db:migrate:status
```

فرمان setup schema، seed، baseline migrationها و validation را اجرا می‌کند. برای دیتابیس موجود ابتدا backup بگیرید و سپس `npm run db:migrate` را اجرا کنید؛ checksum migration تغییرکرده عمداً باعث توقف می‌شود.

### اجرای برنامه

```bash
npm run dev
```

یا در دو ترمینال:

```bash
npm run dev -w server
npm run dev -w client
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- API health: [http://localhost:4000/api/health](http://localhost:4000/api/health)

## حساب‌های توسعه

رمز همه حساب‌های seed برابر `ChangeMe123!` است و فقط برای توسعه محلی است؛ پیش از هر استقرار باید rotate یا حذف شوند.

| نقش | موبایل |
|---|---|
| مدیر سامانه | `09120000001` |
| کارشناس ثبتی | `09120000002` |
| کارشناس نقشه‌برداری | `09120000003` |
| پشتیبانی | `09120000004` |
| مسئول مالی | `09120000005` |
| مدیر عملیات | `09120000006` |
| مسئول تطبیق | `09120000007` |
| مسئول فنی | `09120000008` |
| ناظر سازمان ثبت | `09120000009` |

## کنترل کیفیت و شواهد آزمون

دستورهای اصلی کنترل:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high --offline
npm run db:check
```

آخرین اجرای محلی:

- Server: **۱۸ فایل، ۹۰ تست، Pass**
- Client: **۱۰ فایل، ۲۳ تست، Pass**
- Typecheck، lint و build: **Pass**
- audit آفلاین: **۰ آسیب‌پذیری در cache محلی**
- `npm run security:scan`: **Pass، ۰ آسیب‌پذیری**
- schema validation: **۴۳ جدول شامل `schema_migrations`، ۱۱ نقش، ۹ خدمت و ۱۳ migration**
- health API: **database: connected**
- frontend smoke: **HTTP 200 روی پورت ۵۱۷۳**

سناریوهای زنده اجراشده:

1. ثبت‌نام و ورود متقاضی، ساخت draft، ثبت ملک، بارگذاری سه مدرک، ارسال نهایی و پیگیری با HMAC token
2. ثبت‌نام شخص حقوقی با سازمان، شناسه ملی و profile اختصاصی
3. اعلام نقص توسط عملیات، درج اعلان متقاضی، بارگذاری نسخه اصلاحی و ارسال مجدد به صف
4. ارجاع پرونده به کارشناس ثبتی، مشاهده پرونده ارجاع‌شده و ثبت گزارش کارشناسی
5. اجرای دو خدمت دیگر (تبدیل سند دفترچه‌ای و تفکیک آپارتمان) با فرم پویا، داده ساختاریافته و مدارک الزامی
6. ماتریس ورود و endpoint برای تمام ۹ نقش staff؛ تمام موارد مجاز/غیرمجاز مطابق capability پاسخ دادند
7. تلاش متقاضی دوم برای پرونده، مدرک و quote متقاضی اول؛ همه با 403 رد شدند
8. تلاش Write ناظر در عملیات، integration و کنترل داخلی؛ همه با 403 رد شدند
9. پرداخت در حالت توسعه با پاسخ کنترل‌شده 503 متوقف شد تا PSP رسمی متصل شود

جزئیات ممیزی و شواهد در این فایل‌هاست:

- [گزارش ممیزی پروژه](PROJECT_AUDIT_REPORT_FA.md)
- [برنامه E2E و نتایج اجرا](docs/E2E_TEST_PLAN_FA.md)
- [گزارش امنیت و یافته‌ها](SECURITY_AUDIT_README.md)
- [ممیزی خط‌به‌خط سند](PDF_LINE_BY_LINE_AUDIT_FA.md)
- [مستند دیتابیس](docs/DATABASE_FA.md)
- [راهنمای آزمون](docs/TESTING_FA.md)

## ملاحظات امنیتی پیش از انتشار

پیش از production باید JWT از localStorage به session امن یا سازوکار revoke منتقل شود، CSRF و rate-limit توزیع‌شده اضافه شود، upload quota و AV/CDR فعال شود، backup با رمزنگاری authenticated و restore ایمن انجام شود، MySQL روی TLS/private network قرار گیرد، seed credentials حذف شوند و penetration test مجاز روی staging انجام شود.

PSP رسمی، API سازمان ثبت، SMS/Email رسمی، HTTPS، secret manager، reverse proxy و سرور production وابستگی‌های بیرونی هستند و بدون credential/قرارداد واقعی فعال نمی‌شوند.
