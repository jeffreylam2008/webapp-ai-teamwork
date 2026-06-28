import dbService from '@/lib/database';
import { FUNCTION_PERMISSION_ROWS, getDefaultAccessFlags } from '@/config/transactionPermissions';
import {
  accessRowsToPermissionKeys,
  permissionKeysToAccessRows,
  type EmployeeAccessRow,
} from '@/lib/employeeAccess';

async function ensureDefaultRowsForRole(roleCode: number): Promise<void> {
  for (const row of FUNCTION_PERMISSION_ROWS) {
    const flags = getDefaultAccessFlags(row);
    await dbService.query(
      `INSERT INTO t_employee_access_default (role_code, \`function\`, a_create, a_edit, a_delete, a_view)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE a_create = VALUES(a_create), a_edit = VALUES(a_edit), a_delete = VALUES(a_delete), a_view = VALUES(a_view)`,
      [roleCode, row.id, flags.a_create, flags.a_edit, flags.a_delete, flags.a_view]
    );
  }
}

/** Seed t_employee_access for a new user from t_employee_access_default for their role. */
export async function seedEmployeeAccessFromRole(
  employeeCode: string,
  shopCode: string,
  roleCode: number
): Promise<void> {
  const code = String(employeeCode).trim();
  const shop = (shopCode || 'HQ01').trim() || 'HQ01';
  if (!code) return;

  await ensureDefaultRowsForRole(roleCode);

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

  const rowsAsAccess: EmployeeAccessRow[] = rows.map((r) => ({
    employee_code: code,
    function: r.function,
    a_create: r.a_create,
    a_edit: r.a_edit,
    a_delete: r.a_delete,
    a_view: r.a_view,
  }));

  const permissionKeys = accessRowsToPermissionKeys(rowsAsAccess);
  const toWrite = permissionKeysToAccessRows(code, permissionKeys);

  await dbService.query('DELETE FROM t_employee_access WHERE shop_code = ? AND employee_code = ?', [
    shop,
    code,
  ]);

  for (const r of toWrite) {
    await dbService.query(
      `INSERT INTO t_employee_access (employee_code, shop_code, \`function\`, sub_function, a_create, a_edit, a_delete, a_view)
       VALUES (?, ?, ?, '', ?, ?, ?, ?)`,
      [r.employee_code, shop, r.function, r.a_create, r.a_edit, r.a_delete, r.a_view]
    );
  }
}
