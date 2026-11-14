USE regbroker;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS person_type ENUM('individual','legal') NOT NULL DEFAULT 'individual' AFTER mobile,
  ADD COLUMN IF NOT EXISTS organization_name VARCHAR(190) NULL AFTER person_type,
  ADD COLUMN IF NOT EXISTS organization_national_id VARCHAR(11) NULL AFTER organization_name;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS allowed_roles JSON NULL AFTER workflow,
  ADD COLUMN IF NOT EXISTS automatic_messages JSON NULL AFTER allowed_roles;

UPDATE services SET allowed_roles=JSON_ARRAY('applicant','representative'),automatic_messages=JSON_ARRAY() WHERE allowed_roles IS NULL OR automatic_messages IS NULL;

ALTER TABLE applications
  MODIFY applicant_capacity ENUM('owner','attorney','legal_representative','company_manager','heir','occupant','beneficiary','other') NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL AFTER closed_at;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS sensitivity ENUM('normal','confidential','highly_confidential') NOT NULL DEFAULT 'confidential' AFTER version;

CREATE TABLE IF NOT EXISTS user_consents (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  consent_type ENUM('terms','privacy','data_accuracy') NOT NULL,
  document_version VARCHAR(30) NOT NULL,
  ip_address VARCHAR(45) NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_consent_version (user_id,consent_type,document_version),
  CONSTRAINT fk_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS retention_policies (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  data_category VARCHAR(80) NOT NULL UNIQUE,
  retention_months SMALLINT UNSIGNED NOT NULL,
  legal_basis VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignment_transfer_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  current_assignment_id BIGINT UNSIGNED NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  proposed_expert_id BIGINT UNSIGNED NULL,
  reason VARCHAR(2000) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decided_by BIGINT UNSIGNED NULL,
  decision_note VARCHAR(2000) NULL,
  decided_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transfer_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_transfer_assignment FOREIGN KEY (current_assignment_id) REFERENCES assignments(id),
  CONSTRAINT fk_transfer_requester FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_transfer_proposed FOREIGN KEY (proposed_expert_id) REFERENCES users(id),
  CONSTRAINT fk_transfer_decider FOREIGN KEY (decided_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refund_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  status ENUM('pending','approved','rejected','processed') NOT NULL DEFAULT 'pending',
  decided_by BIGINT UNSIGNED NULL,
  decision_note VARCHAR(2000) NULL,
  decided_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_refund_requester FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_refund_decider FOREIGN KEY (decided_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_interactions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  applicant_id BIGINT UNSIGNED NULL,
  application_id BIGINT UNSIGNED NULL,
  channel ENUM('phone','email','chat','in_person') NOT NULL,
  subject VARCHAR(180) NOT NULL,
  summary TEXT NOT NULL,
  handled_by BIGINT UNSIGNED NOT NULL,
  quality_score TINYINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_interaction_applicant FOREIGN KEY (applicant_id) REFERENCES users(id),
  CONSTRAINT fk_interaction_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_interaction_handler FOREIGN KEY (handled_by) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT IGNORE INTO retention_policies (data_category,retention_months,legal_basis) VALUES
('identity',120,'الزامات قانونی نگهداری سوابق هویتی پرونده'),
('applications',120,'الزامات بایگانی پرونده‌های ثبتی'),
('audit_logs',120,'الزامات بازرسی، امنیت و پاسخ‌گویی'),
('support',36,'پایش کیفیت و رسیدگی به شکایات');

ALTER TABLE applications ADD INDEX IF NOT EXISTS idx_applications_archived (archived_at, status);
ALTER TABLE assignment_transfer_requests ADD INDEX IF NOT EXISTS idx_transfer_status_created (status, created_at);
ALTER TABLE assignment_transfer_requests ADD INDEX IF NOT EXISTS idx_transfer_application (application_id, status);
ALTER TABLE refund_requests ADD INDEX IF NOT EXISTS idx_refund_status_created (status, created_at);
ALTER TABLE refund_requests ADD INDEX IF NOT EXISTS idx_refund_payment (payment_id, status);
ALTER TABLE support_interactions ADD INDEX IF NOT EXISTS idx_interaction_created (created_at);
ALTER TABLE support_interactions ADD INDEX IF NOT EXISTS idx_interaction_application (application_id, created_at);
