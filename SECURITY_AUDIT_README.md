# گزارش ممیزی امنیتی سامانه کارگزاری ثبتی

تاریخ این ممیزی: ۱۴۰۵/۰۵/۲۰ (۲۰۲۶-۰۸-۱۱)

این گزارش برای آماده‌سازی استقرار تهیه شده و تمرکز آن روی `server/src`، احراز هویت و سطح دسترسی، بارگذاری فایل، تنظیمات، اسکریپت‌های دیتابیس/پشتیبان‌گیری و نقاطی از کلاینت است که مستقیماً روی امنیت نشست اثر دارند. بررسی حاضر ممیزی کد و آزمون‌های محلی است؛ «آزمون نفوذ» روی اینترنت یا داده واقعی انجام نشده است. هر آزمون نفوذ باید با مجوز کتبی، محیط staging جدا و داده آزمایشی انجام شود.

## جمع‌بندی اجرایی

- تزریق SQL در مسیرهای بررسی‌شده مشاهده نشد؛ مقادیر کاربر در کوئری‌ها پارامتری هستند و قطعات SQL پویا از enum/ثابت‌های داخلی ساخته می‌شوند.
- کنترل‌های مثبت موجود شامل `helmet`، CORS محدود، اعتبارسنجی Zod، bcrypt، AES-256-GCM، blind index، بررسی امضای فایل، مسیر ذخیره‌سازی امن، audit و rate limit پایه است.
- نقص‌های دسترسی/نشست و کمینه‌سازی داده اصلاح شدند: دسترسی پرونده برای پشتیبانی اکنون فقط برای تیکت بدون مسئول یا تیکت مسئول همان پشتیبان است؛ نقش و وضعیت کاربر در هر درخواست احراز‌شده از دیتابیس بازخوانی می‌شود و projection finance/support حداقلی است.
- مقداردهی `TRUST_PROXY` امن شد و پیش‌فرض آن `false` است؛ تبدیل رشته‌ای `false` به مقدار بولی نیز صریحاً کنترل می‌شود. در صورت فعال‌سازی، Express فقط یک proxy زیرساختی را trusted می‌کند و هدر `X-Forwarded-For` ارسالی مستقیم بدون proxy باعث خطای ۵۰۰ نمی‌شود.
- خروجی‌های CSV در برابر فرمول‌تزریقی Excel با پیشوند امن محافظت شدند.
- ماتریس دسترسی endpointهای حساس دوباره ممیزی شد: export و audit با capability مستقل کنترل می‌شوند، مسیرهای داخلی و یکپارچه‌سازی برای ناظر read-only هستند، و خروجی‌های ناظر از نام، IP، شناسه‌های داخلی و جزئیات عملیاتی حساس redacted می‌شوند.
- دامنه پشتیبانی شکایت نیز به صف بدون مسئول یا شکایت assigned همان پشتیبان محدود شد؛ مشاهده پیوست و تغییر وضعیت همین کنترل را دوباره بررسی می‌کنند.
- جزئیات پرونده برای نقش‌های مالی و پشتیبانی projection نقش‌محور دارد؛ finance فقط خلاصه و پرداخت/پیام مالی می‌گیرد و support بدون form/party/address و بدون مدارک بسیار محرمانه کار می‌کند.
- کوئری ورود، `mfa_recovery_codes` را نیز می‌خواند؛ بدون این ستون، کدهای بازیابی MFA قابل استفاده نبودند.
- `globalRequestLimiter` پیش از تمام routeها نصب شده و درخواست‌های API، فایل‌های production و مسیرهای ناشناخته را پوشش می‌دهد؛ برای `/api` و `/api/auth` سقف‌های جداگانه و سخت‌گیرانه‌تر فعال است.
- با وجود این اصلاحات، به‌دلیل seed توسعه، نگهداری JWT در `localStorage`، نبود ابطال نشست، restore ناامن و نبود rate-limit توزیع‌شده، این نسخه بدون hardening محیط و آزمون نفوذ مجاز، تأیید استقرار عمومی نمی‌شود.

## بازبینی دوم (نسخهٔ اصلاح‌شده)

یافته‌های REVIEW_FINDINGS_FA رفع شدند: پیش‌نویس با بارگذاری صفحه پاک نمی‌شود؛ تغییر MFA همهٔ نشست‌ها را ابطال و `mfaVerified` را از وضعیت جاری می‌خواند؛ پیوست شکایت همان کنترل‌های آپلود مدارک را دارد؛ restore دوطرفه و قابل rollback است؛ limiterها مشترک‌اند؛ ساخت/ارتقای مدیر نیازمند رمز یک‌بارمصرف، MFA و step-up است؛ پیش‌نویس allow-list دارد؛ TLS دیتابیس؛ guard سیدینگ از `.env`؛ audit فقط‑افزودنی با anchor؛ health حداقلی؛ audit ورود ماسک‌شده؛ مستندات هماهنگ شدند. آزمون خودکار و اجرای کامل برنامه در این محیط انجام نشد.

## بازبینی سوم (سخت‌گیرانه) و CDR

- **CDR** برای مدارک و پیوست شکایت: `server/src/cdr.ts` و `cdr-pure.ts` (آزمون: `cdr-pure.test.ts`). ZIP حذف شد.
- رمز عبور: سقف ۷۲ بایت (bcrypt بقیه را نادیده می‌گرفت)، فهرست رمزهای رایج، رد تکرار نویسه.
- TOTP: هر کد فقط یک‌بار قابل مصرف است (`users.mfa_last_step`)؛ مقایسهٔ OTP موبایل ثابت‌زمان؛ JWT فقط HS256.
- تغییر ایمیل/موبایل نیازمند رمز فعلی است، تأیید موبایل را ریست و نشست‌های دیگر را ابطال می‌کند.
- هدرها: CSP صریح (`frame-ancestors 'none'`, `object-src 'none'`)، HSTS preload، Referrer-Policy، Permissions-Policy، `Cache-Control: no-store` برای همهٔ `/api`، sandbox CSP و nosniff برای دانلود فایل، عدم دنبال‌کردن redirect در درخواست‌های خروجی (webhook/registry/anchor)، fallback کلاینت دیگر `/api/*` ناشناخته را با HTML پاسخ نمی‌دهد.
- فایل `.env` در خروجی تحویل داده نمی‌شود؛ هر کلید قدیمی که در گزارش/زیپ قبلی بوده باید rotate شود.

## یافته‌ها و وضعیت

| شناسه | شدت | وضعیت | شواهد | اثر | راهکار لازم |
|---|---|---|---|---|---|
| SEC-01 | بحرانی | رفع شد | `database/seed.sql:19-29` و `README.md:41` | همه حساب‌های seed با یک رمز عمومی ساخته می‌شوند؛ اگر seed در محیط عملیاتی اجرا شود، ورود مدیر قابل حدس است. | seed را از production حذف کنید یا bootstrap تصادفی یک‌بارمصرف بسازید؛ پس از نصب رمزها را rotate، MFA را اجباری و حساب‌های توسعه را غیرفعال کنید. **وضعیت فعلی:** seed به `seed-base.sql` (بدون حساب) و `seed-dev-users.sql` (فقط توسعه) تفکیک شد؛ `setup-xampp.sh` مقدار `NODE_ENV` را از `.env` هم می‌خواند؛ API در production با رمز seed بالا نمی‌آید؛ مدیر اول با `npm run bootstrap:admin`. |
| SEC-02 | بحرانی | رفع شد/نیازمند secrets واقعی | `server/src/config.ts:5-118` | در production نبود `JWT_SECRET` به مقدار شناخته‌شده توسعه، نبود `FIELD_ENCRYPTION_KEY` به کلید مشتق‌شده از JWT، و نبود رمز DB به کاربر root/رمز خالی منتهی می‌شد. | schema در `NODE_ENV=production` اکنون برای secret پیش‌فرض/کوتاه، کلید نامعتبر، origin غیر HTTPS و DB root/بدون رمز fail-fast می‌کند؛ حساب کم‌اختیار دیتابیس و secret manager همچنان باید استفاده شود. همه کلیدهای فعلی محیط محلی در صورت هرگونه افشا rotate شوند. |
| SEC-03 | زیاد | رفع شد | پیش از اصلاح، `userCanAccessApplication` در `server/src/application-access.ts` وجود هر تیکت را برای تمام کارکنان پشتیبانی کافی می‌دانست. اکنون خط ۳۷ شرط `(assigned_to IS NULL OR assigned_to=?)` دارد و فهرست پرونده در `server/src/routes/applications.ts:145-148` همین سیاست را اعمال می‌کند. فهرست تیکت‌ها نیز فقط صف بدون مسئول یا تیکت مسئول خود پشتیبان را برمی‌گرداند. | پشتیبان A دیگر با داشتن تیکت متعلق به پشتیبان B، پرونده او را از مسیر پرونده/پیام نمی‌بیند؛ صف بدون مسئول برای واگذاری باقی می‌ماند. | برای production یک تست integration با دو پشتیبان، تیکت assigned و unassigned اضافه شود؛ مدیر عملیات/تطبیق/ادمین/ناظر طبق سیاست مدیریتی فعلی دسترسی خود را حفظ می‌کنند. |
| SEC-04 | زیاد | رفع شد | `server/src/security.ts:22-41,51-88` | JWT قدیمی فقط با امضا بررسی می‌شد و پس از suspend یا تغییر نقش، تا ۸ ساعت معتبر می‌ماند. اکنون هر درخواست با کوئری indexed، وضعیت active و نقش فعلی را بررسی می‌کند و نقش از دیتابیس hydrate می‌شود. | این اصلاح یک round-trip دیتابیس برای هر درخواست authenticated اضافه می‌کند؛ برای بار بالا، پس از اندازه‌گیری، session cache کوتاه‌مدت یا `token_version`/revocation با TTL کوتاه اضافه شود. |
| SEC-05 | زیاد | رفع شد | `client/src/api.ts:13-24,37-44` و `client/src/App.tsx:149-193` | bearer JWT در `localStorage` نگهداری می‌شود؛ هر XSS یا افزونه مخرب می‌تواند آن را بخواند. `logout` فقط audit و حذف سمت مرورگر است و token سرور را revoke نمی‌کند. | نشست را به cookie `HttpOnly; Secure; SameSite` منتقل و CSRF token اضافه کنید، یا جدول session/jti و revoke در logout، تغییر رمز و تغییر MFA بسازید. CSP را در production بررسی و تست XSS مجاز انجام دهید. **وضعیت فعلی:** `server/src/security.ts` (issueSession/authenticate/csrfGuard) و `client/src/api.ts`: کوکی HttpOnly، jti سروری، CSRF؛ ابطال در logout/تغییر رمز/تغییر MFA/تعلیق. |
| SEC-06 | زیاد | رفع شد/نیازمند تنظیم deployment | `server/src/config.ts:8-11` و `server/src/app.ts:29-38` | `trust proxy=1` ثابت، در اجرای مستقیم API امکان spoof کردن `X-Forwarded-For` و دورزدن rate-limit/تحریف audit را ایجاد می‌کرد؛ هدر X-Forwarded-For مستقیم همچنین می‌توانست validation پیش‌فرض limiter را به خطای ۵۰۰ تبدیل کند. | پیش‌فرض اکنون `TRUST_PROXY=false` است، validation مربوط به هدر جعلی در حالت direct غیرفعال شده و در حالت فعال Express دقیقاً یک proxy را trusted می‌کند. فقط وقتی nginx/Apache مورد اعتماد همین یک hop را بازنویسی می‌کند `TRUST_PROXY=true` بگذارید؛ در غیر این صورت false بماند. |
| SEC-07 | زیاد | رفع شد (نیازمند RATE_LIMIT_STORE=database) | `server/src/rate-limit.ts:8-39` | rate-limit فعلی in-memory است؛ در چند process/replica هر نمونه bucket مستقل دارد و مهاجم می‌تواند با پخش درخواست بین replicaها budget را دور بزند. همچنین upload فقط همان budget عمومی را دارد. | برای production store مشترک Redis/DB با key بر مبنای IP و شناسه کاربر، limiter جدا برای login/MFA/OTP/upload/export و سقف هم‌زمانی فایل اضافه شود. limiter عمومی فعلی برای یک process کامل است، اما جایگزین store توزیع‌شده نیست. **وضعیت فعلی:** `server/src/shared-limits.ts`، `rate-limit.ts`، `upload-security.ts`: شمارندهٔ اتمیک MySQL برای IP-auth، آپلود، همزمانی آپلود و شناسهٔ ورود؛ در production الزامی است. limiter عمومی/API هنوز per-process است. |
| SEC-08 | زیاد | نیمه‌رفع/باز | `server/src/config.ts:13-17,43-82` و `server/src/notifications.ts:8-23` | `CLIENT_ORIGIN` و webhook پیامک فقط URL معتبر می‌خواستند و در production HTTPS را الزام نمی‌کردند؛ توکن bearer/داده پیامک می‌توانست روی HTTP یا endpoint اشتباه ارسال شود. | `CLIENT_ORIGIN` و webhook در production اکنون HTTPS را می‌پذیرند و برای webhook فعال token اجباری است؛ allow-list دامنه و secret manager هنوز باید اعمال شود. `REGISTRY_API_MODE=production` نیز HTTPS را بررسی می‌کند. |
| SEC-09 | زیاد | رفع شد | `database/backup.sh:39-45` و `database/restore.sh:26-41` | backup با AES-256-CBC بدون authentication تولید می‌شود؛ restore روی archive رمزگشایی‌شده بدون بررسی sidecar checksum و بدون بررسی مسیرهای `../`/symlink، مستقیم tar را extract می‌کند. archive دستکاری‌شده می‌تواند فایل‌های uploads را overwrite کند یا restore را منحرف کند. | فرمت authenticated (AES-GCM یا HMAC جداگانه) و verify checksum امضاشده را اجباری کنید؛ اعضای tar را قبل از extract canonicalize و path traversal/symlink را رد کنید؛ staging directory، `--no-same-owner` و restore اتمیک با حساب کم‌اختیار استفاده شود. **وضعیت فعلی:** `database/backup-crypto.mjs`، `backup.sh`، `restore.sh`: AES‑256‑GCM، checksum الزامی، اعتبارسنجی tar، snapshot قبل از restore، maintenance، جایگزینی (نه merge) فایل‌ها و rollback. |
| SEC-10 | متوسط | رفع شد | `server/src/routes/admin.ts:714-739` و `server/src/observer-data.ts` | API فهرست backup برای observer/technical مسیر مطلق فایل (`databaseFile`) و متن خطای داخلی را برمی‌گرداند؛ این مورد نقشه filesystem و جزئیات deployment را افشا می‌کرد. | projection ناظر اکنون فقط کد پشتیبان، وضعیت، اندازه و زمان را برمی‌گرداند؛ path مطلق و error خام از پاسخ ناظر حذف شده است. |
| SEC-11 | متوسط | رفع شد | exporterهای CSV در `server/src/routes/admin.ts:259-263,507-511` و `server/src/routes/applications.ts:556-560` اکنون مقادیر شروع‌شده با `=`, `+`, `-`, `@` را با apostrophe خنثی می‌کنند. | نام کاربر/عنوان/یادداشت دیگر به‌سادگی به فرمول هنگام بازکردن CSV در Excel تبدیل نمی‌شود. | برای هر exporter جدید از helper مشترک استفاده شود و یک تست با `=HYPERLINK(...)` به suite اضافه شود. |
| SEC-12 | متوسط | رفع شد (CDR پیاده نشده) | `server/src/routes/applications.ts:676-840` و `server/src/routes/complaints.ts:193-258` | فایل‌ها با MIME و signature ابتدایی بررسی می‌شوند، اما اسکن malware/AV، quota per-user و محدودیت نرخ مخصوص upload وجود ندارد؛ ZIP/KML نیز بدون تحلیل downstream ذخیره می‌شوند. مهاجم مجاز می‌تواند فضای دیسک را پر یا فایل خطرناک را برای کاربر دیگر آماده کند. | quota روزانه/کاربر، محدودیت هم‌زمانی، cleanup فایل orphan، اسکن AV/CDR و نگهداری خارج از web root اضافه شود؛ ZIP را در هیچ worker بدون محدودیت extract نکنید. **وضعیت فعلی:** `server/src/upload-security.ts` برای `applications.ts` و `complaints.ts`: limiter، همزمانی، سهمیهٔ مشترک، بررسی ZIP/KML، ClamAV الزامی در production، پاک‌سازی یتیم‌ها در هر دو پوشه. |
| SEC-13 | متوسط | رفع شد | `server/src/routes/auth.ts:101-155` و `server/src/rate-limit.ts:35-39` | شکست MFA در شمارنده `failed_login_count` حساب وارد نمی‌شود و حفاظت اصلی به limiter in-memory/IP وابسته است؛ brute-force توزیع‌شده روی OTP/MFA امکان‌پذیرتر می‌شود. | شمارنده اتمیک per-user و per-factor، قفل موقت با backoff، ثبت security event و store مشترک اضافه شود؛ کد بازیابی پس از مصرف حذف شود (کد فعلی این بخش را انجام می‌دهد). **وضعیت فعلی:** شکست MFA به `failed_login_count`/قفل حساب اضافه شد و سقف per-identifier در `routes/auth.ts`. |
| SEC-14 | متوسط | نیمه‌رفع | `server/src/routes/auth.ts:107-110` | شرط lock قبل از افزایش شمارنده ارزیابی می‌شود؛ بنابراین قفل ۱۵ دقیقه‌ای در پنجمین شکست رخ می‌دهد، نه چهارمین. همچنین مقایسه password برای کاربر موجود با کاربر ناموجود زمان متفاوت دارد. | threshold را با update اتمیک دقیق کنید، برای کاربر ناموجود dummy bcrypt compare انجام دهید، و پیام/زمان پاسخ را در تست black-box مقایسه کنید. **وضعیت فعلی:** مقایسهٔ dummy bcrypt برای حساب ناموجود اضافه شد؛ آستانهٔ قفل هنوز در پنجمین شکست است. |
| SEC-15 | متوسط | رفع شد | `server/src/routes/admin.ts:709-747` | ادمین می‌تواند کاربر با نقش دلخواه (حتی admin) و temporary password بسازد؛ MFA مدیر و ثبت activation/force-change در همین مسیر اجباری نیست و mobile اختیاری است، در حالی که UI عمومی phone-first است. | ایجاد/تغییر نقش حساس را به MFA مدیر، approval دوم، دعوت یک‌بارمصرف و `must_change_password` متصل کنید؛ برای staff شماره تأییدشده یا مسیر legacy email صریح فراهم شود؛ ایجاد admin جدید audit و alert جدا داشته باشد. **وضعیت فعلی:** `routes/admin.ts`: رمز دعوت تولیدشده توسط سرور، `must_change_password=1`، اجبار MFA مدیر (`REQUIRE_ADMIN_MFA`)، step-up TOTP برای ساخت/تغییر نقش admin، هشدار security_event. |
| SEC-16 | متوسط | رفع شد | `client/src/App.tsx:1445-1502` و `client/src/StructuredApplicationFields.tsx:22-55` | پیش‌نویس فرم، از جمله مشخصات ملک و ذی‌نفعان، در `localStorage` ذخیره می‌شود. این داده با پاک‌کردن نشست حذف نمی‌شود و هر script همان origin به آن دسترسی دارد. | پیش‌نویس را فقط پس از opt-in و با TTL کوتاه نگه دارید، فیلدهای هویتی را ذخیره نکنید، هنگام logout/submit پاک کنید و برای داده حساس از IndexedDB رمزنگاری‌شده با کلید session یا عدم ذخیره استفاده کنید. **وضعیت فعلی:** `client/src/drafts.ts`: فقط allow-list چهار فیلد غیرهویتی؛ نام/پلاک/ذی‌نفع/متن آزاد ذخیره نمی‌شود؛ TTL دو ساعت؛ پاک‌سازی فقط در logout/ثبت/انقضا. |
| SEC-17 | متوسط | رفع شد (نیازمند DB_SSL) | `server/src/db.ts:7-20` | اتصال MySQL گزینه TLS/CA ندارد؛ در XAMPP loopback کم‌خطر است، اما DB remote بدون TLS می‌تواند credential و اطلاعات پرونده را در مسیر شبکه افشا کند. | در production `ssl` با CA pinning/verify identity اجباری، DB روی private network و حساب کم‌اختیار استفاده شود. **وضعیت فعلی:** `db.ts`/`config.ts`: TLS با تأیید گواهی؛ DB غیرمحلی در production بدون `DB_SSL=true` راه‌اندازی نمی‌شود. |
| SEC-18 | متوسط | نیمه‌رفع | `server/src/security.ts:67-105` | زنجیره audit فقط payload هش‌شده را نگه می‌دارد و trigger append-only برای `audit_logs` ندارد؛ DBA یا دسترسی مستقیم می‌تواند ستون‌های row یا کل زنجیره را تغییر دهد. | مجوز DB را از UPDATE/DELETE audit جدا کنید، trigger append-only/anchor دوره‌ای خارج DB و هش شامل تمام فیلدهای حساس row اضافه کنید؛ restore و retention نیز audit شود. **وضعیت فعلی:** trigger فقط‑افزودنی، هش کامل ردیف (IP/UA) با `entry_payload`، anchor ساعتی و `npm run audit:verify`؛ مجوزهای DB و `AUDIT_ANCHOR_URL` باید در استقرار تنظیم شوند. |
| SEC-19 | کم | رفع شد | `server/src/app.ts:55-69` | `/api/health` برای unauthenticated caller وضعیت `database` و `environment` را برمی‌گرداند. برای health-check مفید است اما fingerprint سطح پایین ایجاد می‌کند. | liveness عمومی را به `{status:"ok"}` محدود و readiness/database detail را فقط روی شبکه داخلی یا با auth ارائه کنید. **وضعیت فعلی:** `/api/health` فقط `{status}`؛ جزئیات در `/api/health/details` با `HEALTH_DETAILS_TOKEN`. |
| SEC-20 | کم | رفع شد | `server/src/routes/auth.ts:115-123` و `server/src/request-context.ts:10-29` | identifier کامل login ناموفق و IP در audit/request log ذخیره می‌شود؛ این داده برای تشخیص حمله مفید است اما PII/اطلاعات قابل شناسایی را زیاد نگه می‌دارد. | identifier را HMAC/truncate کنید، retention و دسترسی log را محدود و export آن را audit کنید. **وضعیت فعلی:** audit ورود ناموفق: HMAC + شناسهٔ ماسک‌شده؛ identifier کامل ذخیره نمی‌شود. |
| SEC-21 | زیاد | رفع شد | `server/src/routes/admin.ts`، `server/src/routes/integrations.ts`، `server/src/routes/internal-controls.ts`، `server/src/access.ts` | پیش از اصلاح، برخی exportها و auditها فقط به capability عمومی داشبورد تکیه داشتند و مسیرهای read-only ناظر در همه routerهای حساس به‌صورت صریح یکسان نبودند؛ این امر ماتریس دسترسی را شکننده و export داده عملیاتی را بیش از حد گسترده می‌کرد. | `reports.export` برای SLA/operations و `audit.read` برای audit log به‌صورت route-level enforce شدند؛ نقش‌های عملیات/فنی که در UI audit مجازند capability لازم دارند؛ integrations و internal-controls middleware ناظر را صریحاً enforce می‌کنند؛ audit/service/incident/dashboard و CSVهای ناظر projection کمینه دارند. |
| SEC-22 | زیاد | رفع شد | `server/src/routes/complaints.ts` و `server/src/complaint-access.ts` | پشتیبان می‌توانست فهرست، پیوست یا تغییر وضعیت شکایت assigned به پشتیبان دیگری را با شناسه مستقیم مشاهده/تغییر دهد. | پشتیبانی فقط صف بدون مسئول یا شکایت assigned خودش را می‌بیند و تغییر می‌دهد؛ compliance/operations_manager/admin دسترسی مدیریتی دارند؛ کنترل در list، attachment read/upload/download و update یکسان است و آزمون policy مستقل دارد. |
| SEC-23 | زیاد | رفع شد | `server/src/routes/applications.ts` و `server/src/observer-data.ts` | finance و support پس از عبور از کنترل رابطه‌ای، جزئیات کامل رمزگشایی‌شده ملک، فرم، طرف‌ها و مدارک پرونده را دریافت می‌کردند؛ این با حداقل دسترسی نقش‌ها سازگار نبود. | projection `restrictedApplicationDetail` برای finance و support فعال شد؛ داده هویتی/فرم/نشانی/طرف‌ها و گزارش‌ها حذف، مدارک بسیار محرمانه برای support فیلتر، و پرداخت فقط برای finance نگه داشته می‌شود. آزمون redaction به suite اضافه شد. |
| SEC-24 | متوسط | رفع شد | `server/src/routes/operations.ts:1223-1278` | ثبت تعامل پشتیبانی می‌توانست `applicantId` دلخواه یا ناسازگار با `applicationId` را در سابقه داخلی ثبت کند و رابطه داده را مخدوش کند. | شناسه پرونده و متقاضی با query جدا اعتبارسنجی و متقاضی پرونده به‌صورت قطعی derive می‌شود؛ شناسه مستقل فقط برای نقش applicant/representative پذیرفته می‌شود. |

## کنترل‌های بررسی‌شده که فعلاً قابل اتکا هستند

- همه queryهای مورد بررسی با placeholder اجرا می‌شوند؛ `normalizeRequestValue` فقط objectهای معمولی را بازسازی می‌کند و prototypeهای ناشناخته را پردازش نمی‌کند.
- `helmet` و `x-powered-by` غیرفعال فعال‌اند؛ پاسخ خطای عمومی جزئیات exception را به client نمی‌دهد.
- `applicationSchema`، schemaهای service، pagination و کنترل role/capability ورودی‌ها را محدود می‌کنند.
- `storageFilename` نام opaque تصادفی می‌سازد، `safeStoragePath` traversal را رد می‌کند و signature فایل با MIME مقایسه می‌شود.
- داده‌های ملی/آدرس/فرم پرونده با AES-GCM و جست‌وجوی یکتا با blind index ذخیره می‌شوند؛ کلید production باید مستقل از JWT باشد.
- تاریخچه وضعیت پرونده trigger حذف را مسدود می‌کند و تغییرات حساس audit می‌شوند.
- کوئری login شامل `u.mfa_recovery_codes` است (`server/src/routes/auth.ts:95-97`) و recovery code مصرف‌شده در مسیر MFA حذف می‌شود.

## ماتریس endpointهای حساس و آزمون IDOR

| دامنه | نقش‌های مجاز مشاهده | نقش‌های مجاز تغییر | کنترل مالکیت/تفکیک |
|---|---|---|---|
| پرونده، سند و پیام | مالک/نماینده، کارشناس ارجاع‌شده، پشتیبانِ تیکت باز، مالیِ دارای پرداخت، عملیات، تطبیق، مدیر، ناظرِ redacted | مالک در وضعیت مجاز، کارشناس در ارجاع فعال، عملیات/تطبیق/مدیر بر اساس workflow | `userCanAccessApplication`، assignment/ticket/payment facts، archive grant، attachment-to-application check |
| پرداخت و رسید | مالک برای پرونده خود؛ finance/operations/compliance/admin/observer برای داده مجاز | finance/admin و درخواست استرداد مالک/finance/admin | `canAccessPayment`، وضعیت successful برای رسید، observer receipt projection |
| تیکت و شکایت | مالک، supportِ assigned/unassigned queue، عملیات/compliance/admin؛ ناظر برای write ممنوع و مسیرهای پشتیبانی محدود | مالک پاسخ عمومی، support و نقش مدیریتی طبق route | applicant/assignment filters، حذف ناظر از supervisory support paths، middleware read-only |
| audit، export و رخداد | compliance/operations/technical/admin/observer طبق capability؛ خروجی فقط `reports.export` | review رخداد فقط compliance/admin | `audit.read`/`reports.export` route guards، observerAuditLog/CSV redaction |
| internal-controls و integrations | نقش دارای `internal_controls.read`/`registry.read` | نقش‌های explicit authorize و capability مربوط | authenticate + observer read-only؛ IDهای داخلی با query پارامتری |

آزمون policy/IDOR در `server/src/access-matrix.test.ts`، `complaint-access.test.ts`، `page-12.test.ts`، `page23.test.ts`، `page32.test.ts`، `security-features.test.ts` و `observer-data.test.ts` اجرا شد. آزمون زنده با دو متقاضی و نقش‌های staff روی MariaDB سازگار با XAMPP در محیط ایزوله انجام شد؛ detail، document download، payment quote، ticket scope، observer write و redaction بررسی شدند.

## اعتبارسنجی انجام‌شده

در همین checkout، پس از اصلاحات این ممیزی:

```text
npm run typecheck             PASS — server و client
npm run lint                  PASS — server و client
npm test                      PASS — server: 18 فایل/90 تست، client: 10 فایل/23 تست
npm run build                 PASS — TypeScript و Vite production build
bash -n database/backup.sh database/restore.sh database/setup-xampp.sh database/migrate.sh database/validate-schema.sh  PASS
npm run db:check             PASS — ۴۲ جدول canonical و ۱۳ migration بررسی ایستا شد
npm audit --omit=dev --offline PASS — 0 vulnerability در cache محلی

production config gate        PASS — تنظیمات محلی ناامن با exit غیرصفر رد شد؛ تنظیمات آزمایشی HTTPS/secret/DB معتبر با `TRUST_PROXY=false` parse شد.
```

`npm run security:scan` در اجرای نهایی با registry در دسترس موفق شد و `found 0 vulnerabilities`، typecheck، lint، تست‌های server/client و `db:check` را ثبت کرد. این نتیجه جایگزین penetration test مجاز روی staging نیست.

در اجرای ۱۱ اوت ۲۰۲۶، schema/seed/migration روی MariaDB ایزوله پورت `3307` با `npm run db:setup:xampp` و `npm run db:validate` موفق شد؛ health API، role matrix و سناریوهای E2E اصلی نیز Pass شدند. XAMPP daemon اصلی به‌دلیل نیاز به root از این محیط start نشد و باید روی مقصد جداگانه تأیید شود. هیچ تست نفوذ روی اینترنت یا داده واقعی انجام نشده است.

## حداقل gate پیش از deploy

1. `NODE_ENV=production` با fail-fast برای secretهای پیش‌فرض، `FIELD_ENCRYPTION_KEY` مستقل ۶۴ hex، DB non-root با رمز قوی، `CLIENT_ORIGIN=https://...` و `TRUST_PROXY` مطابق توپولوژی تنظیم شود.
2. seed توسعه اجرا نشود؛ حساب bootstrap تصادفی ساخته، رمزها rotate، MFA مدیر فعال، و همه حساب‌های آزمایشی حذف/تعلیق شوند.
3. MySQL TLS/private network، backup authenticated، restore در staging و آزمون checksum/path-traversal انجام شود.
4. rate-limit توزیع‌شده، upload quota/AV، session revocation و CSRF cookie design تکمیل شود.
5. تست نفوذ مجاز شامل IDOR بین دو applicant/support، role downgrade با token قبلی، brute-force login/MFA، upload polyglot/ZIP، CSV formula، restore archive و آزمون چند replica اجرا و evidence آن به این فایل افزوده شود.

این گزارش تأییدیه امنیت production یا مجوز نفوذ نیست؛ وضعیت هر مورد فقط بر اساس شواهد کد و آزمون‌های محلی بالا ثبت شده است.
