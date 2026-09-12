import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  permissionKeysToAccessRows,
  getUnauthorizedPermissionGrants,
} from '@/lib/employeeAccess';
import { ensureEmployeeAccessTable, getUidByEmployeeCodeAndShop } from '@/lib/employeeAccessDb';
import {
  ensureEmployeeAccessDefaultTable,
  getEmployeePermissionKeys,
  canManageEmployeeAccess,
  getLiveRoleCodeForEmployee,
} from '@/lib/employeeRoleAccess';

/**
 * GET /api/administration/users/[employee_code]/permissions
 * Get permissions for a user from t_employee_access by employee_code and current shop (from token).
 */
export async function GET(
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

    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;

    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    await ensureEmployeeAccessTable();
    await ensureEmployeeAccessDefaultTable();

    const permissions = await getEmployeePermissionKeys(employeeCode, shopCode);

    return NextResponse.json({ success: true, data: permissions });
  } catch (error) {
    console.error('[API] get user permissions error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/administration/users/[employee_code]/permissions
 * Set permissions for the user identified by employee_code in the URL, scoped to current shop (from token). Body: { permissions: string[] }.
 */
export async function PUT(
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

    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;

    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    const uid = await getUidByEmployeeCodeAndShop(employeeCode, shopCode || '');
    if (uid == null) {
      return NextResponse.json({ success: false, error: 'User not found for this shop' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    const allowed = permissions.filter((p: unknown) => typeof p === 'string' && p.length > 0 && p.length <= 64);

    await ensureEmployeeAccessTable();

    const editorCode = String(auth.user.employee_code ?? '').trim();
    const editorRoleCode = await getLiveRoleCodeForEmployee(editorCode, shopCode, auth.user.role_code);
    const editorKeys = editorCode ? await getEmployeePermissionKeys(editorCode, shopCode) : [];
    const editorCanManage = editorCode
      ? await canManageEmployeeAccess(editorCode, shopCode, editorRoleCode)
      : false;
    const existingKeys = await getEmployeePermissionKeys(employeeCode, shopCode);
    const unauthorized = getUnauthorizedPermissionGrants(
      editorKeys,
      existingKeys,
      allowed,
      editorCanManage
    );
    if (unauthorized.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Only an employee with full access can grant new permissions. Unchecked boxes cannot be enabled by limited users.',
          unauthorized,
        },
        { status: 403 }
      );
    }

    const rows = permissionKeysToAccessRows(employeeCode, allowed);

    const effectiveShop = shopCode || 'HQ01';
    await dbService.query('DELETE FROM t_employee_access WHERE shop_code = ? AND employee_code = ?', [
      effectiveShop,
      employeeCode,
    ]);
    for (const r of rows) {
      await dbService.query(
        `INSERT INTO t_employee_access (employee_code, shop_code, \`function\`, sub_function, a_create, a_edit, a_delete, a_view)
         VALUES (?, ?, ?, '', ?, ?, ?, ?)`,
        [r.employee_code, effectiveShop, r.function, r.a_create, r.a_edit, r.a_delete, r.a_view]
      );
    }

    return NextResponse.json({ success: true, data: allowed });
  } catch (error) {
    console.error('[API] set user permissions error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
