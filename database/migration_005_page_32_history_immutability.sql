DROP TRIGGER IF EXISTS prevent_status_history_delete;

DELIMITER $$
CREATE TRIGGER prevent_status_history_delete
BEFORE DELETE ON status_history
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Original application history is immutable';
END$$
DELIMITER ;
