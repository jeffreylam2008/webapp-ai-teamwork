import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

/**
 * GET /api/auth/verify
 * Validates the Bearer JWT and session row in t_employee (see authUtils — supports truncated last_token in DB).
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      );
    }

    const result = await verifyToken(token);
    if (!result.success || !result.user) {
      return NextResponse.json(
        { success: false, error: result.error || 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const u = result.user;
    let selected_shopname: string | null = u.selected_shopname ?? null;
    const selected_shopcode: string = u.selected_shopcode ?? u.default_shopcode;
    if (!selected_shopname && selected_shopcode) {
      const shopResult = await dbService.query<{ shop_code: string; name: string }>(
        'SELECT shop_code, name FROM t_shop WHERE shop_code = ?',
        [selected_shopcode]
      );
      if (shopResult.data?.[0]) {
        selected_shopname = shopResult.data[0].name;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        // Echo canonical session JWT so the client can resync localStorage with cookie-backed sessions
        token,
        user: {
          uid: u.uid,
          employee_code: u.employee_code,
          username: u.username,
          default_shopcode: u.default_shopcode,
          selected_shopcode,
          selected_shopname,
          role_code: u.role_code,
        },
      },
    });
  } catch (error) {
    console.error('[AUTH] Token verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 401 }
    );
  }
}
