# گزارش نهایی Lead Agent — سامانه کارگزاری ثبتی

تاریخ ممیزی: ۱۱ اوت ۲۰۲۶

## ۱. خلاصه اجرایی

Repository موجود بررسی، دسته‌بندی و اصلاح شد؛ پروژه از صفر بازنویسی نشد. Backend و Frontend build می‌شوند و تمام تست‌های واحد/policy فعلی Pass هستند. مسیرهای امنیتی، RBAC، گردش پرونده، redaction ناظر، tracking token، migration و rate limit تقویت شدند.

نسخه فعلی برای تست داخلی آماده است. در این اجرا یک MariaDB سازگار با XAMPP در محیط ایزوله محلی روی پورت `3307` با schema، seed و migration کامل اجرا شد؛ health API، نقش‌ها، فرم‌ها، کنترل مالکیت، upload امن و سناریوهای اصلی E2E با موفقیت بررسی شدند. سرویس XAMPP اصلی به‌دلیل نیاز به دسترسی root از داخل این محیط start نشد و باید روی سیستم مقصد جداگانه بررسی شود. PSP رسمی و API سازمان ثبت نیز credential/contract ندارند. وضعیت نهایی: `READY_FOR_INTERNAL_TEST`.

## ۲. معماری واقعی Repository

| جزء | وضعیت استخراج‌شده |
|---|---|
| Frontend | React 18، TypeScript، Vite، router داخلی، RTL فارسی و CSS responsive |
| Backend | Node.js، Express 4، TypeScript، routeهای ماژولار |
| Database | MySQL/MariaDB با `mysql2`، سازگار با XAMPP/phpMyAdmin؛ ۴۲ جدول canonical + `schema_migrations` |
| Validation | Zod در Backend، normalization ارقام فارسی/عربی در لایه ورودی |
| Authentication | bcrypt، JWT، OTP موبایل، TOTP/MFA و recovery code؛ نقش جاری از DB دوباره بررسی می‌شود |
| Authorization | capability/RBAC سمت سرور، `authorize`/`requireCapability`، کنترل assignment/ownership؛ UI فقط projection است |
| Files | multer، نام تصادفی، allowlist MIME/signature، محدودیت حجم، نسخه و دانلود کنترل‌شده |
| Integration | صف پایدار registry با retry/dead-letter/idempotency؛ provider واقعی جعل نشده است |
| Payment | abstraction و tariff/receipt/refund مدل شده؛ PSP واقعی عمدی gate شده و در محیط غیرتولیدی 503/501 می‌دهد |
| Logging | audit log، request context/correlation id، security events، status history و monitoring |
| Deployment | اسکریپت XAMPP، backup/restore، migration/validation؛ Docker و CI در Repository موجود نیستند |
| Version control | این مسیر Git repository فعال ندارد؛ هیچ reset/clean یا حذف فایل انجام نشد |

## ۳. Project Inventory و ماتریس وضعیت

| قابلیت | Backend | Frontend | DB | Test | Security | وضعیت | مالک |
|---|---|---|---|---|---|---|---|
| سایت عمومی، راهنما، قوانین، حریم خصوصی و تماس | routeهای public و صفحات RTL | صفحات public و responsive | announcements/profile/services | تست policy + HTTP smoke | CORS/rate limit | `COMPLETE_BUT_BUGGY`؛ داده رسمی شرکت/مرور بصری staging باز | Lead / Applicant |
| ثبت‌نام، ورود، OTP، MFA و profile | auth، bcrypt، JWT، lock و recovery | فرم‌های login/register/profile | users/roles/OTP/consents | validation/auth tests | secrets fail-fast، role hydration؛ localStorage/CSRF باز | `COMPLETE_BUT_BUGGY` | Identity/Security |
| RBAC و permission | capability و authorize واقعی روی endpoint | منوی capability-based | roles | policy + role matrix زنده | IDOR/observer read-only تقویت شد | `COMPLETE`؛ ماتریس ۹ نقش Pass | Identity/Security |
| پنل متقاضی و draft | application/property/party routes | dashboard، wizard، draft، اعلان | applications/properties/parties | page/service + E2E | مالکیت و archive gate | `COMPLETE_BUT_BUGGY`؛ providerهای بیرونی باز | Applicant |
| ۱۲ خدمت منطقی سند | ۹ `service` با rules و validation | فرم اختصاصی و subtype | seed ۹ تعریف | ۹ rule test | field allowlist و API payload | `PARTIAL`؛ سه جفت خدمت با subtype پوشش داده شده‌اند: تفکیک عرصه/آپارتمان، تجمیع/افراز، اصلاح ملک/مندرجات؛ ۱۲ ردیف مستقل DB ایجاد نشده است | Services |
| مدیریت خدمت و تعرفه | GET/PATCH و POST امن `/admin/services` | فرم ایجاد/ویرایش خدمت | services JSON/version/fee | typecheck/lint + role matrix | role gate، prototype segment block | `COMPLETE_BUT_BUGGY`؛ تست زنده mutation خارج از scope داده seed | Core/Admin |
| گردش وضعیت پرونده | graph صریح، 409 transition، cancel، history و notification نقص | labels/options وضعیت‌های کامل | enum کامل + migration 009 | policy + E2E نقص/اصلاح | role/assignment/terminal gates | `COMPLETE` برای مسیرهای داخلی آزموده‌شده | Workflow |
| مدارک و نقشه | upload/signature/version/review/download | upload/revise/checklist | documents/attachments | validation/security tests | path/MIME/sensitivity/redaction | `COMPLETE_BUT_BUGGY`؛ AV/quota و object storage باز | Property/Security |
| کارشناسان و عملیات | queue/assignment/report/risk/review | StaffWorkspace | assignments/reports/risk | policy + E2E assignment/report | assigned-only access | `COMPLETE_BUT_BUGGY`؛ بازبینی UI مرورگر باقی است | Operations |
| پرداخت و استرداد | quote، transaction model، receipt/refund readiness | payment state/receipt UI | payments/refund_requests | financial policy tests | منع کارت‌به‌کارت؛ PSP gate | `PARTIAL`, `BLOCKED_BY_EXTERNAL_DEPENDENCY` | Finance |
| پیام، اعلان، تیکت و شکایت | scoped ticket/message/complaint routes | support/complaint UI | messages/notifications/tickets/complaints | policy + live notification/ticket | support IDOR و observer internal-note fix | `COMPLETE_BUT_BUGGY`؛ provider پیامک/ایمیل باز | Support |
| ناظر سازمان ثبت | read-only dashboards، redacted projections | observer workspace | audit/security/backup/metrics | observer + live role matrix | Writeها با middleware/capability رد می‌شوند | `COMPLETE` برای سطح read-only آزموده‌شده | Security/Monitoring |
| API سازمان ثبت | abstraction، queue، timeout/retry/idempotency | admin integration view | integration_jobs/api_logs | registry abstraction tests | URL/credential configurable، no fake production | `PARTIAL`, `BLOCKED_BY_EXTERNAL_DEPENDENCY` | Integration |
| Audit/monitoring/backup | audit chain، metrics، backup/restore scripts | admin dashboard | audit/security/backup tables | policy/static tests | immutability/AEAD restore open | `COMPLETE_BUT_BUGGY` | Security/DevOps |
| Migration و XAMPP setup | deterministic migrate/baseline/status/validate | راهنمای اجرا | schema/seed + ۱۳ migration | setup/validate/status روی DB ایزوله | checksum drift guard | `COMPLETE_BUT_BUGGY`؛ XAMPP daemon اصلی نیازمند root است | DB/DevOps |
| QA و E2E | unit/policy + live smoke | client suite | fixture ایزوله محلی | ۱۱۳ تست Pass + سناریوهای زنده | security scan online blocked | `COMPLETE_BUT_BUGGY`؛ PSP/Registry و browser visual review باز | QA/Lead |

طبقه‌بندی‌های `MOCK` و `PLACEHOLDER`: provider تولیدی PSP و registry در کد به‌عنوان Mock تولیدی اعلام نشده‌اند؛ payment/registry عمداً `PARTIAL` و وابسته به credential/contract بیرونی هستند.

## ۴. کارهای تکمیل یا اصلاح‌شده در این ممیزی

- اضافه‌شدن مسیر واقعی ایجاد خدمت `POST /api/admin/services` با validation سخت‌گیرانه و audit؛ مسیر تکراری قدیمی حذف شد.
- تکمیل graph انتقال پرونده در `server/src/application-access.ts` و اعمال آن در route وضعیت؛ transition نامعتبر/تکراری 409 می‌گیرد.
- افزودن وضعیت‌های پرداخت، بررسی کارشناسی، آماده ارسال، بازگشت نقص، توقف امنیتی، لغو و ارجاع شکایت به enum canonical و `database/migration_009_workflow_completion.sql`.
- افزودن `POST /api/applications/:id/cancel` با ownership، دلیل الزامی، transaction، status history و کنترل هم‌زمانی و action لغو در پنل متقاضی.
- پشتیبانی صف registry از وضعیت `ready_to_send` و ثبت `from_status` واقعی، به‌جای hard-code کردن `registry_exchange`.
- تکمیل label/optionهای وضعیت در UI و نمایش action ارسال registry برای هر دو وضعیت آماده ارسال/تبادل.
- اصلاح پاسخ ticket reply برای خواندن status واقعی و بستن شکاف دسترسی تیکت بسته/اختصاص‌داده‌شده.
- اعمال rate limit عمومی روی preflight و حفظ limiterهای سخت‌گیرانه‌تر API/auth؛ tracking عمومی limiter مستقل دارد.
- redaction ناظر برای پرونده، گزارش، پرداخت، تیکت، آرشیو، backup و security event؛ حذف پیام داخلی و داده هویتی/ملکی حساس از projection ناظر.
- tracking عمومی با الگوی سخت‌گیرانه شماره پرونده، HMAC token، پاسخ 404 عمومی، `no-store/noindex` و سقف ۲۰ درخواست در ۱۵ دقیقه.
- migration runner با checksum SHA-256، baseline فقط برای نصب canonical تازه، `--status` read-only و `db:validate/db:check` اضافه شد.
- بارگذاری `.env` در Backend مستقل از cwd شد تا اجرای workspace scriptها تنظیمات ریشه و پورت XAMPP (`3307`) را از دست ندهند.
- اصلاح CSV formula injection، fail-fast تنظیمات production، trust proxy صریح و re-check وضعیت/نقش کاربر در JWT.
- ایجاد اعلان خودکار برای متقاضی هنگام انتقال پرونده به `documents_deficient` یا `awaiting_applicant`؛ مسیر نقص/اصلاح/ارسال مجدد دوباره به‌صورت زنده اجرا شد.
- محدودسازی projection جزئیات پرونده برای finance/support و اصلاح MIME پاسخ دانلود سند؛ اطلاعات فرم/نشانی/طرف‌ها و مدارک بسیار محرمانه خارج از دامنه این نقش‌ها قرار گرفت.
- بستن شکاف IDOR شکایت برای صف پشتیبانی و اعتبارسنجی رابطه `applicationId/applicantId` در تعاملات پشتیبانی.

## ۵. قابلیت‌های موجود که با تست محلی تأیید شدند

- `npm run typecheck`: موفق برای server و client.
- `npm run lint`: موفق برای server و client بدون warning.
- `npm test`: server، ۱۸ فایل/۹۰ تست؛ client، ۱۰ فایل/۲۳ تست؛ همه Pass.
- `npm run build`: TypeScript و Vite production build موفق.
- `npm audit --omit=dev --audit-level=high --offline`: `found 0 vulnerabilities`.
- `npm run db:check` و `bash -n` همه اسکریپت‌های database/backup/restore: موفق.
- tracking، observer projection، status graph، validation، RBAC policy و rate-limit unit tests: Pass.

این شواهد شامل اجرای واقعی API و DB ایزوله محلی هستند؛ مرور بصری دستی مرورگر، PSP رسمی و API سازمان ثبت هنوز وابستگی بیرونی دارند.

## ۶. باگ‌های اصلاح‌شده

| مشکل | علت | اصلاح | شاهد |
|---|---|---|---|
| UI مدیریت خدمت POST داشت ولی backend route قابل اتکا نداشت و route تکراری بود | هم‌ترازی ناقص Frontend/Backend | یک route strict با audit نگه داشته و duplicate حذف شد | typecheck/lint/build |
| statusهای جدید در graph وجود داشتند ولی enum/route/UI کامل نبود | توسعه مرحله‌ای workflow | migration 009، allowed set، label/option و integration dynamic status | ۹۰ تست server |
| پاسخ reply تیکت `status` را select نمی‌کرد | شرط access روی `undefined` ارزیابی می‌شد | SELECT شامل applicant/assigned/status شد | page-12 tests |
| tracking با file number تنها قابل enumeration بود | نبود token و limiter اختصاصی | HMAC token + validation + limiter + generic 404 | tracking tests |
| observer داده PII، body گزارش، مسیر فایل backup و یادداشت داخلی می‌دید | projection ناقص و route scope گسترده | observer projection و role/read-only guard | observer tests |
| ارسال CSV با مقدار فرمول‌مانند ممکن بود | export بدون neutralization | prefix امن برای `=,+,-,@` | static/security tests |
| preflight قبل از limiter قرار می‌گرفت | ترتیب middleware | limiter مستقل OPTIONS قبل از CORS | rate-limit tests/typecheck |
| تغییر وضعیت نقص مدارک اعلان متقاضی ایجاد نمی‌کرد | route فقط history ثبت می‌کرد | درج notification transactional برای `documents_deficient`/`awaiting_applicant` و اجرای مجدد مسیر اصلاح | E2E live deficiency PASS |
| finance/support جزئیات رمزگشایی‌شده بیش از نیاز دریافت می‌کردند | response مشترک full detail | `restrictedApplicationDetail` با projection حداقلی و فیلتر مدارک/پیام | server redaction tests + live scoped access |

## ۷. اصلاحات امنیتی و موارد باز

گزارش جزئی ۲۴ یافته در `SECURITY_AUDIT_README.md` نگهداری می‌شود. موارد مهم رفع‌شده: support IDOR، role hydration پس از suspend، trust-proxy/XFF، production secret gates، tracking enumeration، observer redaction/read-only، finance/support minimization و CSV formula injection.

موارد باز و لازم برای پیش از انتشار عمومی: انتقال JWT از localStorage یا session/jti revoke و CSRF، rate-limit مشترک Redis برای چند replica و limiter اختصاصی upload/OTP/MFA، quota و AV/CDR فایل، backup authenticated encryption و restore ضد path traversal، MFA/temporary-password lifecycle مدیران، TLS اتصال MySQL، append-only/anchor برای audit، محدودسازی جزئیات health، حذف/rotate seed credentials و مرور penetration test مجاز.

`npm run security:scan` در اجرای نهایی موفق شد و `found 0 vulnerabilities`، typecheck، lint، تست‌های server/client و `db:check` را ثبت کرد. هیچ penetration test روی اینترنت، داده واقعی یا سرویس ثالث انجام نشده است.

## ۸. تغییرات دیتابیس

- `database/schema.sql`: ۴۲ جدول canonical با InnoDB/utf8mb4.
- `database/seed.sql`: ۱۱ نقش و ۹ service definition؛ mapping سه‌جفتی خدمات در ماتریس بالا ثبت شده است.
- `database/migration_009_workflow_completion.sql`: enum کامل ۲۴ وضعیت پرونده.
- `database/migrate.sh`: اجرای مرتب، checksum، baseline/status و توقف روی drift.
- `database/validate-schema.sh` و `scripts/database-check.sh`: بررسی ۴۲ جدول canonical + `schema_migrations`، role/service count و migration coverage.

برای اثبات integration، MariaDB 10.4.28 سازگار با XAMPP در مسیر موقت ایزوله و پورت `3307` اجرا شد. `npm run db:setup:xampp`، `npm run db:validate` و `npm run db:migrate:status` موفق بودند: ۴۳ جدول شامل `schema_migrations`، ۱۱ نقش، ۹ خدمت و ۱۳ migration. XAMPP daemon اصلی به‌دلیل نیاز به root از داخل این محیط start نشد؛ این موضوع با DB ایزوله جایگزین و در گزارش باقی‌مانده ثبت شده است.

## ۹. تست‌های E2E و وضعیت اجرا

شش سناریوی درخواستی در `docs/E2E_TEST_PLAN_FA.md` ثبت شده‌اند. E2E-01، E2E-02، E2E-03، E2E-05 و E2E-06 روی API/DB ایزوله Pass شدند. E2E-04 تا مرحله quote و gate پرداخت Pass است؛ callback/verification واقعی به‌دلیل نبود PSP رسمی `BLOCKED_BY_EXTERNAL_DEPENDENCY` است. frontend dev server روی `5173` و backend روی `4000` در پایان اجرا فعال بودند.

## ۱۰. مسائل باقی‌مانده و وابستگی‌های خارجی

- XAMPP MySQL/MariaDB مقصد باید با دسترسی سرویس واقعی روشن، import و با `npm run db:validate` تأیید شود؛ DB ایزوله این اجرا فقط evidence داخلی است.
- PSP رسمی، callback/verify و حساب حقوقی مورد تأیید لازم است؛ payment درگاه واقعی عمدی فعال نشده است.
- Base URL، credential، timeout و قرارداد رسمی API سازمان ثبت لازم است؛ provider جعلی production وجود ندارد.
- SMS/email provider برای OTP/اعلان رسمی، HTTPS معتبر، reverse proxy، secret manager، DB TLS و host production لازم است.
- Docker/CI/release artifact در Repository موجود نیست و باید برای مقصد استقرار جداگانه تعریف شود.

## ۱۱. آمادگی نهایی

`READY_FOR_INTERNAL_TEST`

دلیل دقیق: build، ۱۱۳ تست، migration/validation، health API، role matrix و مسیرهای اصلی E2E Pass هستند. پرداخت PSP و تبادل رسمی Registry هنوز credential/contract ندارند و چند یافته امنیتی سطح زیاد (session/CSRF، rate-limit توزیع‌شده، AV فایل و backup authenticated) پیش از staging/production باید رفع و سپس penetration test مجاز اجرا شود.

## ۱۲. هماهنگی چندعاملی

- Lead/Orchestrator: ممیزی repository، هم‌ترازی route/schema/UI، رفع integration و اجرای کنترل نهایی.
- `workflow_forms_audit`: graph انتقال، وضعیت‌های تکمیلی، ticket status و آزمون‌های صفحه ۱۲.
- `security_audit_report`: observer/public tracking، redaction، read-only و privacy projections.
- `db_devops_audit`: migration runner، baseline/checksum، schema validation و XAMPP setup.
- QA baseline: استخراج خطاهای اولیه و هم‌ترازی `docs/TESTING_FA.md`؛ اجرای نهایی تست‌ها توسط Lead تکرار شد.

به‌دلیل ظرفیت چهار slot، این عامل‌ها به‌صورت موازی و سپس sequential reuse اجرا شدند؛ هیچ completion بدون اجرای واقعی checkهای ثبت‌شده اعلام نشده است.
