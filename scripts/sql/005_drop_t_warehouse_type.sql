-- t_warehouse.type is unused (stock direction is implied by qty deltas / stage holds).
-- Safe to re-run: only drops the column when it still exists.

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_warehouse'
    AND COLUMN_NAME = 'type'
);

SET @sql := IF(
  @col_exists > 0,
  'ALTER TABLE t_warehouse DROP COLUMN `type`',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
