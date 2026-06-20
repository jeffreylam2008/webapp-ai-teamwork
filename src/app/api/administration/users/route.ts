import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

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
