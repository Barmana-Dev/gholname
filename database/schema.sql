CREATE DATABASE IF NOT EXISTS regbroker CHARACTER SET utf8mb4 COLLATE utf8mb4_persian_ci;
USE regbroker;

CREATE TABLE roles (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL UNIQUE,
  title_fa VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id SMALLINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  national_id VARCHAR(255) NULL,
  national_id_hash CHAR(64) NULL UNIQUE,
  email VARCHAR(190) NULL UNIQUE,
  mobile VARCHAR(11) NULL UNIQUE,
  mobile_verified_at DATETIME NULL,
  person_type ENUM('individual','legal') NOT NULL DEFAULT 'individual',
  organization_name VARCHAR(190) NULL,
  organization_national_id VARCHAR(255) NULL,
  organization_national_id_hash CHAR(64) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  mfa_last_step BIGINT UNSIGNED NULL,
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  mfa_secret_encrypted TEXT NULL,
  mfa_pending_secret_encrypted TEXT NULL,
  mfa_recovery_codes JSON NULL,
  status ENUM('active','suspended','pending') NOT NULL DEFAULT 'active',
  failed_login_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE user_sessions (
  jti CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  INDEX idx_user_sessions_user (user_id, revoked_at),
  INDEX idx_user_sessions_expiry (expires_at),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE organization_profile (
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

CREATE TABLE services (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL UNIQUE,
  title_fa VARCHAR(180) NOT NULL,
  category ENUM('legal','technical') NOT NULL,
  description TEXT NOT NULL,
  requirements JSON NOT NULL,
  workflow JSON NOT NULL,
  allowed_roles JSON NULL,
  automatic_messages JSON NULL,
  fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0,
  legal_fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0,
  service_fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0,
  requirements_version VARCHAR(30) NOT NULL DEFAULT 'draft-1',
  api_code VARCHAR(80) NULL,
  api_payload_fields JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE applications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  file_number VARCHAR(32) NOT NULL UNIQUE,
  registry_tracking_id VARCHAR(100) NULL UNIQUE,
  applicant_id BIGINT UNSIGNED NOT NULL,
  service_id SMALLINT UNSIGNED NOT NULL,
  applicant_capacity ENUM('owner','attorney','legal_representative','company_manager','heir','occupant','beneficiary','other') NOT NULL DEFAULT 'owner',
  status ENUM('draft','submitted','initial_review','documents_deficient','awaiting_applicant','completed_documents','awaiting_payment','paid','assigned_registry_expert','assigned_surveyor','under_expert_review','additional_action','ready_to_send','registry_exchange','awaiting_registry','registry_return_deficient','correcting_registry_deficiency','completed','closed_incomplete','out_of_scope','stopped_legal_technical','stopped_security','cancelled_by_applicant','referred_complaint') NOT NULL DEFAULT 'draft',
  risk_level ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
  form_data JSON NOT NULL,
  declaration_accepted_at DATETIME NULL,
  submitted_at DATETIME NULL,
  closed_at DATETIME NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_applications_applicant_status (applicant_id, status),
  INDEX idx_applications_duplicate (applicant_id,service_id,created_at,status),
  INDEX idx_applications_service_status (service_id, status),
  INDEX idx_applications_archive_catalog (archived_at,service_id,status,applicant_id,file_number),
  CONSTRAINT fk_applications_applicant FOREIGN KEY (applicant_id) REFERENCES users(id),
  CONSTRAINT fk_applications_service FOREIGN KEY (service_id) REFERENCES services(id)
) ENGINE=InnoDB;

CREATE TABLE properties (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  province VARCHAR(100) NOT NULL,
  county VARCHAR(100) NOT NULL,
  registry_section VARCHAR(60) NOT NULL,
  main_plate VARCHAR(50) NOT NULL,
  sub_plate VARCHAR(50) NULL,
  parcel VARCHAR(50) NULL,
  address TEXT NOT NULL,
  postal_code CHAR(10) NULL,
  property_type VARCHAR(80) NOT NULL,
  deed_type VARCHAR(80) NULL,
  area DECIMAL(15,2) NULL,
  coordinates JSON NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_properties_duplicate (application_id,registry_section,main_plate),
  INDEX idx_properties_archive_catalog (application_id,province,county,registry_section,main_plate,sub_plate),
  CONSTRAINT fk_properties_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE application_parties (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  party_type ENUM('owner','beneficiary','attorney','claimant','related_party') NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  national_id VARCHAR(255) NULL,
  national_id_hash CHAR(64) NULL,
  share_description VARCHAR(120) NULL,
  contact_data JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_parties_national_hash (national_id_hash),
  CONSTRAINT fk_parties_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE documents (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  document_type VARCHAR(80) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  original_sha256 CHAR(64) NULL,
  version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  sensitivity ENUM('normal','confidential','highly_confidential') NOT NULL DEFAULT 'confidential',
  review_status ENUM('received','deficient','rejected','needs_revision','initially_accepted') NOT NULL DEFAULT 'received',
  review_note TEXT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_documents_application (application_id, document_type, version),
  INDEX idx_documents_application_active (application_id,document_type,deleted_at,version),
  CONSTRAINT fk_documents_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_documents_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE assignments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  expert_id BIGINT UNSIGNED NOT NULL,
  assignment_type ENUM('registry_legal','survey','compliance','financial') NOT NULL,
  assigned_by BIGINT UNSIGNED NOT NULL,
  note TEXT NULL,
  accepted_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assignments_application_active (application_id,expert_id,completed_at),
  CONSTRAINT fk_assignments_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_assignments_expert FOREIGN KEY (expert_id) REFERENCES users(id),
  CONSTRAINT fk_assignments_assigner FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE status_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(50) NULL,
  to_status VARCHAR(50) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  note TEXT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status_history_application_status (application_id,to_status,created_at),
  CONSTRAINT fk_status_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_status_user FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB;

DELIMITER $$
CREATE TRIGGER prevent_status_history_delete
BEFORE DELETE ON status_history
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Original application history is immutable';
END$$
DELIMITER ;

CREATE TABLE messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NULL,
  message_type ENUM('system','support','deficiency','deadline','document_receipt','payment','general') NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  attachment_document_id BIGINT UNSIGNED NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_application_created (application_id,created_at),
  CONSTRAINT fk_messages_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id),
  CONSTRAINT fk_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users(id),
  CONSTRAINT fk_messages_document FOREIGN KEY (attachment_document_id) REFERENCES documents(id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  amount_rials BIGINT UNSIGNED NOT NULL,
  legal_fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0,
  service_fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0,
  gateway VARCHAR(50) NOT NULL,
  authority VARCHAR(120) NULL UNIQUE,
  transaction_id VARCHAR(120) NULL UNIQUE,
  receipt_number VARCHAR(40) NULL UNIQUE,
  status ENUM('pending','successful','failed','refunded') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payments_application_status (application_id,status,created_at),
  CONSTRAINT fk_payments_application FOREIGN KEY (application_id) REFERENCES applications(id)
) ENGINE=InnoDB;

CREATE TABLE complaints (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tracking_code VARCHAR(32) NOT NULL UNIQUE,
  applicant_id BIGINT UNSIGNED NULL,
  application_id BIGINT UNSIGNED NULL,
  category ENUM('service','staff','off_platform_payment','impersonation','privacy','other') NOT NULL,
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
  status ENUM('received','under_review','answered','closed') NOT NULL DEFAULT 'received',
  assigned_to BIGINT UNSIGNED NULL,
  response TEXT NULL,
  response_due_at DATETIME NULL,
  first_response_at DATETIME NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_complaints_applicant_status (applicant_id,status,created_at),
  INDEX idx_complaints_sla (status,response_due_at),
  CONSTRAINT fk_complaints_applicant FOREIGN KEY (applicant_id) REFERENCES users(id),
  CONSTRAINT fk_complaints_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_complaints_assignee FOREIGN KEY (assigned_to) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(80) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  metadata JSON NULL,
  previous_hash CHAR(64) NULL,
  entry_hash CHAR(64) NOT NULL,
  entry_payload MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_actor_time (actor_id, created_at),
  INDEX idx_audit_actor_action_time (actor_id,action,created_at),
  INDEX idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Append-only: rows can be added, never changed or removed through SQL.
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';

CREATE TABLE audit_anchors (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  last_audit_id BIGINT UNSIGNED NOT NULL,
  entry_hash CHAR(64) NOT NULL,
  delivered_externally TINYINT(1) NOT NULL DEFAULT 0,
  anchored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_anchors_audit (last_audit_id)
) ENGINE=InnoDB;

CREATE TABLE rate_limit_hits (
  rl_key VARCHAR(190) PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  reset_at DATETIME(3) NOT NULL,
  INDEX idx_rate_limit_reset (reset_at)
) ENGINE=InnoDB;

CREATE TABLE api_request_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id VARCHAR(80) NOT NULL UNIQUE,
  actor_id BIGINT UNSIGNED NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  duration_ms INT UNSIGNED NOT NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_request_actor_time (actor_id,created_at),
  INDEX idx_api_request_status_time (status_code,created_at),
  CONSTRAINT fk_api_request_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE api_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NULL,
  environment ENUM('test','production') NOT NULL,
  service_code VARCHAR(80) NOT NULL,
  request_id VARCHAR(80) NOT NULL UNIQUE,
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  status_code SMALLINT UNSIGNED NULL,
  duration_ms INT UNSIGNED NULL,
  outcome ENUM('queued','success','error','timeout') NOT NULL,
  error_code VARCHAR(80) NULL,
  request_payload_sha256 CHAR(64) NULL,
  response_body_sha256 CHAR(64) NULL,
  response_content_type VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_logs_service_time (service_code,created_at,outcome),
  CONSTRAINT fk_api_application FOREIGN KEY (application_id) REFERENCES applications(id)
) ENGINE=InnoDB;

CREATE TABLE service_health (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  service_code VARCHAR(80) NOT NULL,
  status ENUM('operational','degraded','outage','disabled') NOT NULL,
  response_time_ms INT UNSIGNED NULL,
  error_rate DECIMAL(6,3) NULL,
  details JSON NULL,
  observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_health_service_time (service_code, observed_at)
) ENGINE=InnoDB;

CREATE TABLE support_tickets (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tracking_code VARCHAR(32) NOT NULL UNIQUE,
  applicant_id BIGINT UNSIGNED NOT NULL,
  application_id BIGINT UNSIGNED NULL,
  subject VARCHAR(180) NOT NULL,
  category ENUM('guidance','technical','documents','payment','status','other') NOT NULL,
  priority ENUM('normal','high','urgent') NOT NULL DEFAULT 'normal',
  status ENUM('open','assigned','waiting_applicant','answered','closed') NOT NULL DEFAULT 'open',
  assigned_to BIGINT UNSIGNED NULL,
  first_response_at DATETIME NULL,
  closed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tickets_application_status (application_id,status,assigned_to,updated_at),
  CONSTRAINT fk_tickets_applicant FOREIGN KEY (applicant_id) REFERENCES users(id),
  CONSTRAINT fk_tickets_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_tickets_assignee FOREIGN KEY (assigned_to) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE ticket_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ticket_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id),
  CONSTRAINT fk_ticket_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE expert_reports (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  expert_id BIGINT UNSIGNED NOT NULL,
  report_type ENUM('initial_review','registry_legal','survey','compliance','risk') NOT NULL,
  result ENUM('accepted','deficient','rejected','needs_second_review') NOT NULL,
  body TEXT NOT NULL,
  signed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reports_application_result (application_id,result,created_at),
  CONSTRAINT fk_reports_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_reports_expert FOREIGN KEY (expert_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  application_id BIGINT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  channel ENUM('in_app','sms','email') NOT NULL DEFAULT 'in_app',
  delivery_status ENUM('queued','sent','failed','read') NOT NULL DEFAULT 'queued',
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_notifications_application FOREIGN KEY (application_id) REFERENCES applications(id)
) ENGINE=InnoDB;

CREATE TABLE risk_reviews (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  reviewer_id BIGINT UNSIGNED NOT NULL,
  conflict_of_interest TINYINT(1) NOT NULL DEFAULT 0,
  suspicious_document TINYINT(1) NOT NULL DEFAULT 0,
  identity_mismatch TINYINT(1) NOT NULL DEFAULT 0,
  off_platform_payment TINYINT(1) NOT NULL DEFAULT 0,
  level ENUM('low','medium','high','critical') NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_risk_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_risk_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE system_incidents (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  incident_code VARCHAR(32) NOT NULL UNIQUE,
  service_code VARCHAR(80) NOT NULL,
  severity ENUM('minor','major','critical') NOT NULL,
  title VARCHAR(180) NOT NULL,
  started_at DATETIME NOT NULL,
  resolved_at DATETIME NULL,
  root_cause TEXT NULL,
  corrective_action TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_incidents_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE announcements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  category ENUM('regulation','service','maintenance','security','general') NOT NULL DEFAULT 'general',
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_announcements_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE user_consents (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  consent_type ENUM('terms','privacy','data_accuracy') NOT NULL,
  document_version VARCHAR(30) NOT NULL,
  ip_address VARCHAR(45) NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_consent_version (user_id,consent_type,document_version),
  CONSTRAINT fk_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE verification_otps (
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

CREATE TABLE retention_policies (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  data_category VARCHAR(80) NOT NULL UNIQUE,
  retention_months SMALLINT UNSIGNED NOT NULL,
  legal_basis VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE archive_access_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  access_mode ENUM('view','export') NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  valid_until DATETIME NOT NULL,
  status ENUM('pending','approved','rejected','revoked') NOT NULL DEFAULT 'pending',
  decided_by BIGINT UNSIGNED NULL,
  decision_note VARCHAR(2000) NULL,
  decided_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_archive_access_lookup (application_id,requested_by,status,valid_until),
  INDEX idx_archive_access_pending (status,created_at),
  CONSTRAINT fk_archive_access_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_archive_access_requester FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_archive_access_decider FOREIGN KEY (decided_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE assignment_transfer_requests (
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
  INDEX idx_transfer_status_created (status, created_at),
  INDEX idx_transfer_application (application_id, status),
  CONSTRAINT fk_transfer_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_transfer_assignment FOREIGN KEY (current_assignment_id) REFERENCES assignments(id),
  CONSTRAINT fk_transfer_requester FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_transfer_proposed FOREIGN KEY (proposed_expert_id) REFERENCES users(id),
  CONSTRAINT fk_transfer_decider FOREIGN KEY (decided_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE refund_requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  status ENUM('pending','approved','rejected','processed') NOT NULL DEFAULT 'pending',
  decided_by BIGINT UNSIGNED NULL,
  decision_note VARCHAR(2000) NULL,
  decided_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_refund_status_created (status, created_at),
  INDEX idx_refund_payment (payment_id, status),
  CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_refund_requester FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_refund_decider FOREIGN KEY (decided_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE support_interactions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  applicant_id BIGINT UNSIGNED NULL,
  application_id BIGINT UNSIGNED NULL,
  channel ENUM('phone','email','chat','ticket','sms','in_person') NOT NULL,
  subject VARCHAR(180) NOT NULL,
  summary TEXT NOT NULL,
  response_text TEXT NULL,
  outcome ENUM('resolved','follow_up','referred','complaint_registered') NOT NULL DEFAULT 'follow_up',
  duration_seconds INT UNSIGNED NULL,
  handled_by BIGINT UNSIGNED NOT NULL,
  referred_to BIGINT UNSIGNED NULL,
  quality_score TINYINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_interaction_created (created_at),
  INDEX idx_interaction_application (application_id, created_at),
  CONSTRAINT fk_interaction_applicant FOREIGN KEY (applicant_id) REFERENCES users(id),
  CONSTRAINT fk_interaction_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_interaction_handler FOREIGN KEY (handled_by) REFERENCES users(id),
  CONSTRAINT fk_interaction_referred_to FOREIGN KEY (referred_to) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE complaint_attachments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  complaint_id BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  original_sha256 CHAR(64) NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_complaint_attachments (complaint_id,created_at),
  CONSTRAINT fk_complaint_attachment_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id),
  CONSTRAINT fk_complaint_attachment_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE integration_jobs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NULL,
  service_code VARCHAR(80) NOT NULL,
  environment ENUM('test','production') NOT NULL,
  request_id VARCHAR(80) NOT NULL UNIQUE,
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  encrypted_payload LONGTEXT NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
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

CREATE TABLE security_events (
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

CREATE TABLE backup_runs (
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

CREATE TABLE review_approvals (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  report_id BIGINT UNSIGNED NOT NULL,
  reviewer_id BIGINT UNSIGNED NOT NULL,
  decision ENUM('approved','rejected') NOT NULL,
  note VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_report_reviewer (report_id,reviewer_id),
  INDEX idx_review_approvals_report_decision (report_id,decision),
  CONSTRAINT fk_review_application FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_review_report FOREIGN KEY (report_id) REFERENCES expert_reports(id),
  CONSTRAINT fk_review_user FOREIGN KEY (reviewer_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE staff_control_attestations (
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

CREATE TABLE periodic_case_reviews (
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

CREATE TABLE access_review_campaigns (
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

CREATE TABLE access_review_items (
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

CREATE TABLE internal_control_audits (
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

CREATE TABLE control_evidence (
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
