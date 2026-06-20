import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import bcrypt from 'bcryptjs';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

type EmployeeRow = {
  uid: number;
  employee_code: string | number;
  username: string;
  default_shopcode: string | null;
};

/**
 * GET /api/profile/me
 * Returns current user profile and shop list for dropdown. Auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const uid = auth.user.uid;
    const empResult = await dbService.query<EmployeeRow>(
      'SELECT uid, employee_code, username, default_shopcode FROM t_employee WHERE uid = ? AND status = 1',
      [uid]
    );
    const employee = empResult.data?.[0];
    if (!employee) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const shopsResult = await dbService.query<{ shop_code: string; name: string; is_warehouse?: number | boolean }>(
      'SELECT shop_code, name, is_warehouse FROM t_shop ORDER BY name'
    );
    const shops = shopsResult.data || [];

    return NextResponse.json({
      success: true,
      data: {
        uid: employee.uid,
        employee_code: employee.employee_code,
        username: employee.username,
        default_shopcode: employee.default_shopcode ?? '',
        shops,
      },
    });
  } catch (error) {
    console.error('[API] profile/me GET error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/profile/me
 * Update profile: name, default_shopcode, and optionally password.
 * Body: { default_shopcode?: string, current_password?: string, new_password?: string }
 */
export async function PUT(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const uid = auth.user.uid;
    const body = await request.json().catch(() => ({}));
    const { default_shopcode, current_password, new_password } = body;

    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (default_shopcode !== undefined) {
      updates.push('default_shopcode = ?');
      values.push(typeof default_shopcode === 'string' && default_shopcode.trim() ? default_shopcode.trim() : null);
    }

    if (typeof new_password === 'string' && new_password.trim().length > 0) {
      if (typeof current_password !== 'string' || current_password.length === 0) {
        return NextResponse.json({ success: false, error: 'Current password is required to set a new password' }, { status: 400 });
      }
      const empResult = await dbService.query<{ password: string }>(
        'SELECT password FROM t_employee WHERE uid = ?',
        [uid]
      );
      const emp = empResult.data?.[0];
      if (!emp) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
      const { verifyPhpCrypt } = await import('@/lib/phpCrypt');
      let valid = false;
      if (emp.password.startsWith('$2')) {
        valid = await bcrypt.compare(current_password, emp.password);
      } else if (emp.password.startsWith('pa')) {
        valid = verifyPhpCrypt(current_password, emp.password);
      }
      if (!valid) {
        return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 400 });
      }
      const hashed = await bcrypt.hash(new_password, 10);
      updates.push('password = ?');
      values.push(hashed);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: true, message: 'Nothing to update' });
    }

    values.push(String(uid));
    const sql = `UPDATE t_employee SET ${updates.join(', ')}, modify_date = NOW() WHERE uid = ?`;
    await dbService.query(sql, values);
    return NextResponse.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('[API] profile/me PUT error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
