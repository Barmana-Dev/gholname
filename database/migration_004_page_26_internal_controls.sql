USE regbroker;

CREATE TABLE IF NOT EXISTS staff_control_attestations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  nda_version VARCHAR(40) NOT NULL,
  nda_signed_at DATETIME NOT NULL,
  training_version VARCHAR(40) NOT NULL,
  training_completed_at DATETIME NOT NULL,
  training_expires_at DATETIME NOT NULL,
  verified_by BIGINT UNSIGNED NOT NULL,
  evidence_reference VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attestation_user_expiry (user_id,training_expires_at),
  CONSTRAINT fk_attestation_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_attestation_verifier FOREIGN KEY (verified_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS periodic_case_reviews (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  reviewer_id BIGINT UNSIGNED NOT NULL,
  outcome ENUM('compliant','follow_up','escalated') NOT NULL,
  conflict_checked TINYINT(1) NOT NULL DEFAULT 0,
  scope_checked TINYINT(1) NOT NULL DEFAULT 0,
  privacy_checked TINYINT(1) NOT NULL DEFAULT 0,
  payment_checked TINYINT(1) NOT NULL DEFAULT 0,
  note TEXT NOT NULL,
  next_review_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_case_review_application_time (application_id,created_at),
  INDEX idx_case_review_due (next_review_at,outcome),
  CONSTRAINT fk_case_review_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_case_review_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS access_review_campaigns (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(180) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_at DATETIME NOT NULL,
  status ENUM('open','completed') NOT NULL DEFAULT 'open',
  created_by BIGINT UNSIGNED NOT NULL,
  completed_by BIGINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_access_campaign_status_due (status,due_at),
  CONSTRAINT fk_access_campaign_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_access_campaign_completer FOREIGN KEY (completed_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS access_review_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role_snapshot VARCHAR(40) NOT NULL,
  activity_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_activity_at DATETIME NULL,
  decision ENUM('pending','retain','restrict','suspend') NOT NULL DEFAULT 'pending',
  decision_note VARCHAR(2000) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  UNIQUE KEY uq_access_review_user (campaign_id,user_id),
  INDEX idx_access_review_pending (campaign_id,decision),
  CONSTRAINT fk_access_item_campaign FOREIGN KEY (campaign_id) REFERENCES access_review_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_access_item_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_access_item_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS internal_control_audits (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  audit_month DATE NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  findings TEXT NOT NULL,
  corrective_actions TEXT NOT NULL,
  inspection_ready TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  owner_id BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_control_audit_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_control_audit_approver FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS control_evidence (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  evidence_type ENUM('technical_document','operational_document','contractor_contract','backup_restore_test','penetration_test') NOT NULL,
  title VARCHAR(180) NOT NULL,
  reference VARCHAR(500) NOT NULL,
  provider_name VARCHAR(180) NULL,
  provider_license VARCHAR(120) NULL,
  effective_at DATE NOT NULL,
  expires_at DATE NULL,
  status ENUM('valid','expired','superseded') NOT NULL DEFAULT 'valid',
  recorded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_control_evidence_type_expiry (evidence_type,status,expires_at),
  CONSTRAINT fk_control_evidence_recorder FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB;
