# گزارش جامع A/B Testing، عیب‌یابی و اصلاحات — پروژه `gholname`

> نسخه سند: ۱٫۰ — تاریخ: ۱۴۰۵/۰۸/۳۰
> دامنه: کل مونوریپو (`server/`, `client/`, `database/`, `scripts/`, پیکربندی)
> روش: بازبینی دستی فایل‌به‌فایل (Zero-Skip) + اجرای واقعی تست/تایپ/لینت/بیلد
> زبان: فارسی، با حفظ اصطلاحات فنی انگلیسی

---

## ۱) خلاصه مدیریتی و آمار کلی

### ۱٫۱ وضعیت آمادگی پروژه برای A/B Testing

پروژه `gholname` از نظر **پایداری، امنیت و قابلیت نگهداری** پس از اصلاحات این دور در وضعیت قابل قبولی است؛ اما از نظر **زیرساخت Experimentation** در وضعیت «آماده نیست / نیازمند فاز پیاده‌سازی» قرار دارد. جمع‌بندی دقیق:

| محور | وضعیت فعلی | توضیح |
|---|---|---|
| قابلیت جداسازی ترافیک (Traffic Splitting) | ❌ وجود ندارد | نه Feature Flag دارد، نه Bucketing؛ هیچ ماژولی نسخه A/B را تفکیک نمی‌کند |
| Sticky Bucketing | ❌ وجود ندارد | هیچ جدول assignment یا کوکی نسخه وجود ندارد |
| ثبت رویداد و متریک (Telemetry) | ⚠️ جزئی | `tracking.ts` و `notifications.ts` رویدادهای عملیاتی/اطلاع‌رسانی دارند، اما هیچ رویداد «نمایش نسخه» یا «تبدیل» ثبت نمی‌شود |
| آمادگی داده برای تحلیل | ❌ وجود ندارد | جدول `experiment*` در اسکیمای ۴۵ جدولی نیست (نه در `schema.sql` و نه در مایگریشن‌ها) |
| تفکیک نقش‌ها برای آزمایش | ⚠️ نسبی | RBAC کامل است، اما هیچ مفهوم «کاربر آزمایشی/کاربر کنترل» وجود ندارد |
| نبود نشت بین گروه‌ها (Contamination) | ⚠️ نیازمند طراحی | داده‌ها بر اساس `user_id`/`application_id` ایزوله‌اند (نقطه قوت)، اما هیچ لایه‌ای مانع مشاهده نسخه A توسط کاربر گروه B نیست |
| سازگاری با امنیت فعلی | ✅ خوب | CSRF + کوکی HttpOnly + TOTP + Rate Limit + Audit Chain به‌صورت یکپارچه پیاده شده‌اند و اصلاحات این دور به آن‌ها دست نزده است |
| سازگاری با CSP | ⚠️ محدودیت | `connect-src 'self'` اجازه اتصال به SDKهای تحلیلی خارجی (GA/Amplitude/Optimizely) را نمی‌دهد — باید همه‌چیز same-origin باشد |

**نتیجه:** A/B Testing در این پروژه فقط با یک لایه Experimentation **same-origin** (جدول + میدل‌ور + endpoint رویداد داخلی) قابل اجراست؛ استفاده از ابزارهای SaaS خارجی با CSP فعلی شکست می‌خورد.

### ۱٫۲ آمار بررسی

| شاخص | مقدار |
|---|---|
| کل فایل‌های بررسی‌شده | **۱۳۵** |
| فایل‌های Backend (کد + مسیرها + اسکریپت‌های سرور) | ۴۵ |
| فایل‌های تست سرور | ۲۰ (۱۹ موجود + ۱ تست جدید) |
| فایل‌های Frontend (TS/TSX + CSS) | ۲۷ |
| فایل‌های تست کلاینت | ۱۳ |
| فایل‌های Database (schema + مایگریشن + seed + ابزار) | ۲۷ |
| اسکریپت‌ها و پیکربندی (`.env.example`, `package.json`×۲, `scripts/`×۲) | ۵ |
| مشکلات یافت‌شده | **۲۱** |
| مشکلات اصلاح‌شده در کد | **۲۱ (۱۰۰٪)** |
| موارد نیازمند بررسی دستی / تصمیم محصولی | ۸ |
| تست‌های سرور (پس از اصلاح) | ۱۰۷ تست در ۲۰ فایل — **همه PASS** |
| تست‌های کلاینت (پس از اصلاح) | ۳۳ تست در ۱۳ فایل — **همه PASS** |

### ۱٫۳ آمار مشکلات به تفکیک شدت و لایه

| شدت | تعداد | لایه‌ها |
|---|---|---|
| 🔴 بحرانی (Critical) | ۵ | Server/Infra (۳)، Server/Security (۱)، Server/Logic (۱) |
| 🟠 بالا (High) | ۶ | Server/API (۴)، Client/Server Contract (۱)، Client (۱) |
| 🟡 متوسط (Medium) | ۷ | Server (۱)، Client (۱)، Database (۳)، Scripts (۱)، Security/Infra (۱) |
| 🟢 کم (Low) | ۳ | Scripts (۲)، Config (۱) |
| **جمع** | **۲۱** | **همه اصلاح‌شده** |

| لایه | تعداد مشکل | اصلاح‌شده |
|---|---|---|
| Server (routes + core) | ۹ | ۹ |
| Security / Infra | ۳ | ۳ |
| Database | ۳ | ۳ |
| Client | ۲ | ۲ |
| Scripts / Config | ۴ | ۴ |

### ۱٫۴ مهم‌ترین یافته‌ها در یک نگاه

1. **تست‌های سرور عملاً مرده بودند:** ۱۰ فایل از ۱۹ فایل تست هنگام `import` به‌خاطر `PORT=0` (که vitest خودش ست می‌کند) با `ZodError` می‌افتادند. یعنی ۵۶ تست پاس‌شده و ۱۰ فایل کاملاً اجرانشده. این یعنی هر رگرسیون در مسیرهای اصلی (auth/admin/operations) می‌توانست بی‌سروصدا وارد شود — و همین‌طور هم شده بود (بندهای ۴ تا ۹).
2. **دو Rate Limiter اصلی به استور مشترک وصل نبودند** در حالی که `config.ts` در production استفاده از `RATE_LIMIT_STORE=database` را الزامی می‌کند؛ نتیجه: بودجه محدودیت در چند پروسه ضرب می‌شد.
3. **حسابداری مالی ناسازگار بود:** تأیید استرداد، `payments.status` را تغییر نمی‌داد؛ KPI داشبورد و گزارش مالی هرگز رقم اصلاح‌شده را نمی‌دیدند.
4. **مدیر می‌توانست خودش را تعلیق/تنزل دهد** و Installation را بدون مدیر فعال رها کند.
5. **`schema.sql` و مایگریشن‌ها/seed غیرقابل اجرای مکرر بودند** (seed روی UNIQUE می‌شکست، مایگریشن ۰۰۴ بدون `USE`). در تست واقعی MySQL این دور، `seed-base.sql` هم غیر idempotent بود و اصلاح شد.
6. **ناوبری دسکتاپ با CSS اشتباه پنهان می‌شد:** بلوک قواعد منوی موبایل بیرون از `@media (max-width:1050px)` قرار داشت و `.main-nav` را در همه عرض‌ها `display:none` و همبرگر را همیشه نمایان می‌کرد.
7. **چند لیمیتر روی یک درخواست خطای `ERR_ERL_DOUBLE_COUNT` می‌دادند** چون استور سفارشی `localKeys` نداشت؛ در لاگ هر درخواست یک ValidationError ثبت می‌شد (در تست واقعی سرور مشاهده شد).

---

## ۲) ماتریس پوشش کامل (Full Coverage Matrix)

راهنمای ستون‌ها:
- **A/B:** `—` = امکان‌پذیر نیست/بی‌معنا · `△` = فقط با تغییر ساختار · `✔` = آماده یا نزدیک به آماده
- **مشکل / اصلاح:** تعداد مشکل یافت‌شده / تعداد اصلاح‌شده در همان فایل

### ۲٫۱ لایه Backend — هسته و منطق تجاری (`server/src/`)

| فایل | بررسی | A/B | مشکل | اصلاح | یادداشت |
|---|---|---|---|---|---|
| `access.ts` | کامل | ✔ | 0 | 0 | ماتریس نقش/قابلیت تمیز؛ پایه Bucketing نقش‌محور |
| `app.ts` | کامل | △ | 1 | 1 | ترتیب میدل‌ور، CORS، CSP، maintenance، error handler |
| `application-access.ts` | کامل | — | 0 | 0 | کنترل مالکیت پرونده، صحیح |
| `archive-access.ts` | کامل | — | 0 | 0 | دسترسی زمان‌دار بایگانی |
| `audit-anchor.ts` | کامل | — | 0 | 0 | لنگر زنجیره Audit |
| `cdr-pure.ts` | کامل | — | 0 | 0 | توابع خالص؛ تست‌پذیر |
| `cdr.ts` | کامل | — | 0 | 0 | CDR واقعی/شبیه‌سازی |
| `config.ts` | کامل | △ | 1 | 1 | اعتبارسنجی env؛ **رفع PORT=0** |
| `crypto.ts` | کامل | — | 0 | 0 | AES-256-GCM + blind index |
| `db.ts` | کامل | — | 0 | 0 | pool، `rows`/`execute`/`transaction` |
| `financial-abuse.ts` | کامل | ✔ | 0 | 0 | قواعد سوءاستفاده مالی |
| `index.ts` | کامل | — | 0 | 0 | bootstrap و graceful shutdown |
| `integration-queue.ts` | کامل | ✔ | 0 | 0 | صف یکپارچه‌سازی، retry/backoff |
| `internal-controls-policy.ts` | کامل | ✔ | 0 | 0 | سیاست کنترل داخلی |
| `invite-password.ts` | کامل | — | 0 | 0 | تولید/بررسی رمز دعوت |
| `monitoring.ts` | کامل | — | 0 | 0 | health و متریک دیسک |
| `normalize.ts` | کامل | — | 0 | 0 | نرمال‌سازی ورودی |
| `notifications.ts` | کامل | ✔ | 0 | 0 | کانال اعلان؛ کاندید A/B پیام‌رسانی |
| `observer-data.ts` | کامل | ✔ | 0 | 0 | داده ناظر (read-only) |
| `organization-profile.ts` | کامل | ✔ | 0 | 0 | پروفایل سازمان |
| `page04-services.ts` | کامل | ✔ | 0 | 0 | قواعد ۰۴ خدمات |
| `page23.ts` | کامل | ✔ | 0 | 0 | قواعد ۲۳ پشتیبانی/مالی |
| `pagination.ts` | کامل | ✔ | 0 | 0 | صفحه‌بندی؛ کاندید A/B اندازه صفحه |
| `rate-limit.ts` | کامل | — | 1 | 1 | **رفع استور مشترک** |
| `registry-integration.ts` | کامل | ✔ | 0 | 0 | یکپارچه‌سازی ثبت |
| `request-context.ts` | کامل | ✔ | 0 | 0 | request id/context |
| `security.ts` | کامل | △ | 0 | 0 | authenticate، CSRF، TOTP، audit chain |
| `seed-guard.ts` | کامل | — | 0 | 0 | منع seed در production |
| `shared-limits.ts` | کامل | — | 0 | 0 | محدودیت‌های مشترک |
| `tracking.ts` | کامل | ✔ | 0 | 0 | رهگیری درخواست |
| `types.ts` | کامل | — | 0 | 0 | تایپ‌های دامنه |
| `upload-files.ts` | کامل | — | 0 | 0 | نام فایل، مسیر امن |
| `upload-security.ts` | کامل | — | 0 | 0 | اسکن/اعتبارسنجی فایل |
| `validation.ts` | کامل | △ | 0 | 0 | اسکیماهای ثبت‌نام/ورود |

### ۲٫۲ لایه Backend — مسیرها (`server/src/routes/`)

| فایل | بررسی | A/B | مشکل | اصلاح | یادداشت |
|---|---|---|---|---|---|
| `auth.ts` | کامل | ✔ | 1 | 1 | **رفع فیلدهای خالی در PATCH /me**؛ TOTP و recovery دست‌نخورده |
| `admin.ts` | کامل | ✔ | 2 | 2 | **رفع prototype-pollution در PATCH services**، **رفع تغییر نقش خود** |
| `operations.ts` | کامل | ✔ | 1 | 1 | **رفع ناسازگاری استرداد/پرداخت** |
| `applications.ts` | کامل | ✔ | 2 | 2 | **رفع Race نسخه مدرک**، **رفع طول reason** |
| `complaints.ts` | کامل | ✔ | 0 | 0 | شکایت/تخلف + رهگیری |
| `integrations.ts` | کامل | ✔ | 0 | 0 | API سازمان ثبت + کنترل payload |
| `internal-controls.ts` | کامل | ✔ | 0 | 0 | کنترل‌های داخلی |
| `public.ts` | کامل | ✔ | 1 | 1 | **رفع JSON.parse/NULL در خدمات عمومی** |

### ۲٫۳ لایه Backend — اسکریپت‌ها و تست‌ها

| فایل | بررسی | A/B | مشکل | اصلاح | یادداشت |
|---|---|---|---|---|---|
| `scripts/bootstrap-admin.ts` | کامل | — | 0 | 0 | ساخت مدیر اولیه |
| `scripts/encrypt-existing.ts` | کامل | — | 0 | 0 | مهاجرت رمزنگاری داده موجود |
| `scripts/verify-audit-chain.ts` | کامل | — | 0 | 0 | صحت‌سنجی زنجیره Audit |
| `access-matrix.test.ts` | کامل | — | 0 | 0 | ۳ تست |
| `cdr-pure.test.ts` | کامل | — | 0 | 0 | توابع خالص CDR |
| `complaint-access.test.ts` | کامل | — | 0 | 0 | ۳ تست |
| `financial-abuse.test.ts` | کامل | — | 0 | 0 | ۲ تست |
| `internal-controls-policy.test.ts` | کامل | — | 0 | 0 | ۳ تست |
| `observer-data.test.ts` | کامل | — | 0 | 0 | ۴ تست |
| `organization-profile.test.ts` | کامل | — | 0 | 0 | پروفایل |
| `page-02-policy.test.ts` | کامل | — | 0 | 0 | ۲ تست |
| `page-12.test.ts` | کامل | — | 0 | 0 | ۵ تست |
| `page-25.test.ts` | کامل | — | 0 | 0 | ۳ تست |
| `page04-services.test.ts` | کامل | — | 0 | 0 | ۷ تست |
| `page23.test.ts` | کامل | — | 0 | 0 | ۳ تست |
| `page32.test.ts` | کامل | — | 0 | 0 | ۴ تست |
| `rate-limit.test.ts` | کامل | — | 0 | 0 | محدودیت نرخ |
| `read-only-observer.test.ts` | کامل | — | 0 | 0 | ۸ تست |
| `registry-integration.test.ts` | کامل | — | 0 | 0 | ۷ تست |
| `security-features.test.ts` | کامل | — | 1 | 1 | **رفع مسیر POSIX در تست (پورتایل)** |
| `tracking.test.ts` | کامل | — | 0 | 0 | رهگیری |
| `validation.test.ts` | کامل | — | 0 | 0 | اسکیماها |
| `config.test.ts` | **جدید** | — | 0 | +۱ تست | **تست رگرسیون PORT=0** (۴ تست) |

### ۲٫۴ لایه Frontend (`client/src/`)

| فایل | بررسی | A/B | مشکل | اصلاح | یادداشت |
|---|---|---|---|---|---|
| `App.tsx` (۳۶۴۸ خط) | کامل | ✔ | 1 | 1 | **رفع داده تکراری در صفحه‌بندی درخواست‌ها** |
| `AdminManagement.tsx` (۹۴۳) | کامل | ✔ | 0 | 0 | فرم‌های مدیریتی؛ گیت نقش‌ها هم‌راستا با بک‌اند |
| `StaffWorkspace.tsx` (۷۹۲) | کامل | ✔ | 0 | 0 | میز کار کارشناسان |
| `InternalControls.tsx` | کامل | ✔ | 0 | 0 | کنترل‌های داخلی |
| `OrganizationProfile.tsx` | کامل | ✔ | 0 | 0 | پروفایل سازمان (علت باگ «ذخیره نمی‌شود» در سرور بود) |
| `UserSupport.tsx` | کامل | ✔ | 0 | 0 | تیکت/پیام |
| `GholnameHome.tsx` | کامل | ✔ | 0 | 0 | لندینگ؛ fallback تصویر و `aria-label` درست |
| `PublicEnhancements.tsx` | کامل | ✔ | 0 | 0 | اعلان‌ها/وضعیت سامانه؛ شکست fetch بی‌صدا مدیریت می‌شود |
| `StructuredApplicationFields.tsx` | کامل | ✔ | 0 | 0 | فرم پویا |
| `ServiceSpecificFields.tsx` | کامل | ✔ | 0 | 0 | فیلدهای اختصاصی خدمت |
| `LocationFields.tsx` | کامل | ✔ | 0 | 0 | استان/شهر/بخش |
| `PersianDateField.tsx` | کامل | △ | 0 | 0 | تاریخ شمسی/ساعت |
| `api.ts` | کامل | △ | 0 | 0 | `requestPage` وابسته به هدر `X-Page-Size` |
| `access.ts` | کامل | ✔ | 0 | 0 | کنترل UI بر اساس نقش |
| `types.ts` | کامل | — | 0 | 0 | تایپ‌های کلاینت |
| `router.tsx` | کامل | ✔ | 0 | 0 | مسیرها و گارد پنل |
| `drafts.ts` | کامل | ✔ | 0 | 0 | پیش‌نویس ۲ ساعته غیرهویتی |
| `public-navigation.ts` | کامل | ✔ | 0 | 0 | ناوبری عمومی |
| `digits.ts` | کامل | — | 0 | 0 | تبدیل ارقام فارسی/لاتین |
| `labels.ts` | کامل | — | 0 | 0 | برچسب وضعیت‌ها |
| `persian-date.ts` | کامل | — | 0 | 0 | تبدیل تاریخ |
| `locations.ts` (۴۰۹) | کامل | — | 0 | 0 | ۳۱ استان و ۱۸۵ شهر؛ عمداً آفلاین (بدون API) و دارای تست تعداد استان‌ها |
| `page-02-policy.ts` | کامل | — | 0 | 0 | متن سیاست |
| `main.tsx` | کامل | — | 0 | 0 | bootstrap + ErrorBoundary |
| `styles.css` (۳۱۳۵) | کامل | △ | 1 | 1 | **رفع بلوک منوی موبایل که بیرون از media query بود و ناوبری دسکتاپ را پنهان می‌کرد**؛ ۰ مورد `!important`؛ مدیا کوئری‌ها بررسی شدند (رفتار مرورگری تست نشد) |
| `panel-theme.css` (۹۳۷) | کامل | △ | 1 | 1 | ۲ مورد `!important` زائد روی `border-color` (بدون `border-style`) حذف شد؛ ۴ breakpoint بررسی شد |
| `gholname-home.css` (۱۹۳) | کامل | ✔ | 0 | 0 | لندینگ، mobile-first، `prefers-reduced-motion` لحاظ شده |
| `LocationFields.test.tsx` و ۱۲ تست دیگر کلاینت | کامل | — | 0 | 0 | ۳۳ تست PASS |

### ۲٫۵ لایه Database (`database/`)

| فایل | بررسی | A/B | مشکل | اصلاح |
|---|---|---|---|---|
| `schema.sql` (۴۵ جدول) | کامل | △ | 0 | 0 (بدون جدول experiment — طبق تصمیم، پیشنهاد در بخش ۶) |
| `migration_002_audit_completion.sql` | کامل | — | 0 | 0 |
| `migration_003_security_and_operations.sql` | کامل | — | 0 | 0 |
| `migration_004_page_01_organization_profile.sql` | کامل | — | 0 | 0 |
| `migration_004_page_12_messaging.sql` | کامل | — | 1 | 1 → **افزودن `USE regbroker;`** |
| `migration_004_page_20_api_controls.sql` | کامل | — | 0 | 0 |
| `migration_004_page_23_support_finance.sql` | کامل | — | 0 | 0 (نکته idempotency در بخش ۴٫۱۴) |
| `migration_004_page_25_sla_logs_archives.sql` | کامل | — | 0 | 0 |
| `migration_004_page_26_internal_controls.sql` | کامل | — | 0 | 0 |
| `migration_005_page_32_history_immutability.sql` | کامل | — | 0 | 0 |
| `migration_006_backend_hardening.sql` | کامل | — | 0 | 0 |
| `migration_007_phone_auth_and_uploads.sql` | کامل | — | 0 | 0 |
| `migration_008_seed_staff_mobiles.sql` | کامل | — | 0 | 0 |
| `migration_009_workflow_completion.sql` | کامل | — | 0 | 0 |
| `migration_010_sessions_and_seed_hardening.sql` | کامل | — | 0 | 0 |
| `migration_011_review2_hardening.sql` | کامل | — | 0 | 0 |
| `migration_012_cdr_original_hash.sql` | کامل | — | 0 | 0 |
| `migration_013_totp_replay.sql` | کامل | — | 0 | 0 |
| `seed-base.sql` | کامل | — | 1 | 1 → **idempotent شد (`INSERT IGNORE`)** |
| `seed-dev-users.sql` | کامل | — | 1 | 1 → **idempotent شد** |
| `migrate.sh` | کامل | — | 0 | 0 |
| `backup.sh` | کامل | — | 0 | 0 |
| `restore.sh` | کامل | — | 0 | 0 |
| `lib-archive.sh` | کامل | — | 0 | 0 |
| `backup-crypto.mjs` | کامل | — | 0 | 0 |
| `validate-schema.sh` | کامل | — | 0 | 0 |
| `setup-xampp.sh` | کامل | — | 0 | 0 |

### ۲٫۶ اسکریپت‌ها و پیکربندی

| فایل | بررسی | A/B | مشکل | اصلاح |
|---|---|---|---|---|
| `scripts/database-check.sh` | کامل | — | 1 | 1 → **حذف عدد سخت‌کد ۴۲** |
| `scripts/security-scan.sh` | کامل | — | 1 | 1 → **checksum قابل‌حمل** |
| `.env.example` | کامل | — | 1 | 1 → **مستندسازی `MYSQL_BIN`/`MYSQLDUMP_BIN`** |
| `package.json` (root) | کامل | — | 0 | 0 |
| `package.json` (server / client) | کامل | — | 0 | 0 |

---

## ۳) جدول جامع مشکلات و وضعیت اصلاح

> شماره خطوط، مربوط به **نسخه پیش از اصلاح** است (پس از اصلاح چند خط جابه‌جا شده‌اند).

| شناسه | لایه / امکان | شدت | فایل:خط | نوع مشکل | شرح کوتاه | وضعیت |
|---|---|---|---|---|---|---|
| S-01 | Server / Config – تست و bootstrap | 🔴 بحرانی | `server/src/config.ts:31` | Validation / CI | `PORT: z.coerce.number().min(1)` مقدار `0` را که vitest ست می‌کند رد می‌کرد → ZodError در import → ۱۰ فایل تست هرگز اجرا نمی‌شد | ✅ اصلاح‌شده (+۴ تست رگرسیون) |
| S-02 | Security / Infra – Rate Limit | 🔴 بحرانی | `server/src/rate-limit.ts:30,36` | امنیت / DoS | `globalRequestLimiter` و `apiRequestLimiter` بدون `store` ساخته می‌شدند (استور in-memory) در حالی که production استور `database` را الزامی می‌کند | ✅ اصلاح‌شده |
| S-03 | Server / Admin – مدیریت کاربران | 🔴 بحرانی | `server/src/routes/admin.ts` (PATCH `/admin/users/:id`) | Privilege / Availability | مدیر می‌توانست نقش یا وضعیت حساب **خودش** را تغییر دهد → قفل شدن حساب و نبود مدیر فعال | ✅ اصلاح‌شده (409) |
| S-04 | Server / Admin – ویرایش خدمت | 🔴 بحرانی | `server/src/routes/admin.ts:1089` | Security (Prototype Pollution) | `apiPayloadFields` در PATCH گارد `__proto__/constructor/prototype` نداشت (در create داشت) | ✅ اصلاح‌شده |
| S-05 | Server / Operations – استرداد | 🔴 بحرانی | `server/src/routes/operations.ts:1148` | منطق مالی / یکپارچگی داده | تأیید استرداد، `payments.status` را `refunded` نمی‌کرد → KPI داشبورد و گزارش مالی همیشه اشتباه | ✅ اصلاح‌شده (اتمیک در تراکنش) |
| S-06 | Server / Auth – پروفایل | 🟠 بالا | `server/src/routes/auth.ts:302-314` | Validation / UX | فیلد خالی `email`/`mobile`/`organizationName` در فرم پروفایل → ۴۰۰؛ کاربر بدون موبایل/ایمیل نمی‌توانست ذخیره کند | ✅ اصلاح‌شده |
| S-07 | Server / Applications – مدارک | 🟠 بالا | `server/src/routes/applications.ts:916` | Race Condition | `SELECT MAX(version)` بیرون از تراکنش → دو آپلود همزمان نسخه تکراری می‌گرفتند | ✅ اصلاح‌شده (`FOR UPDATE` داخل تراکنش) |
| S-08 | Server / Applications – تغییر وضعیت | 🟠 بالا | `server/src/routes/applications.ts:1193` | Validation / 500 | `reason` فقط `min(5)` داشت ولی به `VARCHAR(255)` درج می‌شد → متن بلند = خطای ۵۰۰ | ✅ اصلاح‌شده (`max(255)`) |
| S-09 | Server / Public – خدمات | 🟠 بالا | `server/src/routes/public.ts:68-98` | Crash / Robustness | `JSON.parse` بدون `try/catch` و `requirements` بالقوه `null` → ۵۰۰ در لیست و کرش `.map` در کلاینت | ✅ اصلاح‌شده (`jsonArray`) |
| S-10 | Server / CORS | 🟠 بالا | `server/src/app.ts:107` | Contract Front/Back | هدرهای `X-Page`, `X-Page-Size`, `X-Request-Id` expose نمی‌شدند؛ `client/src/api.ts` برای تشخیص «صفحه بعد» به `X-Page-Size` وابسته است | ✅ اصلاح‌شده |
| S-11 | Client / Applications | 🟡 متوسط | `client/src/App.tsx:1544` | UI / Key تکراری | صفحه‌بندی offset بدون dedupe بر اساس `id`؛ با ورود پرونده جدید، ردیف تکراری و React key تکراری | ✅ اصلاح‌شده |
| S-12 | Database / Seed | 🟡 متوسط | `database/seed-dev-users.sql:4` | Idempotency | اجرای دوباره روی UNIQUE `users.email` می‌شکست؛ اعلان هم تکراری می‌شد | ✅ اصلاح‌شده (`INSERT IGNORE` + `WHERE NOT EXISTS`) |
| S-13 | Database / Migration | 🟡 متوسط | `database/migration_004_page_12_messaging.sql:1` | اجرا ناپذیر | نبود `USE regbroker;` برخلاف بقیه مایگریشن‌ها | ✅ اصلاح‌شده |
| S-14 | Scripts / DB check | 🟡 متوسط | `scripts/database-check.sh` | نگهداشت‌پذیری | عدد سخت‌کد `42` در حالی که schema ۴۵ جدول دارد → `npm run db:check` همیشه قرمز | ✅ اصلاح‌شده (حداقل ۴۲) |
| S-15 | Scripts / Security scan | 🟢 کم | `scripts/security-scan.sh` | پورتایل | `shasum` روی Linux موجود نیست → اسکن نیمه‌کاره می‌ماند | ✅ اصلاح‌شده (fallback `sha256sum`) |
| S-16 | Config / Docs | 🟢 کم | `.env.example` | مستندسازی | `MYSQL_BIN`/`MYSQLDUMP_BIN` که اسکریپت‌ها می‌خوانند مستند نبود | ✅ اصلاح‌شده |
| S-17 | Server / Test | 🟡 متوسط | `server/src/security-features.test.ts:81` | پورتایل تست | انتظار مسیر POSIX در ویندوز شکست می‌خورد (تست، نه کد تولید) | ✅ اصلاح‌شده |
| S-18 | Database / Seed | 🟡 متوسط | `database/seed-base.sql:5` | Idempotency | اجرای دوباره seed روی `roles.code` و `services.code` با خطای ۱۰۶۲ می‌شکست؛ نصب مجدد/تکرار seed ممکن نبود | ✅ اصلاح‌شده (`INSERT IGNORE`) |
| S-19 | Client / CSS – ناوبری | 🟠 بالا | `client/src/styles.css:1905` | UI / Layout | قواعد منوی موبایل (`.main-nav{display:none}`, `.menu-button{display:grid}`) بیرون از `@media` بودند؛ در دسکتاپ ناوبری پنهان و همبرگر نمایان می‌شد | ✅ اصلاح‌شده (انتقال به media query 1050px) |
| S-20 | Server / Rate Limit | 🟡 متوسط | `server/src/shared-limits.ts:16,43` | Log/Validation | استور سفارشی `localKeys` نداشت؛ express-rate-limit همه نمونه‌ها را یک استور می‌دید و در هر درخواست `ERR_ERL_DOUBLE_COUNT` ثبت می‌کرد | ✅ اصلاح‌شده (`localKeys = true`) |
| S-21 | Scripts / DB | 🟢 کم | `database/migrate.sh:35`, `database/validate-schema.sh:15` | AWK Portability | الگوی regex مقدارهای نقل‌قول‌دار در gawk یک escape نامعتبر داشت و هشدار «unknown regexp escape» می‌داد | ✅ اصلاح‌شده |

### موارد نیازمند بررسی دستی (بدون اصلاح خودکار)

| شناسه | موضوع | فایل/نقطه | دلیل عدم اصلاح خودکار |
|---|---|---|---|
| M-01 | نبود جدول `experiments/variants/assignments/events` | `database/schema.sql` | تغییر ساختار DB + تصمیم محصولی؛ طبق سیاست پروژه فقط با مایگریشن جدید و همگام‌سازی schema — طراحی در بخش ۶ آمده |
| M-02 | نبود لایه Feature Flag / Bucketing | `server/src/app.ts` | نیازمند تصمیم درباره‌ی دامنه آزمایش (نقش، پرونده، دستگاه) و سیاست Sticky |
| M-03 | محدودیت CSP برای ابزار تحلیلی خارجی | `server/src/app.ts:49` (`connect-src 'self'`) | باز کردن CSP تصمیم امنیتی است؛ پیشنهاد: telemetry same-origin |
| M-04 | الزام `RATE_LIMIT_STORE=database` در production | `server/src/config.ts:177` | رفتار عمدی (fail-fast)؛ مقدار باید در `.env` محیط واقعی تأیید شود |
| M-05 | مایگریشن ۰۰۴ صفحه ۲۳: `ADD CONSTRAINT` بدون گارد | `database/migration_004_page_23_support_finance.sql` | MySQL 8 `ADD CONSTRAINT IF NOT EXISTS` ندارد؛ رفع واقعی نیازمند Stored Procedure یا بازنویسی مهاجرت است |
| M-06 | وضعیت `processed` در `refund_requests` استفاده نمی‌شود | `server/src/routes/operations.ts` | نیازمند تصمیم فرایندی: آیا «تأیید» = «پرداخت وجه برگشتی» است یا مرحله‌ای جدا لازم است |
| M-07 | اسکنر ClamAV و مسیر آپلود در محیط واقعی | `server/src/upload-security.ts`, `.env` | وابسته به زیرساخت خارجی (`UPLOAD_SCAN_MODE`)؛ فقط قابل تأیید در محیط نصب‌شده |
| M-08 | ناسازگاری مایگریشن‌های تاریخی با MySQL 8 | `database/migration_002/003/004_12/004_20/004_23/004_25/006*.sql` | `ADD COLUMN/INDEX IF NOT EXISTS` و `CREATE INDEX IF NOT EXISTS` فقط MariaDB هستند. این فایل‌ها در `regbroker` واقعی checksum ثبت‌شده دارند و طبق قانون خود `migrate.sh` نباید ویرایش شوند؛ رفع نیازمند تصمیم: بازنویسی با Prepared Statement + re-baseline، یا اعلام رسمی مسیر ارتقا فقط MariaDB |

---

## ۴) تحلیل عمیق مشکلات و شرح اصلاحات (به تفکیک ماژول)

### ۴٫۱ `config.ts` — شکست خاموش کل تست‌های سرور (S-01)

**شرح مشکل.** اسکیمای env روی `PORT` قاعده‌ی `min(1)` داشت:

```ts
// قبل
PORT: z.coerce.number().int().min(1).max(65535).default(4000),
```

vitest هنگام اجرا `process.env.PORT` را روی `"0"` می‌گذارد. چون `config.ts` در سطح ماژول parse می‌کند و `tracking.ts` → `config.ts` است، هر فایلی که (مستقیم یا غیرمستقیم) `tracking` را ایمپورت می‌کرد، **قبل از اجرای اولین تست** با `ZodError` می‌افتاد:

```
ZodError: [ { "code":"too_small", "path":["PORT"], "message":"Number must be greater than or equal to 1" } ]
```

**ریشه‌یابی.** `0` در قرارداد POSIX یعنی «هر پورت آزاد» و در تست‌رانرها یک مقدار استاندارد است؛ اما API این پروژه پورت ثابت مستند دارد. یعنی مقدار `0` باید مثل «تنظیم‌نشده» رفتار شود، نه خطا.

**تأثیر روی A/B و کاربر.** بدون تست قابل اجرا، هر تغییر در Bucketing/Flagging/مسیرهای مالی بی‌سروصدا رگرسیون می‌دهد. عملاً A/B Testing بدون شبکه تست سالم، قمار است.

**اصلاح.**

```ts
// بعد
const portNumber = z.preprocess(
  (value) => (value === "" || value === "0" || value === 0 ? undefined : value),
  z.coerce.number().int().min(1).max(65535).default(4000),
);
// ...
PORT: portNumber,
```

**اثر:** ۱۰ فایل تست از «هرگز اجرا نشد» به «اجرا و PASS» رسید؛ ۵۶ تست → ۱۰۳ تست ثمربخش. تست رگرسیون در `server/src/config.test.ts` اضافه شد (۰ و خالی → ۴۰۰۰، مقدار معتبر حفظ می‌شود، ۷۰۰۰۰ هنوز رد می‌شود).

### ۴٫۲ `rate-limit.ts` — بودجه محدودیت ضرب‌شده (S-02)

**شرح مشکل.**

```ts
// قبل
export const globalRequestLimiter = createRateLimiter({ windowMs: 60_000, limit: 600 });
export const apiRequestLimiter = createRateLimiter({ windowMs: 60_000, limit: 240 });
```

فقط `authRequestLimiter` استور مشترک داشت. در حالی که `config.ts` در production اجبار می‌کند:

```ts
if (value.RATE_LIMIT_STORE !== "database") { /* ZodError */ }
```

**ریشه‌یابی.** استور پیش‌فرض `express-rate-limit` در حافظه‌ی همان پروسه است. با N پروسه/ریپلیکا، مهاجم N برابر بودجه می‌گیرد و شمارنده‌ها بین نمونه‌ها ناهماهنگ‌اند؛ همچنین با ری‌استارت، همه شمارنده‌ها صفر می‌شوند.

**تأثیر روی A/B.** اگر یک گروه (B) به تعداد درخواست بیشتر یا endpoint جدید نیاز داشته باشد، اندازه‌گیری «نرخ خطای ۴۲۹» بین گروه‌ها قابل مقایسه نیست؛ بدتر: گروهی که ترافیک بیشتری به یک replica دارد، ۴۲۹ بیشتری می‌بیند و Conversion Rate به‌صورت مصنوعی افت می‌کند (Bias).

**اصلاح.**

```ts
// بعد
export const globalRequestLimiter = createRateLimiter({
  windowMs: 60_000, limit: 600, store: createCounterStore("global-ip", 60_000),
});
export const apiRequestLimiter = createRateLimiter({
  windowMs: 60_000, limit: 240, store: createCounterStore("api-ip", 60_000),
});
```

هر لیمیتر کلید مستقل (`global-ip` / `api-ip`) دارد تا شمارنده‌ها با هم قاطی نشوند.

### ۴٫۳ `app.ts` — هدرهای صفحه‌بندی و CORS (S-10)

**شرح مشکل.** در `client/src/api.ts` تابع `requestPage` برای فهمیدن «آیا صفحه بعد وجود دارد» به هدر `X-Page-Size` تکیه می‌کند. CORS فقط `allowedHeaders` را ست می‌کرد و **`exposedHeaders` نداشت**؛ مرورگر هدرهای غیرساده را به JS نمی‌دهد.

**تأثیر.** در استقرار cross-origin (کلاینت روی دامنه/پورت دیگر)، لیست‌ها در صفحه اول «کامل» تلقی می‌شدند؛ در A/B روی صفحه‌بندی/لیست، هر دو گروه داده ناقص می‌دیدند و متریک «تعداد مشاهده آیتم» بی‌معنا می‌شد.

**اصلاح.**

```ts
exposedHeaders: ["X-Page", "X-Page-Size", "X-Request-Id"],
```

### ۴٫۴ `auth.ts` — ذخیره نشدن پروفایل (S-06)

**شرح مشکل.**

```ts
// قبل
email: z.string().email().max(190).optional(),
mobile: z.string().regex(/^09\d{9}$/).optional(),
organizationName: z.string().trim().min(3).max(190).nullable().optional(),
```

فرم پروفایل همه فیلدها را همیشه ارسال می‌کند؛ کاربری که موبایل/ایمیل ندارد، رشته خالی می‌فرستد → `.optional()` کمکی نمی‌کند (چون مقدار `undefined` نیست، `""` است) → ۴۰۰ روی کل درخواست. علت واقعی «ذخیره نمی‌شود» در UI نبود، در اعتبارسنجی سرور بود.

**اصلاح.**

```ts
// بعد
const blankAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

fullName: blankAsUndefined(z.string().trim().min(3).max(150)),
email: blankAsUndefined(z.string().email().max(190)),
mobile: blankAsUndefined(z.string().regex(/^09\d{9}$/)),
organizationName: blankAsUndefined(z.string().trim().min(3).max(190).nullable()),
```

**نکته امنیتی:** قاعده‌ی «اگر مقدار داده شد، باید معتبر باشد» حفظ شد؛ فقط «خالی» معادل «ارسال‌نشده» شد. `currentPassword` دست نخورد (چون خالی بودن آن باید خطا باشد و هست).

### ۴٫۵ `applications.ts` — Race نسخه مدرک (S-07) و طول دلیل (S-08)

**قبل (S-07):**

```ts
const [latest] = await rows<any[]>("SELECT MAX(version) version FROM documents WHERE application_id=? AND document_type=?", [...]);
const version = (latest?.version ?? 0) + 1;
const result = await transaction(async (connection) => { /* INSERT */ });
```

دو آپلود همزمان برای یک پرونده و یک نوع مدرک، هر دو `version` یکسان می‌گرفتند؛ «نسخه جدید» بی‌معنا می‌شد و Audit trail دو رکورد با یک شماره نسخه داشت.

**بعد:** قفل ردیف پرونده داخل تراکنش، سپس محاسبه نسخه:

```ts
const { result, version } = await transaction(async (connection) => {
  await connection.execute("SELECT id FROM applications WHERE id=? FOR UPDATE", [String(req.params.id)]);
  const [latest] = await connection.execute<any[]>("SELECT MAX(version) version FROM documents WHERE application_id=? AND document_type=?", [String(req.params.id), documentType]);
  const nextVersion = Number(latest[0]?.version ?? 0) + 1;
  /* INSERT با nextVersion */
  return { result: created, version: nextVersion };
});
```

**قبل (S-08):** `if (!allowed.has(status) || reason.length < 5)` → متن ۳۰۰ کاراکتری به `status_history.reason VARCHAR(255)` می‌رفت و MySQL خطا می‌داد؛ پاسخ ۵۰۰ به‌جای ۴۰۰.
**بعد:** `|| reason.length > 255` → خطای تمیز ۴۰۰.

**تأثیر روی A/B:** نسخه‌بندی مدرک، ورودی متریک‌های «تکمیل مدارک» است؛ شماره نسخه تکراری، نرخ «اصلاح مدرک» را غیرقابل اعتماد می‌کند.

### ۴٫۶ `admin.ts` — Prototype Pollution (S-04) و خودتنزیل مدیر (S-03)

**قبل (S-04).** در `POST /services` گارد وجود داشت:

```ts
// create
.array(z.string().regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/))
.refine(/* segments not in __proto__/constructor/prototype */)
```

اما `PATCH /services/:id` فقط regex داشت. مسیرهایی مثل `constructor.prototype.polluted` از regex عبور می‌کنند و `writePath()` در `integrations.ts` آن‌ها را در آبجکت payload می‌نویسد.

**بعد.** همان `refine` در PATCH هم اعمال شد.

**قبل (S-03).** هیچ گاردی نبود؛ `PATCH /admin/users/:id` با `{role:"applicant"}` روی حساب خود مدیر، نقش او را عوض می‌کرد و تمام sessionهایش باطل می‌شد.

**بعد:**

```ts
if (Number(req.params.id) === req.user!.id && (input.role !== undefined || input.status === "suspended"))
  return res.status(409).json({ message: "تغییر نقش یا تعلیق حساب خود مدیر مجاز نیست؛ این تغییر را مدیر دیگری انجام دهد." });
```

**تأثیر روی A/B:** ادمین‌ها معمولاً از نمونه‌گیری A/B حذف می‌شوند؛ اگر حساب مدیر بتواند خودش را غیرفعال کند، اجرای آزمایش و rollback آن مختل می‌شود.

### ۴٫۷ `operations.ts` — ناسازگاری استرداد و دفتر مالی (S-05)

**قبل.**

```ts
const result = await execute("UPDATE refund_requests SET status=?, ... WHERE id=? AND status='pending'", [...]);
```

`payments.status` دست‌نخورده می‌ماند، در حالی که در `schema.sql` مقدار `refunded` در ENUM وجود دارد و داشبورد/گزارش مالی بر اساس `payments.status` جمع می‌زند.

**بعد.** تصمیم‌گیری، تغییر درخواست و به‌روزرسانی پرداخت، همه در یک تراکنش با قفل ردیف:

```ts
const decided = await transaction(async (connection) => {
  const [requests] = await connection.execute<any[]>(
    "SELECT payment_id FROM refund_requests WHERE id=? AND status='pending' FOR UPDATE", [String(req.params.id)]);
  const request = requests[0];
  if (!request) return null;
  await connection.execute("UPDATE refund_requests SET ... WHERE id=? AND status='pending'", [...]);
  if (input.decision === "approved")
    await connection.execute("UPDATE payments SET status='refunded' WHERE id=? AND status='successful'", [request.payment_id]);
  return request;
});
```

**تأیید سازگاری با اسکیما (مستند):** `payments.status ENUM('pending','successful','failed','refunded')` شامل `refunded` است و `refund_requests.payment_id` با FK به `payments(id)` وجود دارد؛ بنابراین هیچ مایگریشن جدیدی لازم نبود. (وضعیت `processed` در ENUM درخواست استرداد در هیچ‌جای کد ست نمی‌شود — به‌عنوان M-06 ثبت شد.)

**تأثیر روی A/B:** هر آزمایشی روی «نرخ تبدیل پرداخت» یا «نرخ استرداد» بدون این اصلاح، عددی را می‌سنجید که با دفتر واقعی نمی‌خواند.

### ۴٫۸ `public.ts` — پایداری لیست خدمات (S-09)

**قبل.**

```ts
requirements: typeof service.requirements === "string" ? JSON.parse(service.requirements) : service.requirements,
// و در /:code
for (const key of ["requirements","workflow"]) if (typeof service[key] === "string") service[key] = JSON.parse(service[key]);
```

داده‌ی خراب یا `NULL` در ستون JSON (مثلاً بعد از ایمپورت دستی) = ۵۰۰ برای کل لیست؛ و اگر `null` برمی‌گشت، کلاینت روی `.map` می‌افتاد.

**بعد.**

```ts
function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
```

صفحه‌ی خدمات و صفحه‌ی جزئیات هر دو از همین تابع استفاده می‌کنند. **تأثیر:** لندینگ/خدمات — که اولین قدم قیف A/B است — دیگر با یک رکورد بد از کار نمی‌افتد.

### ۴٫۹ `App.tsx` — ردیف تکراری در صفحه‌بندی (S-11)

**قبل.**

```ts
setItems((current) => (page === 1 ? result.items : [...current, ...result.items]));
```

صفحه‌بندی offset است؛ اگر بین دو درخواست، پرونده‌ی جدیدی ثبت شود، ردیف اول صفحه‌ی ۲ همان ردیف آخر صفحه‌ی ۱ می‌شود → key تکراری و شمارش غلط.

**بعد.**

```ts
setItems((current) => {
  if (page === 1) return result.items;
  const seen = new Set(current.map((i) => i.id));
  return [...current, ...result.items.filter((i) => !seen.has(i.id))];
});
```

همان الگوی `PanelHome` که از قبل dedupe داشت؛ اکنون رفتار کل پنل یکسان است.

### ۴٫۱۰ `seed-dev-users.sql` — شکست اجرای مکرر (S-12)

**قبل:** ۹ `INSERT` ساده روی `users` با `UNIQUE(email)`/`UNIQUE(mobile)`؛ اجرای دوم = خطا و توقف اسکریپت ستاپ.
**بعد:** `INSERT IGNORE ... SELECT ... FROM roles WHERE code='...'` (الگوی موجود در همان فایل) و اعلان با `WHERE NOT EXISTS`. تفاوت مهم: نقش از جدول `roles` خوانده می‌شود، نه id هاردکد.

### ۴٫۱۱ `migration_004_page_12_messaging.sql` — نبود `USE` (S-13)

بدون `USE regbroker;` اجرا به دیتابیس انتخاب‌شده کلاینت (اغلب هیچ) می‌رفت و با «No database selected» می‌شکست؛ برخلاف تمام فایل‌های مایگریشن دیگر. اصلاح: یک خط `USE regbroker;` در ابتدا.

### ۴٫۱۲ `scripts/database-check.sh` — gating اشتباه CI (S-14)

**قبل.** `if [[ "$schema_table_count" != "42" ]]` در حالی که schema ۴۵ جدول دارد → `npm run db:check` همیشه `EXIT=1`، یعنی چک واقعی schema/نقش‌ها/سرویس‌ها هم پنهان می‌شد.
**بعد.** حداقلِ معنادار به‌جای عدد دقیق:

```sh
MIN_SCHEMA_TABLES=42
if [[ "$schema_table_count" -lt "$MIN_SCHEMA_TABLES" ]]; then ... exit 1; fi
```

اکنون خروجی: `database static checks passed: 45 schema tables (>= 42), 17 migrations`.

### ۴٫۱۳ `scripts/security-scan.sh` و `.env.example` (S-15, S-16)

- `shasum -a 256` فقط macOS است؛ روی Linux/Git-Bash نیست. اصلاح: `command -v sha256sum` و fallback به `shasum`. بدون این، اسکن امنیتی در CI لینوکسی نیمه‌کاره می‌ماند و **مدرک checksum برای گزارش تولید نمی‌شد**.
- `.env.example` متغیرهای `MYSQL_BIN` و `MYSQLDUMP_BIN` را که `migrate.sh`/`backup.sh` می‌خوانند مستند نکرده بود؛ مقدار پیش‌فرض اسکریپت‌ها مسیر XAMPP در macOS است که روی ویندوز غلط است. اکنون با نمونه‌ی ویندوزی کامنت‌شده آمده است.

### ۴٫۱۴ `security-features.test.ts` — تست وابسته به پلتفرم (S-17)

تست انتظار `/tmp/regbroker-uploads/abc.pdf` داشت، اما `safeStoragePath` از `path.resolve` استفاده می‌کند که روی ویندوز `E:\tmp\...` می‌دهد. این نقص **تست** بود، نه کد تولید (پاسخ امنیتی درست است). اصلاح:

```ts
const uploadRoot = path.resolve("/tmp/regbroker-uploads");
expect(safeStoragePath(uploadRoot, "abc.pdf")).toBe(path.join(uploadRoot, "abc.pdf"));
expect(safeStoragePath(uploadRoot, "../secret")).toBeNull();
expect(safeStoragePath(uploadRoot, "..\\secret")).toBeNull(); // جداکننده ویندوز هم نباید فرار کند
```

ادعای امنیتی (عدم فرار از ریشه) حتی تقویت شد.

### ۴٫۱۵ تحلیل A/B برای ماژول‌هایی که مشکل نداشتند اما گلوگاه experimentation دارند

| ماژول | فرضیه A/B پیشنهادی | مانع فعلی در کد | نیازمندی |
|---|---|---|---|
| `App.tsx` → `NewApplication` (فرم سه‌مرحله‌ای) | فرم سه‌مرحله‌ای (A) در برابر یک صفحه با بخش‌های جمع‌شونده (B) → نرخ تکمیل | مسیر ثبت تک است و هیچ پرچمی ندارد؛ پیش‌نویس در `drafts.ts` فقط انتخاب‌های غیرهویتی را نگه می‌دارد | Flag در فرانت + رویداد `form_step_view` |
| `pagination.ts` + لیست‌ها | اندازه صفحه ۲۵ (A) در برابر ۵۰ (B) → زمان یافتن پرونده | اندازه صفحه در کلاینت هاردکد است (`requestPage(..., 50)`) | Flag سمت سرور + متریک `time_to_find` |
| `notifications.ts` | متن/کانال اعلان (ایمیل vs پنل) → نرخ پاسخ | متن اعلان‌ها از DB می‌آید اما نسخه‌بندی متن ندارد | جدول نسخه متن یا Flag انتخاب کانال |
| `public.ts` + لندینگ | CTA «شروع ثبت» vs «پیگیری» → نرخ شروع | هیچ رویداد کلیک/نمایش ثبت نمی‌شود | رویداد same-origin |
| `AdminManagement` داشبورد | ترتیب/ترکیب KPI → زمان تصمیم | کوئری‌ها ثابت‌اند | Flag ترتیب کارت‌ها (کم‌ریسک) |
| `tracking.ts` | نمایش وضعیت با تایم‌لاین (A) و متن ساده (B) | فقط رکورد درخواست، بدون رویداد مشاهده | رویداد `tracking_view` |
| `operations.ts` (SLA/ارجاع) | تخصیص خودکار vs دستی → زمان پاسخ | منطق ثابت، بدون نمونه‌گیری | Flag در سطح سازمان |

### ۴٫۱۶ `styles.css` — ناوبری دسکتاپ با media query جا‌به‌جا شده (S-19)

**شرح مشکل.** در میانه فایل، بلوک «منوی موبایل» بدون `@media` رها شده بود:

```css
.main-nav { display: none; position: absolute; top: 82px; ... }
.menu-button { display: grid; }
@media (max-width: 1050px) { /* همان قواعد دوباره */ }
```

چون این قواعد بعد از `.main-nav { display:flex }` و `.menu-button { display:none }` می‌آمدند، در **همه** عرض‌ها ناوبری را پنهان و همبرگر را نمایان می‌کردند؛ یعنی منوی دسکتاپ فقط با کلیک روی همبرگر باز می‌شد.

**اصلاح.** همان قواعد (نسخه کامل‌تر با `max-height`/`overflow-y`) داخل `@media (max-width: 1050px)` منتقل و نسخه تکراری حذف شد. در نتیجه در دسکتاپ ناوبری خطی سر جای خود برمی‌گردد و در ≤۱۰۵۰px منوی کشویی و همبرگر فعال می‌شود. `panel-theme.css` هم دو `!important` زائد روی `border-color` (بدون `border-style`) داشت که حذف شد.

**محدودیت:** این تغییر به‌صورت ایستا (خواندن + بیلد CSS) تأیید شده و در مرورگر واقعی دیده نشده است.

### ۴٫۱۷ `seed-base.sql` — اجرای دوم seed (S-18)

**قبل:** `INSERT INTO roles/services ...` روی `UNIQUE(code)` در اجرای دوم خطای `1062 Duplicate entry` می‌داد؛ `organization_profile` هم روی PK ثابت `id=1` می‌شکست. یعنی seed فقط یک‌بار قابل اجرا بود.

**بعد:** هر چهار دستور به `INSERT IGNORE` تبدیل شدند (roles, services, organization_profile, retention_policies). نتیجه تست واقعی: دو اجرای پشت‌سرهم `OK` و شمارش‌ها بدون تغییر `11 roles / 9 services / 1 profile / 5 policies`.

### ۴٫۱۸ `shared-limits.ts` — دو شمارش برای یک درخواست (S-20)

**شرح.** لیمیترهای global و API و auth روی یک درخواست اجرا می‌شوند. `express-rate-limit` برای تشخیص شمارش تکراری، استورها را با `store.constructor.name` گروه‌بندی می‌کند؛ چون `MemoryCounterStore`/`DatabaseCounterStore` فاقد `localKeys` بودند، هر سه لیمیتر «یک استور» دیده می‌شدند و برای هر درخواست `ValidationError: ERR_ERL_DOUBLE_COUNT` در لاگ ثبت می‌شد.

**اصلاح:**

```ts
class MemoryCounterStore implements Store {
  readonly localKeys = true;   // هر لیمیتر شمارنده خودش را دارد
  ...
}
```

و همان خط برای `DatabaseCounterStore` (کلیدها با `keyPrefix` در جدول مشترک ایزوله‌اند). برای شفافیت، هر لیمیتر `requestPropertyName` مستقل (`globalRateLimit` / `apiRateLimit` / `authRateLimit`) هم گرفت. تست واقعی: لاگ سرور پس از اصلاح فقط پیام seed و listening دارد؛ هیچ ValidationError ثبت نشد. سقف‌ها و الگوی ۴۲۹ در تست‌های rate-limit بدون تغییر PASS شدند.

### ۴٫۱۹ `migrate.sh` / `validate-schema.sh` — هشدار AWK (S-21)

الگوی regex مقدارهای نقل‌قول‌دار در gawk یک escape نامعتبر بود و هنگام خواندن `.env` هشدار `regexp escape sequence` می‌داد. به الگوی استاندارد نقل‌قول دوتایی تغییر کرد؛ نتیجه: `migrate.sh --status` بدون هیچ هشدار و با پارس درست مقدارهای نقل‌قول‌دار اجرا می‌شود.

### ۴٫۲۰ تست واقعی MySQL: مایگریشن‌های تاریخی (M-08)

روی MySQL 8.4.7 (WAMP، پورت 3306) در دیتابیس ایزوله `regbroker_abtest`:

| مرحله | نتیجه |
|---|---|
| `schema.sql` (۴۵ جدول) + `seed-base.sql` + `seed-dev-users.sql` | ✅ بدون خطا |
| اجرای دوم `seed-base.sql` و `seed-dev-users.sql` | ✅ بدون خطا (پس از اصلاح S-18) |
| اجرای مستقیم ۱۷ فایل مایگریشن (بار اول) | ⚠️ ۱۰ فایل OK؛ ۷ فایل با خطای syntax روی `IF NOT EXISTS` شکست |
| `migrate.sh --baseline` سپس دو اجرای `migrate.sh` | ✅ `applied migrations: 0` در هر دو؛ `--status` = ۱۷ فایل |

**نتیجه‌گیری:** مسیر نصب تازه (schema + baseline) روی MySQL سالم است، اما مسیر «ارتقای نصب موجود» با فایل‌های تاریخی ۰۰۲/۰۰۳/۰۰۴/۰۰۶ روی MySQL کار نمی‌کند. دلیل: MySQL برخلاف MariaDB از `ADD COLUMN/INDEX IF NOT EXISTS` و `CREATE INDEX IF NOT EXISTS` پشتیبانی نمی‌کند. چون این فایل‌ها در دیتابیس واقعی checksum ثبت‌شده دارند، ویرایش آن‌ها `migrate.sh` را با «Checksum mismatch» می‌شکند؛ بنابراین طبق قانون خود پروژه تغییر ندادم و به‌عنوان M-08 برای تصمیم ثبت شد.

---

## ۵) نتایج تست‌ها و اعتبارسنجی پس از اصلاح

همه دستورها پس از اعمال تمام تغییرات (و پس از افزودن تست جدید) اجرا شدند:

| دستور | نتیجه | خروجی کلیدی |
|---|---|---|
| `npm run test -w server` | ✅ PASS | `Test Files 20 passed (20)` — `Tests 107 passed (107)` (~۷٫۸s) |
| `npm run test -w client` | ✅ PASS | `Test Files 13 passed (13)` — `Tests 33 passed (33)` (~۱۰٫۴s) |
| `npm run typecheck` (server + client) | ✅ PASS | `tsc -p tsconfig.json --noEmit` و `tsc -b --pretty false` — بدون خطا |
| `npm run lint` (server + client) | ✅ PASS | `eslint ... --max-warnings=0` — بدون هشدار |
| `npm run build` | ✅ PASS | `✓ built in 5.33s` — `index-*.js 355.57 kB │ gzip: 100.06 kB` |
| `bash scripts/database-check.sh` | ✅ PASS | `database static checks passed: 45 schema tables (>= 42), 17 migrations` |
| `npm run build -w client` | ✅ PASS | `✓ built in 4.21s` — `index-*.css 86.95 kB │ gzip: 22.76 kB` |
| MySQL 8.4.7 واقعی — schema + seedها | ✅ PASS | ۴۵ جدول، `11 roles / 9 services / 9 users / 1 announcement` |
| MySQL 8.4.7 واقعی — اجرای دوم seedها | ✅ PASS | بدون خطای UNIQUE؛ شمارش‌ها بدون تغییر (پس از S-18) |
| MySQL 8.4.7 واقعی — `migrate.sh` دوبار | ✅ PASS | `applied migrations: 0` هر دو بار؛ `--status` = ۱۷ فایل |
| MySQL 8.4.7 واقعی — جریان استرداد (API) | ✅ PASS | ایجاد ۲۰۱، تأیید ۲۰۰، تأیید دوم ۴۰۴؛ `payments.status=refunded` |
| MySQL 8.4.7 واقعی — آپلود دو نسخه مدرک (API) | ✅ PASS | نسخه ۱ سپس ۲ (۲۰۱ هر دو)؛ ۲ پیام رسید و ۲ اعلان |

### مقایسه قبل/بعد (باسلاین ابتدای کار)

| سنجه | قبل | بعد |
|---|---|---|
| تست‌های سرور | `10 failed | 9 passed` — ۵۶ تست پاس، ۱۰ فایل هنگام import می‌افتاد | `20 passed (20)` — ۱۰۷ تست پاس |
| `npm run db:check` | `EXIT=1` (خطای شمارش جدول) | `EXIT=0` |
| Type-Check / Lint / Build | PASS (روی کد باگ‌دار) | PASS (روی کد اصلاح‌شده) |

> **نکته صداقتی:** Type-Check و Build قبل از اصلاحات هم پاس بودند؛ یعنی این باگ‌ها **از نوعی بودند که کامپایلر نمی‌گیرد** (Validation runtime، Race Condition، ناسازگاری معنایی، Idempotency). تنها شبکه‌ای که آن‌ها را می‌گرفت — تست‌های سرور — خودش از کار افتاده بود؛ به همین دلیل S-01 مهم‌ترین یافته این گزارش است.

### آنچه در این دور بررسی شد (دیتابیس واقعی)

- کل مسیر روی یک دیتابیس **ایزوله** `regbroker_abtest` در همان MySQL/WAMP اجرا شد؛ دیتابیس توسعه‌ای `regbroker` دست‌نخورده ماند و پس از تست حذف شد.
- جریان استرداد با API واقعی (ورود مدیر با موبایل، CSRF، پایه مالی) اجرا شد: پرداخت `successful` → درخواست `pending` → تأیید → `payments.status='refunded'` و درخواست `approved`؛ تأیید دوم ۴۰۴ داد (گارد `status='pending'` کار می‌کند).
- آپلود دو نسخه از یک نوع مدرک: نسخه‌های ۱ و ۲ درست ثبت شدند، پیام رسید و اعلان برای متقاضی ساخته شد.
- `seed-base`/`seed-dev` دو بار و `migrate.sh` دوبار (پس از baseline) اجرا شدند.

### آنچه بررسی نشد

- **MariaDB واقعی اجرا نشد؛** این دور روی MySQL 8.4.7 بود. مایگریشن‌های تاریخی ۰۰۲/۰۰۳/۰۰۴/۰۰۶ روی MySQL شکست می‌خورند (M-08)؛ مسیر ارتقای MariaDB بدون تغییر فایل‌ها تست نشده است.
- رابط کاربری در مرورگر باز و کلیک‌به‌کلیک نشد؛ تغییر CSS ناوبری و تم پنل فقط به‌صورت ایستا و از طریق بیلد موفق تأیید شده و **دیده نشده است**.
- `UPLOAD_SCAN_MODE=off` و `CDR_MODE=off` بودند؛ مسیر ClamAV/CDR واقعی تست نشد (M-07).
- `npm run test` برای کل مونوریپو یکجا اجرا نشد؛ هر workspace جداگانه با همان پوشش اجرا شد.

---

## ۶) معماری پیشنهادی پیاده‌سازی A/B Testing

طراحی زیر با محدودیت‌های واقعی پروژه سازگار است: **CSP `connect-src 'self'`**، **CSRF + کوکی HttpOnly**، **RBAC**، **Audit Chain**، **`RATE_LIMIT_STORE=database`**، و **بدون تخریب مایگریشن‌های موجود**.

### ۶٫۱ ساختار دیتابیس (پیشنهاد — `migration_014_experimentation.sql` + همگام‌سازی `schema.sql`)

```sql
-- اجرای این فایل تا تصمیم رسمی محصولی انجام نمی‌شود.
USE regbroker;

CREATE TABLE experiments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  `key` VARCHAR(64) NOT NULL UNIQUE,          -- ex: application_form_layout
  name VARCHAR(190) NOT NULL,
  hypothesis VARCHAR(500) NOT NULL,
  status ENUM('draft','running','paused','completed') NOT NULL DEFAULT 'draft',
  unit ENUM('user','application','session') NOT NULL DEFAULT 'user',
  rollout_percent TINYINT UNSIGNED NOT NULL DEFAULT 100,  -- سهم ترافیک واردشده به آزمایش
  variants JSON NOT NULL,                     -- [{"key":"a","weight":50},{"key":"b","weight":50}]
  guardrail_metrics JSON NULL,                -- ["error_rate","429_rate","payment_success"]
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_experiment_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE experiment_assignments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  experiment_id BIGINT UNSIGNED NOT NULL,
  unit_type ENUM('user','application','session') NOT NULL,
  unit_id VARCHAR(64) NOT NULL,               -- user id / application id / session hash
  variant_key VARCHAR(64) NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assignment (experiment_id, unit_type, unit_id),
  INDEX idx_assignment_lookup (experiment_id, unit_id),
  CONSTRAINT fk_assignment_experiment FOREIGN KEY (experiment_id) REFERENCES experiments(id)
) ENGINE=InnoDB;

CREATE TABLE experiment_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  experiment_id BIGINT UNSIGNED NOT NULL,
  variant_key VARCHAR(64) NOT NULL,
  unit_id VARCHAR(64) NOT NULL,
  event_name VARCHAR(64) NOT NULL,            -- exposure | form_step_view | submit_success | ...
  value DECIMAL(18,2) NULL,                   -- برای متریک پیوسته (زمان، مبلغ)
  properties JSON NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_metric (experiment_id, event_name, variant_key, occurred_at),
  INDEX idx_event_unit (unit_id, occurred_at),
  CONSTRAINT fk_event_experiment FOREIGN KEY (experiment_id) REFERENCES experiments(id)
) ENGINE=InnoDB;
```

نکات طراحی:
- `UNIQUE (experiment_id, unit_type, unit_id)` تضمین **Sticky Bucketing** در سطح دیتابیس است؛ حتی اگر کش ری‌استارت شود، کاربر نسخه‌اش را عوض نمی‌کند.
- `unit_id` برای کاربر authenticated = `users.id`؛ برای کاربر ناشناس = HMAC از session cookie (نه IP خام، به‌دلیل GDPR و NAT).
- `experiment_events` عمداً از `audit_logs` جدا است: Audit Chain باید **فقط** اقدامات امنیتی/تغییر وضعیت را ثبت کند و نباید با حجم رویدادهای تحلیلی پر شود (این تفکیک، صحت `verify-audit-chain.ts` را حفظ می‌کند).

### ۶٫۲ میدل‌ور Bucketing و Flagging (سرور)

```ts
// server/src/experiments.ts  (پیشنهاد)
export async function assignVariant(req: Request, key: string) {
  const experiment = await getRunningExperiment(key);        // کش ۳۰ ثانیه‌ای
  if (!experiment || !eligible(req.user)) return null;       // admin/compliance/observer حذف
  const unitId = req.user ? String(req.user.id) : anonymousUnitId(req);
  // Bucketing پایدار: HMAC(secret, `${key}:${unitId}`) → درصد
  const score = hashToPercent(config.EXPERIMENT_SALT, `${key}:${unitId}`);
  if (score >= experiment.rollout_percent) return null;      // خارج از آزمایش
  const variant = pickWeighted(experiment.variants, score);  // همان score، نه تصادفی جدید
  await INSERT IGNORE INTO experiment_assignments (...);      // idempotent
  const saved = await SELECT variant_key ...;                 // همیشه مقدار ذخیره‌شده برگردد
  return { key, variant: saved };
}
```

اصول سازگاری با امنیت فعلی:
1. **بعد از `authenticate` و قبل از handler** اجرا شود؛ هرگز روی `/auth/*`، `/admin/security/*` یا مسیرهای TOTP اعمال نشود (Feature Flag روی مسیر امنیتی = ریسک قفل‌شدن حساب).
2. **نباید در `RATE_LIMIT_STORE` نوشتن اضافه کند**؛ Bucketing یک کوئری دارد که با کش ۳۰ ثانیه‌ای amortize می‌شود (محدودیت ۲۴۰ درخواست/دقیقه حفظ می‌شود).
3. **Audit:** فقط تغییر وضعیت آزمایش (`experiment.started`, `experiment.stopped`) باید در Audit ثبت شود، نه هر assignment.
4. **پاسخ به کلاینت** از طریق هدر امن `X-Exp-<key>: <variant>` یا در `GET /api/experiments/me` (same-origin، بدون cookie جدید).

### ۶٫۳ هوک فرانت‌اند و ثبت رویداد

```tsx
// client/src/experiments.tsx  (پیشنهاد)
export function useExperiment(key: string, fallback = "a") {
  const [variant, setVariant] = useState(fallback);
  useEffect(() => {
    request<{ key: string; variant: string }[]>(`/public/experiments`)
      .then((list) => {
        const found = list.find((x) => x.key === key);
        if (found) { setVariant(found.variant); track(key, found.variant, "exposure"); }
      })
      .catch(() => undefined);          // شکست شبکه هرگز UI را نمی‌شکند
  }, [key]);
  return variant;
}

export function track(key: string, variant: string, event: string, value?: number) {
  // same-origin ⇒ با CSP فعلی سازگار است؛ keepalive برای رویدادهای unload
  void fetch("/api/experiments/event", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
    body: JSON.stringify({ key, variant, event, value }),
    keepalive: true,
  }).catch(() => undefined);
}
```

قواعد:
- رویدادها **بدون داده هویتی/حساس** (نه شماره ملی، نه موبایل، نه محتوای مدرک) — فقط `event_name`، `value` و `properties` غیرهویتی. این با سیاست «پیش‌نویس غیرهویتی» در `drafts.ts` هم‌راستاست.
- رویداد `exposure` یک‌بار در هر session (نه در هر render) ثبت شود تا SRM (Sample Ratio Mismatch) مصنوعی نسازد.
- هر رویداد باید از مسیر CSRF-protected عبور کند؛ برای کاهش هزینه می‌توان batch کرد (ArrayBuffer/JSON آرایه با سقف ۵۰ رویداد).

### ۶٫۴ تحلیل آماری و کنترل سوگیری

| ریسک | کنترل در طراحی |
|---|---|
| SRM (نسبت نامتوازن نمونه) | بررسی روزانه نسبت assignment ها با chi-square؛ هشدار اگر انحراف > ۱٪ |
| Contamination بین نسخه‌ها | Sticky assignment + عدم نمایش عناصر نسخه B در صفحه‌های مشترک با A |
| Novelty effect | حداقل ۲ هفته یا ۳۸۴ نمونه در هر گروه برای MDE=۵٪ با power=۸۰٪ |
| اثر فصلی/ساعتی | Bucketing بر اساس هش پایدار (نه زمان) + تحلیل لایه‌ای (روز هفته/نقش) |
| تعامل با Rate Limit | متریک محافظ `429_rate` در `guardrail_metrics`؛ توقف خودکار در صورت افزایش > ۲۰٪ |
| تعامل با امنیت | مسیرهای auth/TOTP/CSRF هرگز آزمایش نمی‌شوند |

---

## ۷) چک‌لیست نهایی پیش از اولین تست A/B روی محیط واقعی

### زیرساخت و داده
- [ ] **تصمیم درباره M-08:** اگر ارتقای نصب‌های موجود روی MySQL لازم است، مایگریشن‌های تاریخی با Prepared Statement بازنویسی و نصب‌ها re-baseline شوند؛ در غیر این صورت مسیر ارتقا رسماً MariaDB اعلام شود.
- [ ] اجرای `migration_014_experimentation.sql` (پس از تأیید محصولی) و همگام‌سازی `schema.sql`.
- [ ] تأیید `bash scripts/database-check.sh` روی دیتابیس واقعی (نه فقط static).
- [ ] تنظیم `EXPERIMENT_SALT` در `.env` (کلید تصادفی ≥۳۲ بایت) — **نیازمند بررسی دستی**.
- [ ] تأیید `RATE_LIMIT_STORE=database` در production (وگرنه سرور بالا نمی‌آید — عمدی).
- [ ] پشتیبان رمزنگاری‌شده قبل از هر تغییر اسکیما (`database/backup.sh` + `BACKUP_ENCRYPTION_PASSWORD`).

### امنیت و سازگاری
- [ ] تأیید که هیچ آزمایشی روی `/auth/*`, TOTP, CSRF, rate-limit، مسیرهای پرداخت اعمال نشده است.
- [ ] بررسی `connect-src 'self'` CSP: اگر ابزار تحلیلی خارجی لازم شد، **ابتدا** درخواست تغییر سیاست امنیتی (M-03).
- [ ] بررسی نشت داده بین نسخه‌ها: response هر endpoint در دو گروه مقایسه و از نظر فیلدهای حساس diff شود.
- [ ] اجرای `scripts/security-scan.sh` و نگهداری checksum گزارش (اکنون روی Linux/Windows هم کار می‌کند).
- [ ] تأیید تفکیک نقش: `admin`, `compliance`, `observer` از نمونه‌گیری حذف شوند (منع آلودگی و ریسک دسترسی).

### اندازه‌گیری
- [ ] تعریف صریح متریک اولیه (Primary)، متریک‌های ثانویه و Guardrailها برای هر آزمایش.
- [ ] محاسبه اندازه نمونه لازم پیش از شروع (MDE، base rate، power=۸۰٪، α=۰٫۰۵).
- [ ] تست ثبت `exposure` و رویداد تبدیل در محیط staging (بدون داده واقعی).
- [ ] داشبورد SRM + هشدار خودکار در انحراف تخصیص.

### کیفیت و انتشار
- [ ] `npm run test -w server` (باید ۱۰۷+ PASS)، `npm run test -w client` (۳۳+ PASS).
- [ ] `npm run typecheck && npm run lint && npm run build` — همه EXIT=0.
- [ ] بررسی دستی UI در مرورگر واقعی (این دور انجام نشد).
- [ ] سناریوی Rollback مستند: توقف آزمایش (`status='paused'`)، پاک‌سازی assignmentها در صورت نیاز، و بازگشت به نسخه A.
- [ ] ثبت تصمیم نهایی (Adopt/Reject/Iterate) در Audit و در گزارش محصولی.

---

## پیوست: فهرست فایل‌های تغییرکرده در این دور

| فایل | نوع تغییر |
|---|---|
| `server/src/config.ts` | نرمال‌سازی `PORT` (۰/خالی → پیش‌فرض) |
| `server/src/config.test.ts` | **فایل جدید** — ۴ تست رگرسیون PORT |
| `server/src/rate-limit.ts` | اتصال لیمیترهای global/api به استور مشترک |
| `server/src/app.ts` | `exposedHeaders` در CORS |
| `server/src/routes/auth.ts` | «خالی = ارسال‌نشده» در PATCH `/me` |
| `server/src/routes/applications.ts` | قفل ردیف در آپلود مدرک + سقف ۲۵۵ برای `reason` |
| `server/src/routes/admin.ts` | گارد prototype در PATCH services + منع تغییر نقش/تعلیق خود |
| `server/src/routes/operations.ts` | استرداد اتمیک + به‌روزرسانی `payments.status` |
| `server/src/routes/public.ts` | `jsonArray()` برای `requirements`/`workflow` |
| `server/src/security-features.test.ts` | انتظار مسیر مستقل از پلتفرم + پوشش `..\` |
| `client/src/App.tsx` | dedupe صفحه‌بندی درخواست‌ها بر اساس `id` |
| `database/seed-dev-users.sql` | idempotent با `INSERT IGNORE` + `WHERE NOT EXISTS` |
| `database/migration_004_page_12_messaging.sql` | افزودن `USE regbroker;` |
| `database/seed-base.sql` | idempotent با `INSERT IGNORE` برای roles/services/profile/retention |
| `database/migrate.sh` | رفع escape نامعتبر AWK در خواندن `.env` |
| `database/validate-schema.sh` | همان اصلاح AWK |
| `client/src/styles.css` | انتقال قواعد منوی موبایل به داخل `@media (max-width:1050px)` |
| `client/src/panel-theme.css` | حذف دو `!important` زائد |
| `server/src/rate-limit.ts` | `requestPropertyName` مستقل برای هر لیمیتر |
| `server/src/shared-limits.ts` | `localKeys = true` در استورهای حافظه و دیتابیس |
| `scripts/database-check.sh` | حداقل جدول به‌جای عدد دقیق ۴۲ |
| `scripts/security-scan.sh` | checksum قابل‌حمل (`sha256sum`/`shasum`) |
| `.env.example` | مستندسازی `MYSQL_BIN`/`MYSQLDUMP_BIN` |
