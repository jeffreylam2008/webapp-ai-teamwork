/**
 * Seed t_employee_access_default and t_employee_access.
 *
 * - t_employee_access_default: role_code (references t_employee_role), function, a_create, a_edit, a_delete, a_view.
 *   One row per (role_code, function) with all 1s. Role codes from t_employee_role or DISTINCT from t_employee.
 * - t_employee_access: from t_employee (employee_code, default_shopcode, role_code); permission values from role.
 *
 * Run from project root: node scripts/seed-employee-access.js
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Same function ids as FUNCTION_PERMISSION_ROWS in src/config/transactionPermissions.ts
const PERMISSION_FUNCTIONS = [
  'po',
  'invoice',
  'sales_order',
  'quotation',
  'grn',
  'stocktake',
  'delivery_note',
  'adjustment',
];

/** Return a_create, a_edit, a_delete, a_view from role_code. role_code 1 = Supervisor = full; others = view only. */
function getAccessByRole(roleCode) {
  const r = roleCode != null ? Number(roleCode) : 0;
  if (r === 1) return { a_create: 1, a_edit: 1, a_delete: 1, a_view: 1 };
  return { a_create: 0, a_edit: 0, a_delete: 0, a_view: 1 };
}

const { resolveDbConfig } = require('./lib/resolve-db-config');

function loadDbConfig() {
  const configPath = path.join(__dirname, '..', 'src', 'data', 'db-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return resolveDbConfig({
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.user ?? '',
      password: config.password ?? '',
      database: config.database || 'teamwork',
    });
  }
  return resolveDbConfig({
    host: 'localhost',
    port: 3306,
    user: '',
    password: '',
    database: 'teamwork',
  });
}

async function run() {
  const dbConfig = loadDbConfig();
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database:', dbConfig.database);

    // Ensure t_employee_access exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS t_employee_access (
        uid INT NOT NULL,
        employee_code VARCHAR(32) NOT NULL,
        shop_code VARCHAR(32) NOT NULL DEFAULT 'HQ01',
        \`function\` VARCHAR(32) NOT NULL,
        sub_function VARCHAR(32) NOT NULL DEFAULT '',
        a_create TINYINT(1) NOT NULL DEFAULT 0,
        a_edit TINYINT(1) NOT NULL DEFAULT 0,
        a_delete TINYINT(1) NOT NULL DEFAULT 0,
        a_view TINYINT(1) NOT NULL DEFAULT 0,
        create_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        modify_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (shop_code, employee_code, \`function\`)
      )
    `);
    console.log('Table t_employee_access ensured.');

    // Migrate t_employee_access_default: if it has old schema (employee_code), drop it for recreate with role_code
    try {
      const [colRows] = await connection.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_employee_access_default'`
      );
      const hasEmployeeCode = colRows && colRows.some((c) => c.COLUMN_NAME === 'employee_code');
      if (hasEmployeeCode) {
        await connection.query('DROP TABLE t_employee_access_default');
        console.log('Dropped old t_employee_access_default (had employee_code); will recreate with role_code.');
      }
    } catch {
      // Table may not exist
    }

    // t_employee_access_default: role_code (references t_employee_role), function, a_create, a_edit, a_delete, a_view. No employee_code.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS t_employee_access_default (
        role_code INT NOT NULL,
        \`function\` VARCHAR(32) NOT NULL,
        a_create TINYINT(1) NOT NULL DEFAULT 0,
        a_edit TINYINT(1) NOT NULL DEFAULT 0,
        a_delete TINYINT(1) NOT NULL DEFAULT 0,
        a_view TINYINT(1) NOT NULL DEFAULT 0,
        create_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        modify_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (role_code, \`function\`)
      )
    `);
    console.log('Table t_employee_access_default ensured (role_code + function).');

    // Get role_codes from t_employee_role if it exists, else from DISTINCT role_code in t_employee
    let roleCodes = [];
    try {
      const [roleRows] = await connection.execute('SELECT role_code FROM t_employee_role ORDER BY role_code');
      if (roleRows && roleRows.length > 0) {
        roleCodes = roleRows.map((r) => r.role_code);
        console.log('Using role_codes from t_employee_role:', roleCodes);
      }
    } catch {
      // t_employee_role may not exist
    }
    if (roleCodes.length === 0) {
      const [distinctRows] = await connection.execute('SELECT DISTINCT role_code FROM t_employee WHERE role_code IS NOT NULL ORDER BY role_code');
      roleCodes = distinctRows.map((r) => r.role_code);
      if (roleCodes.length === 0) roleCodes = [1];
      console.log('Using role_codes from t_employee:', roleCodes);
    }

    // Seed t_employee_access_default: one row per (role_code, function) with create, edit, delete, view = 1
    let defaultInserted = 0;
    let defaultUpdated = 0;
    for (const roleCode of roleCodes) {
      for (const fn of PERMISSION_FUNCTIONS) {
        const [dr] = await connection.query(
          `INSERT INTO t_employee_access_default (role_code, \`function\`, a_create, a_edit, a_delete, a_view)
           VALUES (?, ?, 1, 1, 1, 1)
           ON DUPLICATE KEY UPDATE a_create = 1, a_edit = 1, a_delete = 1, a_view = 1`,
          [roleCode, fn]
        );
        if (dr.affectedRows === 1) defaultInserted++;
        else if (dr.affectedRows === 2) defaultUpdated++;
      }
    }
    console.log('Seeded t_employee_access_default:', defaultInserted, 'new,', defaultUpdated, 'updated (role_code + all functions create/edit/delete/view).');

    // Get all employees for t_employee_access
    const [employees] = await connection.execute(
      'SELECT uid, employee_code, default_shopcode, role_code FROM t_employee ORDER BY uid'
    );
    if (employees.length === 0) {
      console.log('No employees in t_employee. Skipping t_employee_access seed.');
      return;
    }
    console.log('Found', employees.length, 'employee(s).');

    let accessInserted = 0;
    let accessUpdated = 0;

    for (const emp of employees) {
      const employeeCode = String(emp.employee_code);
      const shopCode = (emp.default_shopcode != null && emp.default_shopcode !== '') ? String(emp.default_shopcode) : 'HQ01';
      const access = getAccessByRole(emp.role_code);
      const { a_create, a_edit, a_delete, a_view } = access;

      for (const fn of PERMISSION_FUNCTIONS) {
        const [ar] = await connection.query(
          `INSERT INTO t_employee_access (employee_code, shop_code, \`function\`, sub_function, a_create, a_edit, a_delete, a_view)
           VALUES (?, ?, ?, '', ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE a_create = VALUES(a_create), a_edit = VALUES(a_edit), a_delete = VALUES(a_delete), a_view = VALUES(a_view)`,
          [employeeCode, shopCode, fn, a_create, a_edit, a_delete, a_view]
        );
        if (ar.affectedRows === 1) accessInserted++;
        else if (ar.affectedRows === 2) accessUpdated++;
      }
    }

    console.log('Seeded t_employee_access:', accessInserted, 'new,', accessUpdated, 'updated (from t_employee employee_code, default_shopcode, role_code).');
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

run();
