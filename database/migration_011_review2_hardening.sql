-- Second review round: shared rate-limit counters, append-only audit log with
-- full-row hashing and external anchoring.
USE regbroker;

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  rl_key VARCHAR(190) PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  reset_at DATETIME(3) NOT NULL,
  INDEX idx_rate_limit_reset (reset_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_anchors (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  last_audit_id BIGINT UNSIGNED NOT NULL,
  entry_hash CHAR(64) NOT NULL,
  delivered_externally TINYINT(1) NOT NULL DEFAULT 0,
  anchored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_anchors_audit (last_audit_id)
) ENGINE=InnoDB;

-- Exact hashed payload (version 2 rows: includes IP and user-agent).
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND COLUMN_NAME = 'entry_payload');
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE audit_logs ADD COLUMN entry_payload MEDIUMTEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Append-only: rows can be added, never changed or removed through SQL.
DROP TRIGGER IF EXISTS audit_logs_no_update;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
DROP TRIGGER IF EXISTS audit_logs_no_delete;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
