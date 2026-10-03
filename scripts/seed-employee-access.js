/**
 * Seed t_employee_role, t_employee_access_default, and t_employee_access.
 *
 * - t_employee_role: Administrator, Sales Manager, Warehouse Manager
 * - t_employee_access_default: per-role function templates
 * - t_employee_access: actual permissions per employee (from role template)
 *
 * Run from project root: node scripts/seed-employee-access.js
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const {
  PERMISSION_FUNCTIONS,
  EMPLOYEE_ROLES,
  getAccessFlagsForRoleAndFunction,
} = require('./lib/role-permission-defaults');
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

    await connection.query(`
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
      )
    `);
    console.log('Table t_employee_role ensured.');

    for (const role of EMPLOYEE_ROLES) {
      await connection.query(
        `INSERT INTO t_employee_role (role_code, role_key, role_name, description, status, sort_order)
         VALUES (?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
           role_key = VALUES(role_key),
           role_name = VALUES(role_name),
           description = VALUES(description),
           sort_order = VALUES(sort_order)`,
        [role.role_code, role.role_key, role.role_name, role.description, role.sort_order]
      );
    }
    console.log('Seeded t_employee_role:', EMPLOYEE_ROLES.map((r) => r.role_name).join(', '));

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

    const [roleRows] = await connection.execute('SELECT role_code FROM t_employee_role ORDER BY role_code');
    let roleCodes = (roleRows || []).map((r) => r.role_code);
    if (roleCodes.length === 0) {
      roleCodes = EMPLOYEE_ROLES.map((r) => r.role_code);
    }
    console.log('Using role_codes:', roleCodes);

    let defaultInserted = 0;
    let defaultUpdated = 0;
    for (const roleCode of roleCodes) {
      for (const fn of PERMISSION_FUNCTIONS) {
        const { a_create, a_edit, a_delete, a_view } = getAccessFlagsForRoleAndFunction(roleCode, fn);
        const [dr] = await connection.query(
          `INSERT INTO t_employee_access_default (role_code, \`function\`, a_create, a_edit, a_delete, a_view)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             a_create = VALUES(a_create),
             a_edit = VALUES(a_edit),
             a_delete = VALUES(a_delete),
             a_view = VALUES(a_view)`,
          [roleCode, fn, a_create, a_edit, a_delete, a_view]
        );
        if (dr.affectedRows === 1) defaultInserted++;
        else if (dr.affectedRows === 2) defaultUpdated++;
      }
    }
    console.log(
      'Seeded t_employee_access_default:',
      defaultInserted,
      'new,',
      defaultUpdated,
      'updated (role-based templates).'
    );

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
      const shopCode =
        emp.default_shopcode != null && emp.default_shopcode !== ''
          ? String(emp.default_shopcode)
          : 'HQ01';
      const roleCode = emp.role_code != null ? Number(emp.role_code) : 1;

      for (const fn of PERMISSION_FUNCTIONS) {
        const { a_create, a_edit, a_delete, a_view } = getAccessFlagsForRoleAndFunction(roleCode, fn);
        const [ar] = await connection.query(
          `INSERT INTO t_employee_access (employee_code, shop_code, \`function\`, sub_function, a_create, a_edit, a_delete, a_view)
           VALUES (?, ?, ?, '', ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             a_create = VALUES(a_create),
             a_edit = VALUES(a_edit),
             a_delete = VALUES(a_delete),
             a_view = VALUES(a_view)`,
          [employeeCode, shopCode, fn, a_create, a_edit, a_delete, a_view]
        );
        if (ar.affectedRows === 1) accessInserted++;
        else if (ar.affectedRows === 2) accessUpdated++;
      }
    }

    console.log(
      'Seeded t_employee_access:',
      accessInserted,
      'new,',
      accessUpdated,
      'updated (from employee role templates).'
    );
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

run();
