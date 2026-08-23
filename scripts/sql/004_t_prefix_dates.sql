-- Add audit timestamps to t_prefix when missing (older databases).

ALTER TABLE t_prefix
  ADD COLUMN create_date DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE t_prefix
  ADD COLUMN modify_date DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

UPDATE t_prefix SET create_date = NOW() WHERE create_date IS NULL;
UPDATE t_prefix SET modify_date = COALESCE(create_date, NOW()) WHERE modify_date IS NULL;
