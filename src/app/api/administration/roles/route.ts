import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { filterRolesForEditor, listEmployeeRoles } from '@/lib/employeeRoleAccess';

/**
 * GET /api/administration/roles
 * List active employee roles from t_employee_role.
 * Non-administrators do not receive the Administrator role option.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const result = await verifyToken(token);
    if (!result.success || !result.user) {
      return NextResponse.json({ success: false, error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const roles = await listEmployeeRoles();
    const editorCode = String(result.user.employee_code ?? '').trim();
    const shopCode =
      (result.user.selected_shopcode || result.user.default_shopcode || '').trim() || null;
    const visible = editorCode
      ? await filterRolesForEditor(roles, editorCode, shopCode, result.user.role_code)
      : roles;

    return NextResponse.json({ success: true, data: visible });
  } catch (error) {
    console.error('[API] administration/roles error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
