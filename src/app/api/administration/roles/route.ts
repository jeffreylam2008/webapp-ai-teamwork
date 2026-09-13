import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  countEmployeesWithRole,
  createEmployeeRole,
  filterRolesForEditor,
  isProtectedSystemRole,
  listEmployeeRoles,
  requireAdministratorFromAuth,
} from '@/lib/employeeRoleAccess';
import { TRANSACTION_PERMISSIONS } from '@/config/transactionPermissions';

/**
 * GET /api/administration/roles
 * List employee roles. Query: include_inactive=1 (Administrator only) for management UI.
 * Default list hides Administrator for non-admin editors (assignment pickers).
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

    const includeInactive =
      new URL(request.url).searchParams.get('include_inactive') === '1';
    if (includeInactive) {
      const admin = await requireAdministratorFromAuth(result.user);
      if (!admin.ok) {
        return NextResponse.json(
          { success: false, error: admin.error },
          { status: admin.status }
        );
      }
    }

    const roles = await listEmployeeRoles({ includeInactive });
    if (includeInactive) {
      const data = await Promise.all(
        roles.map(async (role) => ({
          ...role,
          employee_count: await countEmployeesWithRole(role.role_code),
          protected: isProtectedSystemRole(role),
        }))
      );
      return NextResponse.json({ success: true, data });
    }

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

/**
 * POST /api/administration/roles
 * Create a role template (Administrator only).
 * Body: { role_key, role_name, description?, status?, sort_order?, permissions?: string[] }
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const allowedKeys = new Set(TRANSACTION_PERMISSIONS.map((p) => p.key));
    const permissions = Array.isArray(body.permissions)
      ? body.permissions.filter(
          (p: unknown) => typeof p === 'string' && allowedKeys.has(p)
        )
      : [];

    try {
      const created = await createEmployeeRole({
        role_key: String(body.role_key ?? ''),
        role_name: String(body.role_name ?? ''),
        description: body.description,
        status: body.status != null ? Number(body.status) : 1,
        sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
        permissions,
      });
      return NextResponse.json({ success: true, data: created });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create role';
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
  } catch (error) {
    console.error('[API] create role error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
