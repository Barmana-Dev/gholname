-- Reference data required in EVERY environment (roles, services, profile,
-- retention policies). Contains no accounts and no credentials.
USE regbroker;
INSERT INTO roles (code, title_fa) VALUES
('applicant','متقاضی'),('representative','نماینده یا وکیل'),('registry_expert','کارشناس ثبتی و حقوقی'),
('surveyor','کارشناس نقشه‌برداری'),('support','پشتیبانی'),('finance','مسئول مالی'),
('operations_manager','مدیر عملیات'),('compliance','مسئول تطبیق'),('technical','مسئول فنی'),
('admin','مدیر سامانه'),('observer','ناظر فقط‌خواندنی سازمان ثبت');

INSERT INTO services (code,title_fa,category,description,requirements,workflow,fee_rials) VALUES
('duplicate-deed','صدور سند مالکیت المثنی','legal','پذیرش و پیگیری درخواست سند المثنی در حدود صلاحیت کارگزاری',JSON_ARRAY('مدارک هویتی','تصویر یا مشخصات سند','مستند علت درخواست'),JSON_ARRAY('draft','submitted','initial_review','assigned_registry_expert','completed'),0),
('booklet-to-cadastral','تبدیل سند دفترچه‌ای به سند حدنگاری','legal','تبدیل سند دفترچه‌ای و پیگیری فرایند حدنگاری',JSON_ARRAY('مدارک هویتی','تصویر سند دفترچه‌ای','مشخصات ملک'),JSON_ARRAY('draft','submitted','initial_review','assigned_registry_expert','registry_exchange','completed'),0),
('land-apartment-subdivision','تفکیک عرصه و آپارتمان','technical','پذیرش مدارک مالکیت، نقشه و بررسی فنی اولیه',JSON_ARRAY('مدارک مالکیت','نقشه','مشخصات پلاک'),JSON_ARRAY('draft','submitted','initial_review','assigned_surveyor','completed'),0),
('merge-partition','تجمیع و افراز','technical','مدیریت چند ملک و ذی‌نفعان و ارجاع فنی',JSON_ARRAY('مدارک مالکیت','مدارک ذی‌نفعان','نقشه‌ها'),JSON_ARRAY('draft','submitted','initial_review','assigned_surveyor','completed'),0),
('property-status-change','تغییر وضعیت املاک','legal','پذیرش و بررسی اولیه مستندات تغییر وضعیت ملک',JSON_ARRAY('مدارک مالکیت','مستندات تغییر وضعیت'),JSON_ARRAY('draft','submitted','initial_review','assigned_registry_expert','completed'),0),
('boundary-determination','تعیین حدود','technical','ثبت موقعیت، کروکی یا نقشه و ارجاع به نقشه‌بردار',JSON_ARRAY('مدارک مالکیت','نقشه یا کروکی','اطلاعات محل'),JSON_ARRAY('draft','submitted','initial_review','assigned_surveyor','completed'),0),
('deed-correction','اصلاح ملک و مندرجات سند مالکیت','legal','ثبت نوع اصلاح و مستندات پشتیبان',JSON_ARRAY('مدارک هویتی','تصویر سند','مدارک پشتیبان'),JSON_ARRAY('draft','submitted','initial_review','assigned_registry_expert','completed'),0),
('occupant-cadastral-deed','سند حدنگاری متصرفان قانونی فاقد سند رسمی','technical','پرونده حساس متصرفان قانونی با کنترل ریسک مضاعف',JSON_ARRAY('مدارک تصرف','نقشه','استشهاد یا مستندات'),JSON_ARRAY('draft','submitted','initial_review','assigned_registry_expert','assigned_surveyor','completed'),0),
('article-10-claim','درج ادعای موضوع ماده ۱۰','legal','پذیرش و پیگیری ادعا بدون تشخیص ماهوی حق',JSON_ARRAY('مدارک هویتی','مشخصات ملک','مستندات ادعا'),JSON_ARRAY('draft','submitted','initial_review','assigned_registry_expert','registry_exchange','completed'),0);

INSERT INTO organization_profile (
  id,activity_subject,legal_basis,supervisory_authority,plan_type,document_version
) VALUES (
  1,
  'ارائه خدمات در قالب کارگزاری فنی، مهندسی و حقوقی ثبتی',
  'بند پ ماده ۱۱۴ قانون برنامه هفتم پیشرفت جمهوری اسلامی ایران و دستورالعمل مصوب ریاست قوه قضائیه',
  'سازمان ثبت اسناد و املاک کشور / اداره کل کاداستر / معاونت توسعه فناوری و خدمات الکترونیک ثبتی',
  'طرح توجیهی، فنی، اجرایی، حقوقی، عملیاتی و فناورانه برای اخذ پروانه و مجوز فعالیت کارگزاری ثبتی',
  'پیشنهادی جهت ارائه، تکمیل و انطباق با الزامات نهایی سازمان ثبت'
);

INSERT INTO retention_policies (data_category,retention_months,legal_basis) VALUES
('identity',120,'الزامات قانونی نگهداری سوابق هویتی پرونده'),
('applications',120,'الزامات بایگانی پرونده‌های ثبتی'),
('audit_logs',120,'الزامات بازرسی، امنیت و پاسخ‌گویی'),
('api_request_logs',24,'ثبت الزامی درخواست API و پاسخ‌گویی امنیتی صفحه ۲۵'),
('support',36,'پایش کیفیت و رسیدگی به شکایات');
