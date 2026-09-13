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

/** Ensure t_employee_role exists and seed canonical roles once (do not overwrite custom edits). */
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
      `INSERT IGNORE INTO t_employee_role (role_code, role_key, role_name, description, status, sort_order)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [role.role_code, role.role_key, role.role_name, role.description, role.sort_order]
    );
  }

  // One-time style migration: legacy installs used custom role_code for the admin login.
  await dbService.query(
    `UPDATE t_employee SET role_code = ? WHERE username = 'iamadmin' AND role_code NOT IN (1, 2, 3)`,
    [ADMINISTRATOR_ROLE_CODE]
  );
}

const NO_ACCESS_FLAGS = { a_create: 0, a_edit: 0, a_delete: 0, a_view: 0 };

/** Ensure t_employee_access_default exists; seed missing rows only (never overwrite custom templates). */
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

  const canonicalCodes = new Set(EMPLOYEE_ROLES.map((r) => r.role_code));

  for (const roleCode of roleCodes) {
    for (const row of FUNCTION_PERMISSION_ROWS) {
      const flags = canonicalCodes.has(roleCode)
        ? getAccessFlagsForRoleAndFunction(roleCode, row.id, row)
        : NO_ACCESS_FLAGS;
      await dbService.query(
        `INSERT IGNORE INTO t_employee_access_default (role_code, \`function\`, a_create, a_edit, a_delete, a_view)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [roleCode, row.id, flags.a_create, flags.a_edit, flags.a_delete, flags.a_view]
      );
    }
  }
}

export async function listEmployeeRoles(options?: {
  includeInactive?: boolean;
}): Promise<EmployeeRoleRow[]> {
  await ensureEmployeeRoleTable();
  const includeInactive = options?.includeInactive === true;
  const result = await dbService.query<EmployeeRoleRow>(
    includeInactive
      ? `SELECT role_code, role_key, role_name, description, status, sort_order
         FROM t_employee_role
         ORDER BY sort_order ASC, role_code ASC`
      : `SELECT role_code, role_key, role_name, description, status, sort_order
         FROM t_employee_role
         WHERE status = 1
         ORDER BY sort_order ASC, role_code ASC`
  );
  return (result.data || []) as EmployeeRoleRow[];
}

export function isProtectedSystemRole(role: {
  role_code: number;
  role_key: string;
}): boolean {
  return (
    role.role_code === ADMINISTRATOR_ROLE_CODE ||
    String(role.role_key || '').trim().toLowerCase() === 'administrator'
  );
}

export async function getEmployeeRoleByCodeFromDb(
  roleCode: number
): Promise<EmployeeRoleRow | null> {
  await ensureEmployeeRoleTable();
  const result = await dbService.query<EmployeeRoleRow>(
    `SELECT role_code, role_key, role_name, description, status, sort_order
     FROM t_employee_role WHERE role_code = ? LIMIT 1`,
    [roleCode]
  );
  return result.data?.[0] ?? null;
}

export async function countEmployeesWithRole(roleCode: number): Promise<number> {
  const result = await dbService.query<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM t_employee WHERE role_code = ?',
    [roleCode]
  );
  return Number(result.data?.[0]?.cnt ?? 0);
}

async function nextRoleCode(): Promise<number> {
  const result = await dbService.query<{ max_code: number | null }>(
    'SELECT MAX(role_code) AS max_code FROM t_employee_role'
  );
  const max = Number(result.data?.[0]?.max_code ?? 0);
  const next = Number.isFinite(max) && max > 0 ? max + 1 : 4;
  return Math.max(next, 4);
}

const ROLE_KEY_RE = /^[a-z][a-z0-9_]{1,31}$/;

export function normalizeRoleKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Write flat permission keys into t_employee_access_default for a role. */
export async function writeRoleDefaultPermissionKeys(
  roleCode: number,
  permissionKeys: string[]
): Promise<string[]> {
  await ensureEmployeeAccessDefaultTable();
  const toWrite = permissionKeysToAccessRows('', permissionKeys);

  await dbService.query('DELETE FROM t_employee_access_default WHERE role_code = ?', [roleCode]);

  for (const r of toWrite) {
    await dbService.query(
      `INSERT INTO t_employee_access_default (role_code, \`function\`, a_create, a_edit, a_delete, a_view)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [roleCode, r.function, r.a_create, r.a_edit, r.a_delete, r.a_view]
    );
  }

  return accessRowsToPermissionKeys(toWrite);
}

export async function createEmployeeRole(params: {
  role_key: string;
  role_name: string;
  description?: string | null;
  status?: number;
  sort_order?: number;
  permissions?: string[];
}): Promise<{ role: EmployeeRoleRow; permissions: string[] }> {
  await ensureEmployeeRoleTable();
  await ensureEmployeeAccessDefaultTable();

  const roleKey = normalizeRoleKey(params.role_key);
  const roleName = String(params.role_name || '').trim();
  if (!ROLE_KEY_RE.test(roleKey)) {
    throw new Error(
      'role_key must be 2–32 chars: start with a letter, then lowercase letters, digits, or underscore'
    );
  }
  if (!roleName) {
    throw new Error('role_name is required');
  }
  if (roleKey === 'administrator') {
    throw new Error('Cannot create another Administrator role key');
  }

  const existingKey = await dbService.query<{ role_code: number }>(
    'SELECT role_code FROM t_employee_role WHERE role_key = ? LIMIT 1',
    [roleKey]
  );
  if (existingKey.data && existingKey.data.length > 0) {
    throw new Error('role_key already exists');
  }

  const roleCode = await nextRoleCode();
  const status = params.status != null ? (Number(params.status) === 0 ? 0 : 1) : 1;
  const sortOrder =
    params.sort_order != null && Number.isFinite(Number(params.sort_order))
      ? Number(params.sort_order)
      : roleCode;
  const description =
    params.description != null ? String(params.description).trim() || null : null;

  await dbService.query(
    `INSERT INTO t_employee_role (role_code, role_key, role_name, description, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [roleCode, roleKey, roleName, description, status, sortOrder]
  );

  const permissions = await writeRoleDefaultPermissionKeys(
    roleCode,
    Array.isArray(params.permissions) ? params.permissions : []
  );

  const role = await getEmployeeRoleByCodeFromDb(roleCode);
  if (!role) throw new Error('Failed to create role');
  return { role, permissions };
}

export async function updateEmployeeRole(params: {
  role_code: number;
  role_key?: string;
  role_name?: string;
  description?: string | null;
  status?: number;
  sort_order?: number;
  permissions?: string[];
}): Promise<{ role: EmployeeRoleRow; permissions: string[] }> {
  await ensureEmployeeRoleTable();
  const existing = await getEmployeeRoleByCodeFromDb(params.role_code);
  if (!existing) {
    throw new Error('Role not found');
  }

  const protectedRole = isProtectedSystemRole(existing);
  let nextKey = existing.role_key;
  if (params.role_key != null) {
    const normalized = normalizeRoleKey(params.role_key);
    if (!ROLE_KEY_RE.test(normalized)) {
      throw new Error(
        'role_key must be 2–32 chars: start with a letter, then lowercase letters, digits, or underscore'
      );
    }
    if (protectedRole && normalized !== existing.role_key) {
      throw new Error('Cannot change the Administrator role key');
    }
    if (normalized === 'administrator' && existing.role_code !== ADMINISTRATOR_ROLE_CODE) {
      throw new Error('Cannot set role_key to administrator');
    }
    if (normalized !== existing.role_key) {
      const clash = await dbService.query<{ role_code: number }>(
        'SELECT role_code FROM t_employee_role WHERE role_key = ? AND role_code <> ? LIMIT 1',
        [normalized, existing.role_code]
      );
      if (clash.data && clash.data.length > 0) {
        throw new Error('role_key already exists');
      }
      nextKey = normalized;
    }
  }

  const nextName =
    params.role_name != null ? String(params.role_name).trim() : existing.role_name;
  if (!nextName) throw new Error('role_name is required');

  const nextDescription =
    params.description !== undefined
      ? params.description != null
        ? String(params.description).trim() || null
        : null
      : existing.description;

  let nextStatus = existing.status;
  if (params.status != null) {
    if (protectedRole && Number(params.status) === 0) {
      throw new Error('Cannot deactivate the Administrator role');
    }
    nextStatus = Number(params.status) === 0 ? 0 : 1;
  }

  const nextSort =
    params.sort_order != null && Number.isFinite(Number(params.sort_order))
      ? Number(params.sort_order)
      : existing.sort_order;

  await dbService.query(
    `UPDATE t_employee_role
     SET role_key = ?, role_name = ?, description = ?, status = ?, sort_order = ?, modify_date = NOW()
     WHERE role_code = ?`,
    [nextKey, nextName, nextDescription, nextStatus, nextSort, existing.role_code]
  );

  let permissions: string[];
  if (Array.isArray(params.permissions)) {
    permissions = await writeRoleDefaultPermissionKeys(existing.role_code, params.permissions);
  } else {
    permissions = await getRoleDefaultPermissionKeys(existing.role_code);
  }

  const role = await getEmployeeRoleByCodeFromDb(existing.role_code);
  if (!role) throw new Error('Role not found after update');
  return { role, permissions };
}

export async function deleteEmployeeRole(roleCode: number): Promise<void> {
  await ensureEmployeeRoleTable();
  const existing = await getEmployeeRoleByCodeFromDb(roleCode);
  if (!existing) {
    throw new Error('Role not found');
  }
  if (isProtectedSystemRole(existing)) {
    throw new Error('Cannot delete the Administrator role');
  }
  const inUse = await countEmployeesWithRole(roleCode);
  if (inUse > 0) {
    throw new Error(`Cannot delete role: ${inUse} employee(s) still use it`);
  }

  await dbService.query('DELETE FROM t_employee_access_default WHERE role_code = ?', [roleCode]);
  await dbService.query('DELETE FROM t_employee_role WHERE role_code = ?', [roleCode]);
}

export async function requireAdministratorFromAuth(user: {
  employee_code?: string | number | null;
  selected_shopcode?: string | null;
  default_shopcode?: string | null;
  role_code?: number | null;
}): Promise<
  | { ok: true; editorCode: string; shopCode: string; editorRoleCode: number }
  | { ok: false; status: number; error: string }
> {
  const shopCode = (user.selected_shopcode || user.default_shopcode || '').trim() || '';
  const editorCode = String(user.employee_code ?? '').trim();
  if (!editorCode) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  const editorRoleCode = await getLiveRoleCodeForEmployee(
    editorCode,
    shopCode || null,
    user.role_code
  );
  const isAdmin = await isAdministratorEmployee(editorCode, shopCode || null, editorRoleCode);
  if (!isAdmin) {
    return {
      ok: false,
      status: 403,
      error: 'Only an Administrator can manage role templates',
    };
  }
  return { ok: true, editorCode, shopCode, editorRoleCode };
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
export async function writeEmployeePermissionKeys(
  employeeCode: string,
  shopCode: string,
  permissionKeys: string[]
): Promise<string[]> {
  await ensureEmployeeAccessTable();
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

  return accessRowsToPermissionKeys(toWrite);
}

/** Flat permission keys for a role template (t_employee_access_default). */
export async function getRoleDefaultPermissionKeys(roleCode: number): Promise<string[]> {
  const defaultRows = await loadRoleDefaultAccessRows(roleCode);
  return accessRowsToPermissionKeys(defaultRows);
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
  const permissionKeys = await getRoleDefaultPermissionKeys(roleCode);
  return writeEmployeePermissionKeys(employeeCode, shopCode, permissionKeys);
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

export async function isAdministratorEmployee(
  employeeCode: string,
  shopCode: string | null,
  roleCode?: number | null
): Promise<boolean> {
  const liveRoleCode = await getLiveRoleCodeForEmployee(employeeCode, shopCode, roleCode);
  return isAdministratorRoleInDb(liveRoleCode);
}

/**
 * Role assignment rules to prevent privilege escalation:
 * - Only Administrator may assign the Administrator role.
 * - Only Administrator may change the role of an existing Administrator.
 * General roles may only move employees among non-administrator roles.
 */
export async function assertCanAssignEmployeeRole(params: {
  editorEmployeeCode: string;
  editorShopCode: string | null;
  editorRoleCode?: number | null;
  targetCurrentRoleCode: number;
  targetNewRoleCode: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const editorIsAdmin = await isAdministratorEmployee(
    params.editorEmployeeCode,
    params.editorShopCode,
    params.editorRoleCode
  );
  if (editorIsAdmin) return { ok: true };

  const assigningAdmin = await isAdministratorRoleInDb(params.targetNewRoleCode);
  if (assigningAdmin) {
    return {
      ok: false,
      error:
        'Only an Administrator can assign the Administrator role. General roles cannot promote employees to Administrator.',
    };
  }

  const targetIsAdmin = await isAdministratorRoleInDb(params.targetCurrentRoleCode);
  if (targetIsAdmin) {
    return {
      ok: false,
      error:
        'Only an Administrator can change the role of an Administrator employee.',
    };
  }

  return { ok: true };
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

/** Alias used by existing call sites. */
export async function editorIsAdministrator(
  employeeCode: string,
  shopCode: string | null,
  roleCode?: number | null
): Promise<boolean> {
  return isAdministratorEmployee(employeeCode, shopCode, roleCode);
}

/**
 * Compatibility wrapper for older call sites (create user / PATCH role).
 * Prefer assertCanAssignEmployeeRole for new code.
 */
export async function canAssignOrModifyRole(options: {
  editorEmployeeCode: string;
  editorShopCode: string | null;
  editorRoleCode?: number | null;
  targetRoleCode: number;
  targetCurrentRoleCode?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return assertCanAssignEmployeeRole({
    editorEmployeeCode: options.editorEmployeeCode,
    editorShopCode: options.editorShopCode,
    editorRoleCode: options.editorRoleCode,
    targetCurrentRoleCode:
      options.targetCurrentRoleCode != null && Number.isFinite(Number(options.targetCurrentRoleCode))
        ? Number(options.targetCurrentRoleCode)
        : 0,
    targetNewRoleCode: options.targetRoleCode,
  });
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

  const editorIsAdmin = await isAdministratorEmployee(
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
  const editorIsAdmin = await isAdministratorEmployee(
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

/** Only Administrators (system owners) may create new employees. */
export async function canCreateEmployee(
  employeeCode: string,
  shopCode: string | null,
  roleCode?: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const editorIsAdmin = await isAdministratorEmployee(employeeCode, shopCode, roleCode);
  if (editorIsAdmin) return { ok: true };
  return {
    ok: false,
    error: 'Only an Administrator can add employees.',
  };
}
