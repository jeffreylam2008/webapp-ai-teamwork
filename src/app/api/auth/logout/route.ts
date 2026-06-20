import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import jwt from 'jsonwebtoken';
import { getRequestIp } from '@/lib/audit';
import { isRequestHttps } from '@/lib/requestHttps';
import { userActionLogger } from '@/lib/simple-logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token) {
      let decodedForAudit: { uid?: number; username?: string } | null = null;
      try {
        decodedForAudit = jwt.verify(token, JWT_SECRET) as { uid?: number; username?: string };
      } catch {
        console.log('[AUTH] Token expired or invalid during logout, but updating t_login anyway');
      }

      // Clear the token from database
      await dbService.query(
        `UPDATE t_employee SET last_token = NULL WHERE last_token = ?`,
        [token]
      );

      // Update t_login table to set status='out' for this token
      // Truncate token if needed to match varchar(255) limit
      const tokenForLogin = token.length > 255 ? token.substring(0, 255) : token;
      
      try {
        const username = decodedForAudit?.username ?? null;

        // Update t_login: set status='out' and update modify_date
        await dbService.query(
          `UPDATE t_login 
           SET status = 'out', modify_date = NOW() 
           WHERE token = ? AND status = 'in'`,
          [tokenForLogin]
        );

        console.log('[AUTH] Logout recorded in t_login table', username ? `for user: ${username}` : '');
      } catch (loginTableError) {
        // Log error but don't fail logout if t_login update fails
        console.error('[AUTH] Error updating t_login table during logout:', loginTableError);
      }

      if (decodedForAudit?.uid != null && decodedForAudit.username) {
        userActionLogger.logout(
          String(decodedForAudit.uid),
          decodedForAudit.username,
          getRequestIp(request)
        );
      }
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logout successful'
    });
    const isHttps = isRequestHttps(request);
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps,
      path: '/',
      maxAge: 0,
    });
    return response;

  } catch (error) {
    console.error('[AUTH] Logout error:', error);
    return NextResponse.json(
      { success: false, error: 'Logout failed' },
      { status: 500 }
    );
  }
}

