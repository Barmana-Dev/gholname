USE regbroker;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS legal_fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER fee_rials,
  ADD COLUMN IF NOT EXISTS service_fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER legal_fee_rials;

UPDATE services
SET service_fee_rials=fee_rials
WHERE service_fee_rials=0 AND legal_fee_rials=0 AND fee_rials>0;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS legal_fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER amount_rials,
  ADD COLUMN IF NOT EXISTS service_fee_rials BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER legal_fee_rials,
  ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(40) NULL AFTER transaction_id,
  ADD UNIQUE INDEX IF NOT EXISTS uq_payments_receipt_number (receipt_number),
  ADD INDEX IF NOT EXISTS idx_payments_application_status (application_id,status,created_at);

UPDATE payments
SET service_fee_rials=amount_rials
WHERE service_fee_rials=0 AND legal_fee_rials=0 AND amount_rials>0;

ALTER TABLE support_interactions
  MODIFY channel ENUM('phone','email','chat','ticket','sms','in_person') NOT NULL,
  ADD COLUMN IF NOT EXISTS response_text TEXT NULL AFTER summary,
  ADD COLUMN IF NOT EXISTS outcome ENUM('resolved','follow_up','referred','complaint_registered') NOT NULL DEFAULT 'follow_up' AFTER response_text,
  ADD COLUMN IF NOT EXISTS duration_seconds INT UNSIGNED NULL AFTER outcome,
  ADD COLUMN IF NOT EXISTS referred_to BIGINT UNSIGNED NULL AFTER handled_by,
  ADD CONSTRAINT fk_interaction_referred_to FOREIGN KEY (referred_to) REFERENCES users(id);
