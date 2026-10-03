-- Employee role master table and role-based default permissions.
-- Run after t_employee exists. Safe to re-run (CREATE IF NOT EXISTS + upserts).

CREATE TABLE IF NOT EXISTS t_employee_role (
  role_code INT NOT NULL,
  role_key VARCHAR(32) NOT NULL,
  role_name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  create_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  modify_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_code),
  UNIQUE KEY uk_employee_role_key (role_key)
);

INSERT INTO t_employee_role (role_code, role_key, role_name, description, sort_order) VALUES
  (1, 'administrator', 'Administrator', 'Full access to all transaction functions', 1),
  (2, 'sales_manager', 'Sales Manager', 'Access to sales transactions and sales reports', 2),
  (3, 'warehouse_manager', 'Warehouse Manager', 'Access to warehouse stock transactions and warehouse reports', 3)
ON DUPLICATE KEY UPDATE
  role_key = VALUES(role_key),
  role_name = VALUES(role_name),
  description = VALUES(description),
  sort_order = VALUES(sort_order);

CREATE TABLE IF NOT EXISTS t_employee_access_default (
  role_code INT NOT NULL,
  `function` VARCHAR(32) NOT NULL,
  a_create TINYINT(1) NOT NULL DEFAULT 0,
  a_edit TINYINT(1) NOT NULL DEFAULT 0,
  a_delete TINYINT(1) NOT NULL DEFAULT 0,
  a_view TINYINT(1) NOT NULL DEFAULT 0,
  create_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  modify_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_code, `function`)
);

-- Administrator: all functions full (view-only rows: view only)
INSERT INTO t_employee_access_default (role_code, `function`, a_create, a_edit, a_delete, a_view) VALUES
  (1, 'po', 1, 1, 1, 1),
  (1, 'invoice', 1, 1, 1, 1),
  (1, 'sales_order', 1, 1, 1, 1),
  (1, 'quotation', 1, 1, 1, 1),
  (1, 'grn', 1, 1, 1, 1),
  (1, 'stocktake', 1, 1, 1, 1),
  (1, 'delivery_note', 1, 1, 1, 1),
  (1, 'adjustment', 1, 1, 1, 1),
  (1, 'sales_report', 0, 0, 0, 1),
  (1, 'warehouse_report', 0, 0, 0, 1)
ON DUPLICATE KEY UPDATE a_create = VALUES(a_create), a_edit = VALUES(a_edit), a_delete = VALUES(a_delete), a_view = VALUES(a_view);

-- Sales Manager
INSERT INTO t_employee_access_default (role_code, `function`, a_create, a_edit, a_delete, a_view) VALUES
  (2, 'po', 0, 0, 0, 0),
  (2, 'invoice', 1, 1, 1, 1),
  (2, 'sales_order', 1, 1, 1, 1),
  (2, 'quotation', 1, 1, 1, 1),
  (2, 'grn', 0, 0, 0, 0),
  (2, 'stocktake', 0, 0, 0, 0),
  (2, 'delivery_note', 0, 0, 0, 0),
  (2, 'adjustment', 0, 0, 0, 0),
  (2, 'sales_report', 0, 0, 0, 1),
  (2, 'warehouse_report', 0, 0, 0, 0)
ON DUPLICATE KEY UPDATE a_create = VALUES(a_create), a_edit = VALUES(a_edit), a_delete = VALUES(a_delete), a_view = VALUES(a_view);

-- Warehouse Manager
INSERT INTO t_employee_access_default (role_code, `function`, a_create, a_edit, a_delete, a_view) VALUES
  (3, 'po', 0, 0, 0, 0),
  (3, 'invoice', 0, 0, 0, 0),
  (3, 'sales_order', 0, 0, 0, 0),
  (3, 'quotation', 0, 0, 0, 0),
  (3, 'grn', 1, 1, 1, 1),
  (3, 'stocktake', 1, 1, 1, 1),
  (3, 'delivery_note', 1, 1, 1, 1),
  (3, 'adjustment', 1, 1, 1, 1),
  (3, 'sales_report', 0, 0, 0, 0),
  (3, 'warehouse_report', 0, 0, 0, 1)
ON DUPLICATE KEY UPDATE a_create = VALUES(a_create), a_edit = VALUES(a_edit), a_delete = VALUES(a_delete), a_view = VALUES(a_view);
