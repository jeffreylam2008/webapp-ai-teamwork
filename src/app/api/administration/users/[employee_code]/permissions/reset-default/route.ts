import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  applyRoleDefaultsToEmployee,
  canManageEmployeeAccess,
  getEmployeeRoleForShop,
  getLiveRoleCodeForEmployee,
} from '@/lib/employeeRoleAccess';

/**
 * POST /api/administration/users/[employee_code]/permissions/reset-default
 * Reset this user's access to the role defaults from t_employee_access_default.
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

    const editorCode = String(auth.user.employee_code ?? '').trim();
    if (editorCode) {
      const canEdit = await canManageEmployeeAccess(
        editorCode,
        shopCode || null,
        await getLiveRoleCodeForEmployee(editorCode, shopCode || null, auth.user.role_code)
      );
      if (!canEdit) {
        return NextResponse.json(
          {
            success: false,
            error: 'Only an employee with full access can reset permissions to default',
          },
          { status: 403 }
        );
      }
    }

    const employee = await getEmployeeRoleForShop(employeeCode, shopCode);
    if (!employee) {
      return NextResponse.json({ success: false, error: 'User not found for this shop' }, { status: 404 });
    }

    const effectiveShop = shopCode || employee.default_shopcode || 'HQ01';
    const permissionKeys = await applyRoleDefaultsToEmployee(
      employeeCode,
      effectiveShop,
      employee.role_code
    );

    return NextResponse.json({ success: true, data: permissionKeys });
  } catch (error) {
    console.error('[API] reset permissions to default error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
