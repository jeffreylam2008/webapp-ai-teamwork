import dbService from '@/lib/database';
import { FUNCTION_PERMISSION_ROWS } from '@/config/transactionPermissions';
import {
  buildRoleDefaultAccessRows,
  EMPLOYEE_ROLES,
  getAccessFlagsForRoleAndFunction,
  isAdministratorRoleCode,
  ADMINISTRATOR_ROLE_CODE,
} from '@/config/rolePermissionDefaults';
import {
  accessRowsToPermissionKeys,
  permissionKeysToAccessRows,
  type EmployeeAccessRow,
} from '@/lib/employeeAccess';
import { ensureEmployeeAccessTable } from '@/lib/employeeAccessDb';
import { hasFullTransactionAccess } from '@/lib/employeeAccess';

export type EmployeeRoleRow = {
  role_code: number;
  role_key: string;
  role_name: string;
  description: string | null;
  status: number;
  sort_order: number;
};

/** Ensure t_employee_role exists and seed canonical roles. */
export async function ensureEmployeeRoleTable(): Promise<void> {
  await dbService.query(`
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

  for (const role of EMPLOYEE_ROLES) {
    await dbService.query(
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

  // One-time style migration: legacy installs used custom role_code for the admin login.
  await dbService.query(
    `UPDATE t_employee SET role_code = ? WHERE username = 'iamadmin' AND role_code NOT IN (1, 2, 3)`,
    [ADMINISTRATOR_ROLE_CODE]
  );
}

/** Ensure t_employee_access_default is keyed by role_code and seeded from role templates. */
export async function ensureEmployeeAccessDefaultTable(): Promise<void> {
  await ensureEmployeeRoleTable();

  try {
    const cols = await dbService.query<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_employee_access_default'`
    );
    const names = (cols.data || []).map((c) => c.COLUMN_NAME);
    if (names.length > 0 && names.includes('employee_code')) {
      await dbService.query(`DROP TABLE t_employee_access_default`);
    }
  } catch {
    // Table may not exist; ignore
  }

  await dbService.query(`
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

  const roleResult = await dbService.query<{ role_code: number }>(
    'SELECT role_code FROM t_employee_role ORDER BY role_code'
  );
  let roleCodes = (roleResult.data || []).map((r) => r.role_code);
  if (roleCodes.length === 0) {
    roleCodes = EMPLOYEE_ROLES.map((r) => r.role_code);
  }

  for (const roleCode of roleCodes) {
    for (const row of FUNCTION_PERMISSION_ROWS) {
      const flags = getAccessFlagsForRoleAndFunction(roleCode, row.id, row);
      await dbService.query(
        `INSERT INTO t_employee_access_default (role_code, \`function\`, a_create, a_edit, a_delete, a_view)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           a_create = VALUES(a_create),
           a_edit = VALUES(a_edit),
           a_delete = VALUES(a_delete),
           a_view = VALUES(a_view)`,
        [roleCode, row.id, flags.a_create, flags.a_edit, flags.a_delete, flags.a_view]
      );
    }
  }
}

export async function listEmployeeRoles(): Promise<EmployeeRoleRow[]> {
  await ensureEmployeeRoleTable();
  const result = await dbService.query<EmployeeRoleRow>(
    `SELECT role_code, role_key, role_name, description, status, sort_order
     FROM t_employee_role
     WHERE status = 1
     ORDER BY sort_order ASC, role_code ASC`
  );
  return (result.data || []) as EmployeeRoleRow[];
}

export async function getEmployeeRoleForShop(
  employeeCode: string,
  shopCode: string
): Promise<{ uid: number; role_code: number; default_shopcode: string } | null> {
  const code = (employeeCode || '').trim();
  const shop = (shopCode || '').trim();
  if (!code) return null;

  const query =
    shop !== ''
      ? 'SELECT uid, role_code, default_shopcode FROM t_employee WHERE employee_code = ? AND default_shopcode = ? LIMIT 1'
      : 'SELECT uid, role_code, default_shopcode FROM t_employee WHERE employee_code = ? LIMIT 1';
  const params = shop !== '' ? [code, shop] : [code];
  const result = await dbService.query<{
    uid: number;
    role_code: number | null;
    default_shopcode: string;
  }>(query, params);
  const row = result.data?.[0];
  if (!row || !Number.isFinite(row.uid)) return null;

  const roleCode =
    row.role_code != null && Number.isFinite(Number(row.role_code)) ? Number(row.role_code) : 1;
  return {
    uid: row.uid,
    role_code: roleCode,
    default_shopcode: row.default_shopcode || shop || 'HQ01',
  };
}

async function loadRoleDefaultAccessRows(roleCode: number): Promise<EmployeeAccessRow[]> {
  await ensureEmployeeAccessDefaultTable();
  const defaultRows = await dbService.query<{
    role_code: number;
    function: string;
    a_create: number;
    a_edit: number;
    a_delete: number;
    a_view: number;
  }>(
    'SELECT role_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access_default WHERE role_code = ?',
    [roleCode]
  );
  const rows = (defaultRows.data || []) as Array<{
    role_code: number;
    function: string;
    a_create: number;
    a_edit: number;
    a_delete: number;
    a_view: number;
  }>;

  if (rows.length > 0) {
    return rows.map((r) => ({
      employee_code: '',
      function: r.function,
      a_create: r.a_create,
      a_edit: r.a_edit,
      a_delete: r.a_delete,
      a_view: r.a_view,
    }));
  }

  return buildRoleDefaultAccessRows(roleCode).map((r) => ({
    employee_code: '',
    function: r.function,
    a_create: r.a_create,
    a_edit: r.a_edit,
    a_delete: r.a_delete,
    a_view: r.a_view,
  }));
}

/**
 * Copy role template from t_employee_access_default into t_employee_access for one employee.
 * Returns the flat permission keys written.
 */
export async function applyRoleDefaultsToEmployee(
  employeeCode: string,
  shopCode: string,
  roleCode: number
): Promise<string[]> {
  await ensureEmployeeAccessTable();

  const defaultRows = await loadRoleDefaultAccessRows(roleCode);
  const permissionKeys = accessRowsToPermissionKeys(defaultRows);
  const toWrite = permissionKeysToAccessRows(employeeCode, permissionKeys);
  const effectiveShop = (shopCode || '').trim() || 'HQ01';

  await dbService.query('DELETE FROM t_employee_access WHERE shop_code = ? AND employee_code = ?', [
    effectiveShop,
    employeeCode,
  ]);

  for (const r of toWrite) {
    await dbService.query(
      `INSERT INTO t_employee_access (employee_code, shop_code, \`function\`, sub_function, a_create, a_edit, a_delete, a_view)
       VALUES (?, ?, ?, '', ?, ?, ?, ?)`,
      [r.employee_code, effectiveShop, r.function, r.a_create, r.a_edit, r.a_delete, r.a_view]
    );
  }

  return permissionKeys;
}

export async function getEmployeePermissionKeys(
  employeeCode: string,
  shopCode: string | null
): Promise<string[]> {
  await ensureEmployeeAccessTable();
  const code = (employeeCode || '').trim();
  if (!code) return [];

  const result = shopCode
    ? await dbService.query<EmployeeAccessRow>(
        'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE shop_code = ? AND employee_code = ?',
        [shopCode, code]
      )
    : await dbService.query<EmployeeAccessRow>(
        'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE employee_code = ?',
        [code]
      );
  return accessRowsToPermissionKeys((result.data || []) as EmployeeAccessRow[]);
}

export async function getLiveRoleCodeForEmployee(
  employeeCode: string,
  shopCode: string | null,
  fallbackRoleCode?: number | null
): Promise<number> {
  const employee = await getEmployeeRoleForShop(employeeCode, shopCode || '');
  if (employee?.role_code != null) return employee.role_code;
  return fallbackRoleCode != null && Number.isFinite(Number(fallbackRoleCode))
    ? Number(fallbackRoleCode)
    : 0;
}

async function isAdministratorRoleInDb(roleCode: number): Promise<boolean> {
  if (isAdministratorRoleCode(roleCode)) return true;
  await ensureEmployeeRoleTable();
  const result = await dbService.query<{ role_key: string }>(
    'SELECT role_key FROM t_employee_role WHERE role_code = ? AND status = 1 LIMIT 1',
    [roleCode]
  );
  return result.data?.[0]?.role_key === 'administrator';
}

/** True when this employee currently holds the Administrator role. */
export async function editorIsAdministrator(
  employeeCode: string,
  shopCode: string | null,
  roleCode?: number | null
): Promise<boolean> {
  await ensureEmployeeRoleTable();
  const liveRoleCode = await getLiveRoleCodeForEmployee(employeeCode, shopCode, roleCode);
  return isAdministratorRoleInDb(liveRoleCode);
}

/**
 * Non-administrators must not assign or modify the Administrator role
 * (prevents privilege escalation / over-control).
 */
export async function canAssignOrModifyRole(options: {
  editorEmployeeCode: string;
  editorShopCode: string | null;
  editorRoleCode?: number | null;
  targetRoleCode: number;
  targetCurrentRoleCode?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const editorIsAdmin = await editorIsAdministrator(
    options.editorEmployeeCode,
    options.editorShopCode,
    options.editorRoleCode
  );
  if (editorIsAdmin) return { ok: true };

  const targetIsAdmin = await isAdministratorRoleInDb(options.targetRoleCode);
  const currentIsAdmin =
    options.targetCurrentRoleCode != null &&
    Number.isFinite(Number(options.targetCurrentRoleCode)) &&
    (await isAdministratorRoleInDb(Number(options.targetCurrentRoleCode)));

  if (targetIsAdmin || currentIsAdmin) {
    return {
      ok: false,
      error:
        'Only an Administrator can assign or change the Administrator role. General roles cannot promote users to Administrator.',
    };
  }
  return { ok: true };
}

/**
 * Administrators may set any employee password (including their own).
 * General roles may only change their own password.
 */
export async function canChangeEmployeePassword(options: {
  editorEmployeeCode: string;
  editorShopCode: string | null;
  editorRoleCode?: number | null;
  targetEmployeeCode: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const editorCode = String(options.editorEmployeeCode || '').trim();
  const targetCode = String(options.targetEmployeeCode || '').trim();
  if (!editorCode || !targetCode) {
    return { ok: false, error: 'Unauthorized' };
  }
  if (editorCode === targetCode) return { ok: true };

  const editorIsAdmin = await editorIsAdministrator(
    editorCode,
    options.editorShopCode,
    options.editorRoleCode
  );
  if (editorIsAdmin) return { ok: true };

  return {
    ok: false,
    error:
      'Only an Administrator can change another employee’s password. General roles may only change their own password.',
  };
}

/** Drop Administrator from a role list when the editor is not an Administrator. */
export async function filterRolesForEditor<T extends { role_code: number; role_key?: string | null }>(
  roles: T[],
  editorEmployeeCode: string,
  editorShopCode: string | null,
  editorRoleCode?: number | null
): Promise<T[]> {
  const editorIsAdmin = await editorIsAdministrator(
    editorEmployeeCode,
    editorShopCode,
    editorRoleCode
  );
  if (editorIsAdmin) return roles;
  const filtered: T[] = [];
  for (const role of roles) {
    if (role.role_key === 'administrator') continue;
    if (await isAdministratorRoleInDb(Number(role.role_code))) continue;
    filtered.push(role);
  }
  return filtered;
}

/**
 * Only Administrators (system owners) may create new employees.
 */
export async function canCreateEmployee(
  employeeCode: string,
  shopCode: string | null,
  roleCode?: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const editorIsAdmin = await editorIsAdministrator(employeeCode, shopCode, roleCode);
  if (editorIsAdmin) return { ok: true };
  return {
    ok: false,
    error: 'Only an Administrator can add employees.',
  };
}

/** True when the editor may grant/revoke any function access (Administrator role or all permission keys). */
export async function canManageEmployeeAccess(
  employeeCode: string,
  shopCode: string | null,
  roleCode?: number | null
): Promise<boolean> {
  await ensureEmployeeRoleTable();
  const liveRoleCode = await getLiveRoleCodeForEmployee(employeeCode, shopCode, roleCode);
  if (await isAdministratorRoleInDb(liveRoleCode)) return true;
  const keys = await getEmployeePermissionKeys(employeeCode, shopCode);
  return hasFullTransactionAccess(keys);
}

export async function editorHasFullTransactionAccess(
  employeeCode: string,
  shopCode: string | null,
  roleCode?: number | null
): Promise<boolean> {
  return canManageEmployeeAccess(employeeCode, shopCode, roleCode);
}

/**
 * Administrator role should always have full function keys. Re-apply role defaults when rows are missing or stale.
 */
export async function ensureAdministratorAccessForEmployee(
  employeeCode: string,
  shopCode: string,
  roleCode: number
): Promise<string[] | null> {
  await ensureEmployeeRoleTable();
  const liveRoleCode = await getLiveRoleCodeForEmployee(employeeCode, shopCode, roleCode);
  if (!(await isAdministratorRoleInDb(liveRoleCode))) return null;

  const keys = await getEmployeePermissionKeys(employeeCode, shopCode || null);
  if (hasFullTransactionAccess(keys)) return keys;

  return applyRoleDefaultsToEmployee(employeeCode, shopCode, ADMINISTRATOR_ROLE_CODE);
}
