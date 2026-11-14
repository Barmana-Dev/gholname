USE regbroker;

CREATE TABLE IF NOT EXISTS api_request_logs (
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

CREATE TABLE IF NOT EXISTS archive_access_requests (
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

ALTER TABLE applications
  ADD INDEX IF NOT EXISTS idx_applications_archive_catalog (archived_at,service_id,status,applicant_id,file_number);

ALTER TABLE properties
  ADD INDEX IF NOT EXISTS idx_properties_archive_catalog (application_id,province,county,registry_section,main_plate,sub_plate);

INSERT IGNORE INTO retention_policies (data_category,retention_months,legal_basis)
VALUES ('api_request_logs',24,'ثبت الزامی درخواست API و پاسخ‌گویی امنیتی صفحه ۲۵');
