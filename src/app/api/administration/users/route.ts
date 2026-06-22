import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { seedEmployeeAccessFromRole } from '@/lib/seedEmployeeAccessFromRole';

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

    const rows = shopCode
      ? await dbService.query(
          'SELECT uid, employee_code, username, default_shopcode, role_code, status FROM t_employee WHERE default_shopcode = ? ORDER BY username ASC',
          [shopCode]
        )
      : await dbService.query(
          'SELECT uid, employee_code, username, default_shopcode, role_code, status FROM t_employee ORDER BY username ASC'
        );
    type Row = { uid: number; employee_code: string; username: string; default_shopcode: string; role_code: number; status: number };
    const data = (rows.data || []) as Row[];
    const users = data.map((r) => ({
      uid: r.uid,
      employee_code: r.employee_code,
      username: r.username,
      default_shopcode: r.default_shopcode,
      role_code: r.role_code,
      status: r.status,
    }));

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error('[API] administration/users error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

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

    const body = await request.json().catch(() => ({}));
    const employeeCodeRaw = body.employee_code;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const defaultShopcode =
      typeof body.default_shopcode === 'string' ? body.default_shopcode.trim() : '';
    const roleCode = Number(body.role_code);
    const status = body.status === 0 || body.status === '0' ? 0 : 1;

    const employeeCode =
      employeeCodeRaw != null && String(employeeCodeRaw).trim() !== ''
        ? String(employeeCodeRaw).trim()
        : '';

    if (!employeeCode || !/^\d+$/.test(employeeCode)) {
      return NextResponse.json(
        { success: false, error: 'Employee code is required and must be numeric' },
        { status: 400 }
      );
    }
    if (!username) {
      return NextResponse.json({ success: false, error: 'Username is required' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password is required (minimum 6 characters)' },
        { status: 400 }
      );
    }
    if (!defaultShopcode) {
      return NextResponse.json({ success: false, error: 'Default shop is required' }, { status: 400 });
    }
    if (!Number.isFinite(roleCode)) {
      return NextResponse.json({ success: false, error: 'Role is required' }, { status: 400 });
    }

    const currentShop =
      (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;
    if (currentShop && defaultShopcode !== currentShop) {
      return NextResponse.json(
        { success: false, error: 'New users must belong to the current shop' },
        { status: 400 }
      );
    }

    const shopCheck = await dbService.query<{ shop_code: string }>(
      'SELECT shop_code FROM t_shop WHERE shop_code = ? LIMIT 1',
      [defaultShopcode]
    );
    if (!shopCheck.data?.length) {
      return NextResponse.json({ success: false, error: 'Invalid shop selected' }, { status: 400 });
    }

    const codeCheck = await dbService.query<{ uid: number }>(
      'SELECT uid FROM t_employee WHERE employee_code = ? LIMIT 1',
      [employeeCode]
    );
    if (codeCheck.data?.length) {
      return NextResponse.json(
        { success: false, error: 'Employee code already exists' },
        { status: 409 }
      );
    }

    const usernameCheck = await dbService.query<{ uid: number }>(
      'SELECT uid FROM t_employee WHERE username = ? AND default_shopcode = ? LIMIT 1',
      [username, defaultShopcode]
    );
    if (usernameCheck.data?.length) {
      return NextResponse.json(
        { success: false, error: 'Username already exists for this shop' },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    const insertResult = await dbService.query(
      `INSERT INTO t_employee (employee_code, username, password, default_shopcode, role_code, status, create_date, modify_date)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [employeeCode, username, hashed, defaultShopcode, roleCode, status]
    );

    const uid = insertResult.insertId;
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 });
    }

    await seedEmployeeAccessFromRole(employeeCode, defaultShopcode, roleCode);

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: {
        uid,
        employee_code: employeeCode,
        username,
        default_shopcode: defaultShopcode,
        role_code: roleCode,
        status,
      },
    });
  } catch (error) {
    console.error('[API] administration/users POST error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
