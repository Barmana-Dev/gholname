-- Last consumed TOTP time step per user: a code can be used only once.
USE regbroker;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mfa_last_step');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE users ADD COLUMN mfa_last_step BIGINT UNSIGNED NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
