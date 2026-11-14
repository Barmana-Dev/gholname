USE regbroker;

CREATE TABLE IF NOT EXISTS organization_profile (
  id TINYINT UNSIGNED PRIMARY KEY,
  legal_name VARCHAR(190) NOT NULL DEFAULT '',
  national_id CHAR(11) NOT NULL DEFAULT '',
  registration_number VARCHAR(20) NOT NULL DEFAULT '',
  activity_subject TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  supervisory_authority TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  document_version VARCHAR(120) NOT NULL,
  publication_status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  published_at DATETIME NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_organization_profile_singleton CHECK (id = 1),
  CONSTRAINT fk_organization_profile_updater FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT INTO organization_profile (
  id,activity_subject,legal_basis,supervisory_authority,plan_type,document_version
) VALUES (
  1,
  'ارائه خدمات در قالب کارگزاری فنی، مهندسی و حقوقی ثبتی',
  'بند پ ماده ۱۱۴ قانون برنامه هفتم پیشرفت جمهوری اسلامی ایران و دستورالعمل مصوب ریاست قوه قضائیه',
  'سازمان ثبت اسناد و املاک کشور / اداره کل کاداستر / معاونت توسعه فناوری و خدمات الکترونیک ثبتی',
  'طرح توجیهی، فنی، اجرایی، حقوقی، عملیاتی و فناورانه برای اخذ پروانه و مجوز فعالیت کارگزاری ثبتی',
  'پیشنهادی جهت ارائه، تکمیل و انطباق با الزامات نهایی سازمان ثبت'
) ON DUPLICATE KEY UPDATE id=VALUES(id);
