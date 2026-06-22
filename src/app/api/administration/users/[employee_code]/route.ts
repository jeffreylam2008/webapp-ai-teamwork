import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

async function getEmployeeByCode(employeeCode: string) {
  const result = await dbService.query<{
    uid: number;
    username: string;
    default_shopcode: string;
  }>('SELECT uid, username, default_shopcode FROM t_employee WHERE employee_code = ? LIMIT 1', [
    employeeCode,
  ]);
  return result.data?.[0] ?? null;
}

/**
 * PUT /api/administration/users/[employee_code]
 * Update user profile fields. Body: { default_shopcode?: string }
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

    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    const employee = await getEmployeeByCode(employeeCode);
    if (!employee) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const defaultShopcode =
      typeof body.default_shopcode === 'string' ? body.default_shopcode.trim() : '';
    if (!defaultShopcode) {
      return NextResponse.json({ success: false, error: 'Default shop is required' }, { status: 400 });
    }

    const shopCheck = await dbService.query<{ shop_code: string }>(
      'SELECT shop_code FROM t_shop WHERE shop_code = ? LIMIT 1',
      [defaultShopcode]
    );
    if (!shopCheck.data?.length) {
      return NextResponse.json({ success: false, error: 'Invalid shop selected' }, { status: 400 });
    }

    const oldShop = String(employee.default_shopcode || '').trim();
    if (defaultShopcode === oldShop) {
      return NextResponse.json({
        success: true,
        message: 'No changes',
        data: {
          uid: employee.uid,
          employee_code: employeeCode,
          username: employee.username,
          default_shopcode: defaultShopcode,
        },
      });
    }

    const usernameCheck = await dbService.query<{ uid: number }>(
      'SELECT uid FROM t_employee WHERE username = ? AND default_shopcode = ? AND employee_code <> ? LIMIT 1',
      [employee.username, defaultShopcode, employeeCode]
    );
    if (usernameCheck.data?.length) {
      return NextResponse.json(
        { success: false, error: 'Username already exists for the selected shop' },
        { status: 409 }
      );
    }

    const updateResult = await dbService.query(
      'UPDATE t_employee SET default_shopcode = ?, modify_date = NOW() WHERE uid = ?',
      [defaultShopcode, employee.uid]
    );
    if ((updateResult.affectedRows ?? 0) === 0) {
      return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
    }

    if (oldShop) {
      await dbService.query(
        'DELETE FROM t_employee_access WHERE shop_code = ? AND employee_code = ?',
        [defaultShopcode, employeeCode]
      );
      await dbService.query(
        'UPDATE t_employee_access SET shop_code = ? WHERE shop_code = ? AND employee_code = ?',
        [defaultShopcode, oldShop, employeeCode]
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      data: {
        uid: employee.uid,
        employee_code: employeeCode,
        username: employee.username,
        default_shopcode: defaultShopcode,
      },
    });
  } catch (error) {
    console.error('[API] update user error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
