-- Item type lookup: numeric type_code for FK from t_items.type (or item_type_code)
-- MySQL / MariaDB

CREATE TABLE IF NOT EXISTS t_items_type (
  type_code TINYINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  create_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modify_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (type_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1 Inventory, 2 (Non-Inventory), 3 Bookle, 4 Token
INSERT INTO t_items_type (type_code, name)
VALUES
  (1, 'Inventory'),
  (2, '(Non-Inventory)'),
  (3, 'Bookle'),
  (4, 'Token')
ON DUPLICATE KEY UPDATE
  name = VALUES(name);
