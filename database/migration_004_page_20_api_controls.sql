USE regbroker;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS api_payload_fields JSON NULL AFTER api_code;

ALTER TABLE integration_jobs
  ADD COLUMN IF NOT EXISTS payload_sha256 CHAR(64) NULL AFTER encrypted_payload;

UPDATE integration_jobs
SET status='dead_letter',last_error='MIGRATION_REQUEUE_REQUIRED'
WHERE payload_sha256 IS NULL AND status IN ('queued','processing','failed');

UPDATE integration_jobs
SET payload_sha256=SHA2(COALESCE(encrypted_payload,''),256)
WHERE payload_sha256 IS NULL;

ALTER TABLE integration_jobs
  MODIFY COLUMN payload_sha256 CHAR(64) NOT NULL;

ALTER TABLE api_logs
  ADD COLUMN IF NOT EXISTS request_payload_sha256 CHAR(64) NULL AFTER error_code,
  ADD COLUMN IF NOT EXISTS response_body_sha256 CHAR(64) NULL AFTER request_payload_sha256,
  ADD COLUMN IF NOT EXISTS response_content_type VARCHAR(120) NULL AFTER response_body_sha256;
