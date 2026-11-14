# راهنمای آزمون

دستور کنترل کامل پروژه:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit
npm run security:scan
npm run db:check
```

سناریوهای پذیرش شامل ثبت‌نام فرد/شخص حقوقی و رضایت‌ها، ورود تلفن‌محور، تبدیل رقم فارسی، ویرایش پروفایل، OTP، قفل حساب/MFA و recovery، پیش‌نویس، تشخیص تکرار، چندملک/چندطرف، بارگذاری/نسخه/حذف سند، نام فارسی فایل، پیوست پیام/شکایت، ارجاع، گزارش و بازبینی مستقل پرونده حساس، صف retry/dead-letter، خروجی‌ها، backup/restore، audit، anomaly، بایگانی و کنترل قابلیت نقش است.

آخرین اجرای خودکار این checkout در ۱۱ اوت ۲۰۲۶ شامل ۹۰ تست سرور در ۱۸ فایل و ۲۳ تست کلاینت در ۱۰ فایل بود؛ typecheck، lint، build و `npm audit --omit=dev --audit-level=high --offline` نیز موفق شدند. علاوه بر suite واحد/policy، API و DB ایزوله محلی با نقش‌های seed و سناریوهای E2E اصلی اجرا شدند.

`npm run db:check` تست ایستای syntax اسکریپت‌ها، تعداد جدول canonical، نام‌گذاری و ترتیب migrationها را بدون تغییر دیتابیس اجرا می‌کند. در این اجرا `npm run db:validate`، health API و سناریوهای E2E روی MariaDB ایزوله نیز Pass شدند؛ راه‌اندازی XAMPP اصلی باید در staging مقصد تکرار شود. `npm run security:scan` در اجرای نهایی با `found 0 vulnerabilities` موفق شد.

در همین اجرا، Vite با `http://127.0.0.1:5173` پاسخ HTTP 200 داد و backend با `database: connected` روی پورت ۴۰۰۰ فعال بود. schema/seed/migration روی MariaDB سازگار با XAMPP در محیط ایزوله پورت ۳۳۰۷ اعتبارسنجی شد. XAMPP daemon اصلی به‌دلیل نیاز به root از داخل این محیط start نشد و باید در سیستم مقصد جداگانه بررسی شود.

اجرای زنده ثبت‌شده شامل ثبت‌نام دو متقاضی، ساخت و ارسال سه پرونده، سه نوع upload امن، tracking token، اعلام نقص و notification، اصلاح و ارسال مجدد، ارجاع و گزارش کارشناس، role matrix نه نقش staff، observer write denial و آزمون IDOR بین دو متقاضی بود. آغاز پرداخت واقعی عمداً با پاسخ 503 کنترل‌شده متوقف شد چون PSP رسمی پیکربندی نشده است.

موفقیت build و آزمون backup محلی اثبات‌کننده TLS، PSP، API/پیامک رسمی، زمان‌بندی نسخه پشتیبان یا ظرفیت تولید نیست؛ این موارد باید در محیط مقصد جداگانه آزمون شوند.
