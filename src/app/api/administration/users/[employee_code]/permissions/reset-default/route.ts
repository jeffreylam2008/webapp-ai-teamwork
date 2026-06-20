import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  permissionKeysToAccessRows,
  accessRowsToPermissionKeys,
  type EmployeeAccessRow,
} from '@/lib/employeeAccess';

/** Resolve uid and role_code from employee_code and shop. */
async function getEmployeeRoleForShop(
  employeeCode: string,
  shopCode: string
): Promise<{ uid: number; role_code: number } | null> {
  const code = (employeeCode || '').trim();
  const shop = (shopCode || '').trim();
  if (!code) return null;
  const query =
    shop !== ''
      ? 'SELECT uid, role_code FROM t_employee WHERE employee_code = ? AND default_shopcode = ? LIMIT 1'
      : 'SELECT uid, role_code FROM t_employee WHERE employee_code = ? LIMIT 1';
  const params = shop !== '' ? [code, shop] : [code];
  const result = await dbService.query<{ uid: number; role_code: number | null }>(query, params);
  const row = result.data?.[0];
  if (!row || !Number.isFinite(row.uid)) return null;
  const roleCode = row.role_code != null && Number.isFinite(Number(row.role_code)) ? Number(row.role_code) : 1;
  return { uid: row.uid, role_code: roleCode };
}

/**
 * POST /api/administration/users/[employee_code]/permissions/reset-default
 * Reset this user's access to the role defaults from t_employee_access_default.
 * Uses t_employee.role_code to look up defaults, then writes to t_employee_access.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ employee_code: string }> }
) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || '';
    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    const employee = await getEmployeeRoleForShop(employeeCode, shopCode);
    if (!employee) {
      return NextResponse.json({ success: false, error: 'User not found for this shop' }, { status: 404 });
    }

    const defaultRows = await dbService.query<{
      role_code: number;
      function: string;
      a_create: number;
      a_edit: number;
      a_delete: number;
      a_view: number;
    }>('SELECT role_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access_default WHERE role_code = ?', [
      employee.role_code,
    ]);
    const rows = (defaultRows.data || []) as Array<{
      role_code: number;
      function: string;
      a_create: number;
      a_edit: number;
      a_delete: number;
      a_view: number;
    }>;
    const rowsAsAccess: EmployeeAccessRow[] = rows.map((r) => ({
      employee_code: employeeCode,
      function: r.function,
      a_create: r.a_create,
      a_edit: r.a_edit,
      a_delete: r.a_delete,
      a_view: r.a_view,
    }));
    const permissionKeys = accessRowsToPermissionKeys(rowsAsAccess);

    const toWrite = permissionKeysToAccessRows(employeeCode, permissionKeys);
    const effectiveShop = shopCode || 'HQ01';
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

    return NextResponse.json({ success: true, data: permissionKeys });
  } catch (error) {
    console.error('[API] reset permissions to default error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
