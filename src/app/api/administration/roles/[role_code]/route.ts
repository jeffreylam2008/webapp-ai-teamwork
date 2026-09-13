import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  countEmployeesWithRole,
  deleteEmployeeRole,
  getEmployeeRoleByCodeFromDb,
  getRoleDefaultPermissionKeys,
  isProtectedSystemRole,
  requireAdministratorFromAuth,
  updateEmployeeRole,
} from '@/lib/employeeRoleAccess';
import { TRANSACTION_PERMISSIONS } from '@/config/transactionPermissions';

/**
 * GET /api/administration/roles/[role_code]
 * Role metadata + default permission keys (Administrator for full detail; any auth for active role name lookup is via list).
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

    const admin = await requireAdministratorFromAuth(auth.user);
    if (!admin.ok) {
      return NextResponse.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const { role_code } = await params;
    const roleCode = Number(role_code);
    if (!Number.isFinite(roleCode) || roleCode <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid role code' }, { status: 400 });
    }

    const role = await getEmployeeRoleByCodeFromDb(roleCode);
    if (!role) {
      return NextResponse.json({ success: false, error: 'Role not found' }, { status: 404 });
    }

    const permissions = await getRoleDefaultPermissionKeys(roleCode);
    const employee_count = await countEmployeesWithRole(roleCode);

    return NextResponse.json({
      success: true,
      data: {
        ...role,
        permissions,
        employee_count,
        protected: isProtectedSystemRole(role),
      },
    });
  } catch (error) {
    console.error('[API] get role error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/administration/roles/[role_code]
 * Update role template (Administrator only).
 * Body: { role_key?, role_name?, description?, status?, sort_order?, permissions?: string[] }
 */
export async function PUT(
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

    const admin = await requireAdministratorFromAuth(auth.user);
    if (!admin.ok) {
      return NextResponse.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const { role_code } = await params;
    const roleCode = Number(role_code);
    if (!Number.isFinite(roleCode) || roleCode <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid role code' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const allowedKeys = new Set(TRANSACTION_PERMISSIONS.map((p) => p.key));
    const permissions = Array.isArray(body.permissions)
      ? body.permissions.filter(
          (p: unknown) => typeof p === 'string' && allowedKeys.has(p)
        )
      : undefined;

    try {
      const updated = await updateEmployeeRole({
        role_code: roleCode,
        role_key: body.role_key != null ? String(body.role_key) : undefined,
        role_name: body.role_name != null ? String(body.role_name) : undefined,
        description: body.description,
        status: body.status != null ? Number(body.status) : undefined,
        sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
        permissions,
      });
      return NextResponse.json({ success: true, data: updated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update role';
      const status = msg === 'Role not found' ? 404 : 400;
      return NextResponse.json({ success: false, error: msg }, { status });
    }
  } catch (error) {
    console.error('[API] update role error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/administration/roles/[role_code]
 * Delete role template (Administrator only). Blocked for Administrator role or roles in use.
 */
export async function DELETE(
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

    const admin = await requireAdministratorFromAuth(auth.user);
    if (!admin.ok) {
      return NextResponse.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const { role_code } = await params;
    const roleCode = Number(role_code);
    if (!Number.isFinite(roleCode) || roleCode <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid role code' }, { status: 400 });
    }

    try {
      await deleteEmployeeRole(roleCode);
      return NextResponse.json({ success: true, message: 'Role deleted' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete role';
      const status = msg === 'Role not found' ? 404 : 400;
      return NextResponse.json({ success: false, error: msg }, { status });
    }
  } catch (error) {
    console.error('[API] delete role error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
