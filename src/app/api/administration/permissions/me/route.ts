import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { accessRowsToPermissionKeys, hasFullTransactionAccess, type EmployeeAccessRow } from '@/lib/employeeAccess';
import {
  canManageEmployeeAccess,
  ensureAdministratorAccessForEmployee,
  ensureEmployeeRoleTable,
  isAdministratorEmployee,
} from '@/lib/employeeRoleAccess';

/**
 * GET /api/administration/permissions/me
 * Returns current user's permission keys from t_employee_access (by employee_code). Requires auth.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const employeeCode = String(auth.user.employee_code ?? '').trim();
    if (!employeeCode) {
      return NextResponse.json({ success: true, data: [], can_manage_access: false });
    }
    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || '';
    let roleCode = Number(auth.user.role_code ?? 0);

    await ensureEmployeeRoleTable();
    const employeeRow = shopCode
      ? await dbService.query<{ role_code: number | null }>(
          'SELECT role_code FROM t_employee WHERE employee_code = ? AND default_shopcode = ? LIMIT 1',
          [employeeCode, shopCode]
        )
      : await dbService.query<{ role_code: number | null }>(
          'SELECT role_code FROM t_employee WHERE employee_code = ? LIMIT 1',
          [employeeCode]
        );
    const liveRoleCode = employeeRow.data?.[0]?.role_code;
    if (liveRoleCode != null && Number.isFinite(Number(liveRoleCode))) {
      roleCode = Number(liveRoleCode);
    }

    let result: { data?: EmployeeAccessRow[] } = { data: [] };
    if (shopCode) {
      const res = await dbService
        .query<EmployeeAccessRow>(
          'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE shop_code = ? AND employee_code = ?',
          [shopCode, employeeCode]
        )
        .catch(() => null);
      if (res !== null) {
        result = res;
      } else {
        const fallback = await dbService
          .query<EmployeeAccessRow>(
            'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE employee_code = ?',
            [employeeCode]
          )
          .catch(() => ({ data: [] }));
        if (fallback?.data) result = fallback;
      }
    } else {
      const res = await dbService
        .query<EmployeeAccessRow>(
          'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE employee_code = ?',
          [employeeCode]
        )
        .catch(() => ({ data: [] }));
      if (res?.data) result = res;
    }

    let permissions = accessRowsToPermissionKeys((result.data || []) as EmployeeAccessRow[]);

    const healed = await ensureAdministratorAccessForEmployee(
      employeeCode,
      shopCode || 'HQ01',
      roleCode
    );
    if (healed) {
      permissions = healed;
    }

    const canManage = await canManageEmployeeAccess(employeeCode, shopCode || null, roleCode);
    const isAdministrator = await isAdministratorEmployee(employeeCode, shopCode || null, roleCode);

    return NextResponse.json({
      success: true,
      data: permissions,
      can_manage_access: canManage,
      is_administrator: isAdministrator,
      has_full_transaction_access: hasFullTransactionAccess(permissions),
      role_code: roleCode,
    });
  } catch (error) {
    console.error('[API] permissions/me error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
