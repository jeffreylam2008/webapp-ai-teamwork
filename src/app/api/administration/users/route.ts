import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  applyRoleDefaultsToEmployee,
  canManageEmployeeAccess,
  ensureEmployeeRoleTable,
  getLiveRoleCodeForEmployee,
  listEmployeeRoles,
} from '@/lib/employeeRoleAccess';
import { getEmployeeRoleByCode } from '@/config/rolePermissionDefaults';

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
    const shopCode = (result.user.selected_shopcode || result.user.default_shopcode || '').trim() || null;

    await ensureEmployeeRoleTable();

    const rows = shopCode
      ? await dbService.query(
          `SELECT e.uid, e.employee_code, e.username, e.default_shopcode, e.role_code, e.status,
                  r.role_key, r.role_name
           FROM t_employee e
           LEFT JOIN t_employee_role r ON r.role_code = e.role_code
           WHERE e.default_shopcode = ?
           ORDER BY e.username ASC`,
          [shopCode]
        )
      : await dbService.query(
          `SELECT e.uid, e.employee_code, e.username, e.default_shopcode, e.role_code, e.status,
                  r.role_key, r.role_name
           FROM t_employee e
           LEFT JOIN t_employee_role r ON r.role_code = e.role_code
           ORDER BY e.username ASC`
        );

    type Row = {
      uid: number;
      employee_code: string;
      username: string;
      default_shopcode: string;
      role_code: number;
      status: number;
      role_key: string | null;
      role_name: string | null;
    };
    const data = (rows.data || []) as Row[];
    const users = data.map((r) => ({
      uid: r.uid,
      employee_code: r.employee_code,
      username: r.username,
      default_shopcode: r.default_shopcode,
      role_code: r.role_code,
      role_key: r.role_key ?? null,
      role_name: r.role_name ?? getEmployeeRoleByCode(r.role_code)?.role_name ?? null,
      status: r.status,
    }));

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error('[API] administration/users error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/administration/users
 * Create employee and apply role default permissions.
 * Body: { employee_code, username, password, default_shopcode?, role_code?, status? }
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

    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || '';
    const editorCode = String(auth.user.employee_code ?? '').trim();
    if (editorCode) {
      const canCreate = await canManageEmployeeAccess(
        editorCode,
        shopCode || null,
        await getLiveRoleCodeForEmployee(editorCode, shopCode || null, auth.user.role_code)
      );
      if (!canCreate) {
        return NextResponse.json(
          { success: false, error: 'Only an employee with full access can create users' },
          { status: 403 }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const employeeCode = String(body.employee_code ?? '').trim();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const defaultShopcode = String(body.default_shopcode ?? shopCode ?? 'HQ01').trim() || 'HQ01';
    const roleCode = body.role_code != null ? Number(body.role_code) : 2;
    const status = body.status != null ? Number(body.status) : 1;

    if (!employeeCode || !username || !password) {
      return NextResponse.json(
        { success: false, error: 'employee_code, username, and password are required' },
        { status: 400 }
      );
    }

    await ensureEmployeeRoleTable();
    const roles = await listEmployeeRoles();
    const role = getEmployeeRoleByCode(roleCode);
    if (!role && !roles.some((r) => r.role_code === roleCode)) {
      return NextResponse.json({ success: false, error: 'Role not found' }, { status: 400 });
    }

    const existing = await dbService.query<{ uid: number }>(
      'SELECT uid FROM t_employee WHERE username = ? OR employee_code = ? LIMIT 1',
      [username, employeeCode]
    );
    if (existing.data && existing.data.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Username or employee code already exists' },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const insert = await dbService.query(
      `INSERT INTO t_employee (employee_code, username, password, default_shopcode, role_code, status, create_date, modify_date)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [employeeCode, username, hashedPassword, defaultShopcode, roleCode, status]
    );

    const permissions = await applyRoleDefaultsToEmployee(employeeCode, defaultShopcode, roleCode);
    const roleName =
      role?.role_name ?? roles.find((r) => r.role_code === roleCode)?.role_name ?? String(roleCode);

    return NextResponse.json({
      success: true,
      data: {
        uid: insert.insertId,
        employee_code: employeeCode,
        username,
        default_shopcode: defaultShopcode,
        role_code: roleCode,
        role_name: roleName,
        status,
        permissions,
      },
    });
  } catch (error) {
    console.error('[API] create user error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
