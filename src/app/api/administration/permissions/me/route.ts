import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { accessRowsToPermissionKeys, type EmployeeAccessRow } from '@/lib/employeeAccess';

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
      return NextResponse.json({ success: true, data: [] });
    }
    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;

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

    const rows = (result.data || []) as EmployeeAccessRow[];
    const permissions = accessRowsToPermissionKeys(rows);

    return NextResponse.json({ success: true, data: permissions });
  } catch (error) {
    console.error('[API] permissions/me error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
