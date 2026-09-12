import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  applyRoleDefaultsToEmployee,
  canManageEmployeeAccess,
  ensureEmployeeRoleTable,
  getEmployeeRoleForShop,
  getLiveRoleCodeForEmployee,
  listEmployeeRoles,
} from '@/lib/employeeRoleAccess';
import { getUidByEmployeeCodeAndShop } from '@/lib/employeeAccessDb';
import { getEmployeeRoleByCode } from '@/config/rolePermissionDefaults';

/**
 * PATCH /api/administration/users/[employee_code]
 * Update employee role. Body: { role_code: number, apply_role_defaults?: boolean }
 */
export async function PATCH(
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
    const editorCode = String(auth.user.employee_code ?? '').trim();
    if (editorCode) {
      const canEdit = await canManageEmployeeAccess(
        editorCode,
        shopCode || null,
        await getLiveRoleCodeForEmployee(editorCode, shopCode || null, auth.user.role_code)
      );
      if (!canEdit) {
        return NextResponse.json(
          { success: false, error: 'Only an employee with full access can change employee roles' },
          { status: 403 }
        );
      }
    }

    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const roleCode = Number(body.role_code);
    if (!Number.isFinite(roleCode) || roleCode <= 0) {
      return NextResponse.json({ success: false, error: 'Valid role_code is required' }, { status: 400 });
    }

    await ensureEmployeeRoleTable();
    const role = getEmployeeRoleByCode(roleCode);
    const roles = await listEmployeeRoles();
    const roleExists = role != null || roles.some((r) => r.role_code === roleCode);
    if (!roleExists) {
      return NextResponse.json({ success: false, error: 'Role not found' }, { status: 400 });
    }

    const employee = await getEmployeeRoleForShop(employeeCode, shopCode);
    if (!employee) {
      return NextResponse.json({ success: false, error: 'User not found for this shop' }, { status: 404 });
    }

    const uid = await getUidByEmployeeCodeAndShop(employeeCode, shopCode);
    if (uid == null) {
      return NextResponse.json({ success: false, error: 'User not found for this shop' }, { status: 404 });
    }

    await dbService.query('UPDATE t_employee SET role_code = ?, modify_date = NOW() WHERE uid = ?', [
      roleCode,
      uid,
    ]);

    const applyDefaults = body.apply_role_defaults !== false;
    let permissions: string[] | undefined;
    if (applyDefaults) {
      const effectiveShop = shopCode || employee.default_shopcode || 'HQ01';
      permissions = await applyRoleDefaultsToEmployee(employeeCode, effectiveShop, roleCode);
    }

    const roleName =
      role?.role_name ?? roles.find((r) => r.role_code === roleCode)?.role_name ?? String(roleCode);

    return NextResponse.json({
      success: true,
      data: {
        employee_code: employeeCode,
        role_code: roleCode,
        role_name: roleName,
        permissions,
        apply_role_defaults: applyDefaults,
      },
    });
  } catch (error) {
    console.error('[API] patch user error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
