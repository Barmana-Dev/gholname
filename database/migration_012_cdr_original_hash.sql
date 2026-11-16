-- CDR keeps only the reconstructed file; the SHA-256 of the file as uploaded is
-- stored for the audit trail.
USE regbroker;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'original_sha256');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE documents ADD COLUMN original_sha256 CHAR(64) NULL AFTER sha256', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'complaint_attachments' AND COLUMN_NAME = 'original_sha256');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE complaint_attachments ADD COLUMN original_sha256 CHAR(64) NULL AFTER sha256', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
