USE regbroker;

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal' AFTER description,
  ADD COLUMN IF NOT EXISTS first_response_at DATETIME NULL AFTER response_due_at;

ALTER TABLE users
  MODIFY COLUMN national_id VARCHAR(255) NULL,
  MODIFY COLUMN organization_national_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS national_id_hash CHAR(64) NULL AFTER national_id,
  ADD COLUMN IF NOT EXISTS organization_national_id_hash CHAR(64) NULL AFTER organization_national_id,
  ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT NULL AFTER mfa_enabled,
  ADD COLUMN IF NOT EXISTS mfa_pending_secret_encrypted TEXT NULL AFTER mfa_secret_encrypted,
  ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSON NULL AFTER mfa_pending_secret_encrypted;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_verified_at DATETIME NULL AFTER mobile;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_national_hash ON users (national_id_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_org_national_hash ON users (organization_national_id_hash);

ALTER TABLE application_parties
  MODIFY COLUMN national_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS national_id_hash CHAR(64) NULL AFTER national_id;
CREATE INDEX IF NOT EXISTS idx_parties_national_hash ON application_parties (national_id_hash);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_document_id BIGINT UNSIGNED NULL AFTER body;

CREATE TABLE IF NOT EXISTS complaint_attachments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  complaint_id BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_complaint_attachments (complaint_id,created_at),
  CONSTRAINT fk_complaint_attachment_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id),
  CONSTRAINT fk_complaint_attachment_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS integration_jobs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NULL,
  service_code VARCHAR(80) NOT NULL,
  environment ENUM('test','production') NOT NULL,
  request_id VARCHAR(80) NOT NULL UNIQUE,
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  encrypted_payload LONGTEXT NOT NULL,
  status ENUM('queued','processing','succeeded','failed','dead_letter') NOT NULL DEFAULT 'queued',
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME NULL,
  last_error VARCHAR(1000) NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_integration_queue (status,available_at),
  CONSTRAINT fk_integration_job_application FOREIGN KEY (application_id) REFERENCES applications(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(80) NOT NULL,
  severity ENUM('low','medium','high','critical') NOT NULL,
  ip_address VARCHAR(45) NULL,
  details JSON NULL,
  status ENUM('open','reviewed','resolved','false_positive') NOT NULL DEFAULT 'open',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_status (status,severity,created_at),
  CONSTRAINT fk_security_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_security_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS backup_runs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  backup_code VARCHAR(40) NOT NULL UNIQUE,
  status ENUM('running','successful','failed','verified') NOT NULL,
  database_file VARCHAR(500) NULL,
  uploads_file VARCHAR(500) NULL,
  checksum_sha256 CHAR(64) NULL,
  size_bytes BIGINT UNSIGNED NULL,
  error_message VARCHAR(1000) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  verified_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  CONSTRAINT fk_backup_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS review_approvals (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  report_id BIGINT UNSIGNED NOT NULL,
  reviewer_id BIGINT UNSIGNED NOT NULL,
  decision ENUM('approved','rejected') NOT NULL,
  note VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_report_reviewer (report_id,reviewer_id),
  CONSTRAINT fk_review_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_review_report FOREIGN KEY (report_id) REFERENCES expert_reports(id),
  CONSTRAINT fk_review_user FOREIGN KEY (reviewer_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS verification_otps (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  mobile VARCHAR(11) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_user_expiry (user_id,expires_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE properties ADD INDEX IF NOT EXISTS idx_properties_duplicate (application_id,registry_section,main_plate);
ALTER TABLE complaints ADD INDEX IF NOT EXISTS idx_complaints_applicant_status (applicant_id,status,created_at);
ALTER TABLE complaints ADD INDEX IF NOT EXISTS idx_complaints_sla (status,response_due_at);
ALTER TABLE expert_reports ADD INDEX IF NOT EXISTS idx_reports_application_result (application_id,result,created_at);

SET @seed_pw = '$2b$12$XsMWKqcR3Q9W1YVCzJdyeOoPDMWAJyTf3sGGnjCxtlQeWVmrwjKX6';
INSERT INTO users (role_id,full_name,email,password_hash,status)
SELECT r.id,'مسئول مالی','finance@regbroker.local',@seed_pw,'active' FROM roles r
WHERE r.code='finance' AND NOT EXISTS (SELECT 1 FROM users WHERE email='finance@regbroker.local');
INSERT INTO users (role_id,full_name,email,password_hash,status)
SELECT r.id,'مدیر عملیات','operations@regbroker.local',@seed_pw,'active' FROM roles r
WHERE r.code='operations_manager' AND NOT EXISTS (SELECT 1 FROM users WHERE email='operations@regbroker.local');
INSERT INTO users (role_id,full_name,email,password_hash,status)
SELECT r.id,'مسئول تطبیق','compliance@regbroker.local',@seed_pw,'active' FROM roles r
WHERE r.code='compliance' AND NOT EXISTS (SELECT 1 FROM users WHERE email='compliance@regbroker.local');
INSERT INTO users (role_id,full_name,email,password_hash,status)
SELECT r.id,'مسئول فنی','technical@regbroker.local',@seed_pw,'active' FROM roles r
WHERE r.code='technical' AND NOT EXISTS (SELECT 1 FROM users WHERE email='technical@regbroker.local');
