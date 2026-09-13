import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { getRoleDefaultPermissionKeys } from '@/lib/employeeRoleAccess';

/**
 * GET /api/administration/roles/[role_code]/defaults
 * Return flat permission keys for a role template (used when creating/editing employees).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ role_code: string }> }
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

    const { role_code } = await params;
    const roleCode = Number(role_code);
    if (!Number.isFinite(roleCode) || roleCode <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid role code' }, { status: 400 });
    }

    const permissions = await getRoleDefaultPermissionKeys(roleCode);
    return NextResponse.json({ success: true, data: permissions });
  } catch (error) {
    console.error('[API] role defaults error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
