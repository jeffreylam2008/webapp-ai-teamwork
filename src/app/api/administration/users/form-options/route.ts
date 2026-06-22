import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

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

    const roleResult = await dbService.query<{ role_code: number; name: string }>(
      'SELECT role_code, name FROM t_employee_role ORDER BY role_code ASC'
    );
    let roles = (roleResult.data || []).map((r) => ({
      role_code: Number(r.role_code),
      name: String(r.name || r.role_code),
    }));

    if (roles.length === 0) {
      const fallback = await dbService.query<{ role_code: number }>(
        'SELECT DISTINCT role_code FROM t_employee WHERE role_code IS NOT NULL ORDER BY role_code ASC'
      );
      roles = (fallback.data || []).map((r) => ({
        role_code: Number(r.role_code),
        name: String(r.role_code),
      }));
    }

    const shopResult = await dbService.query<{ shop_code: string; name: string }>(
      'SELECT shop_code, name FROM t_shop ORDER BY name ASC'
    );
    const shops = (shopResult.data || []).map((s) => ({
      shop_code: String(s.shop_code),
      name: String(s.name || s.shop_code),
    }));

    const currentShop =
      (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;

    return NextResponse.json({
      success: true,
      data: { roles, shops, currentShop },
    });
  } catch (error) {
    console.error('[API] administration/users/form-options error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
