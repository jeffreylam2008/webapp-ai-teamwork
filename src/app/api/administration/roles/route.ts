import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { listEmployeeRoles } from '@/lib/employeeRoleAccess';

/**
 * GET /api/administration/roles
 * List active employee roles from t_employee_role.
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
    return NextResponse.json({ success: true, data: roles });
  } catch (error) {
    console.error('[API] administration/roles error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
