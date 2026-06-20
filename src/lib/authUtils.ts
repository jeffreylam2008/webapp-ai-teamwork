import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import dbService from '@/lib/database';

export type AuthUser = {
  uid: number;
  employee_code: number;
  username: string;
  default_shopcode: string;
  selected_shopcode?: string | null;
  selected_shopname?: string | null;
  role_code: number;
};

type VerifyOk = { success: true; user: AuthUser; error?: string };
type VerifyFail = { success: false; user?: undefined; error: string };

export function extractTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    return token || null;
  }

  const cookieToken = request.cookies.get('auth_token')?.value;
  return cookieToken || null;
}

export async function verifyToken(token: string): Promise<VerifyOk | VerifyFail> {
  try {
    if (!token) return { success: false, error: 'Missing token' };

    // Must match the signing secret used by /api/auth/login and edge middleware.
    // (This project historically falls back when env is not set.)
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

    const decoded = jwt.verify(token, secret) as Record<string, unknown>;
    const uid = Number(decoded.uid || decoded.user_id || decoded.id || 0);
    if (!uid) return { success: false, error: 'Invalid token payload' };

    // Validate token is still the latest for the employee (best-effort)
    try {
      const lastTokenResult = await dbService.query<{ last_token: string | null }>(
        'SELECT last_token FROM t_employee WHERE uid = ? LIMIT 1',
        [uid]
      );
      const row = (lastTokenResult.data as Array<{ last_token: string | null }> | undefined)?.[0];
      if (row?.last_token && String(row.last_token) !== token) {
        return { success: false, error: 'Session expired' };
      }
    } catch {
      // If table/schema differs, skip server-side session check.
    }

    const user: AuthUser = {
      uid,
      employee_code: Number(decoded.employee_code || 0),
      username: String(decoded.username || decoded.name || ''),
      default_shopcode: String(decoded.default_shopcode || decoded.default_shop_code || ''),
      selected_shopcode: (decoded.selected_shopcode as string | null | undefined) ?? null,
      selected_shopname: (decoded.selected_shopname as string | null | undefined) ?? null,
      role_code: Number(decoded.role_code || 0),
    };

    return { success: true, user };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid token' };
  }
}

