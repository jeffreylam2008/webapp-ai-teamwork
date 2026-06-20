import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * HS256 shared secret (same as `jwt.sign` / `jsonwebtoken` in API routes).
 * `jsonwebtoken` uses Node `crypto` and is unreliable in Next.js **Edge** middleware; `jose` uses Web
 * Crypto and matches production/compiled behavior with Node-issued tokens.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const jwtSecretKey = new TextEncoder().encode(JWT_SECRET);
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * API paths that do not require a JWT (public handlers).
 * Page routes (/, /login, /sales, …) are NOT run through this middleware — see `config.matcher`
 * and client-side `ProtectedRoute` + Bearer token from `localStorage`.
 */
const publicApiPaths = [
  '/api/auth/login',
  '/api/auth/login-crypt',
  '/api/auth/test-crypt',
  '/api/auth/verify',
  '/api/auth/logout',
  '/api/system/name',
  '/api/shops',
  '/api/transaction-generator',
  '/api/suppliers',
  '/api/products',
  '/api/categories',
  '/api/print-templates',
  '/api/payment-methods',
  '/api/transaction-generator/next',
  '/api/transaction-generator/commit',
  '/api/transaction-generator/discard',
  '/api/transaction-generator/verify',
  '/api/auth/login-fixed',
  '/api/auth/login-simple',
];

// Debug API — only in development; still require auth in dev
const debugApiPrefixes = [
  '/api/debug',
];

function extractToken(request: NextRequest): string | null {
  // Prefer httpOnly session cookie so stale Authorization (e.g. old localStorage) does not
  // win over a fresh post-login cookie. Fall back to Bearer for clients without cookies.
  const fromCookie = request.cookies.get('auth_token')?.value?.trim();
  if (fromCookie) return fromCookie;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

async function verifyTokenSignature(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, jwtSecretKey, { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicApiPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  if (debugApiPrefixes.some((p) => pathname.startsWith(p))) {
    if (!isDevelopment) {
      return NextResponse.json(
        { success: false, error: 'Debug endpoints are not available in production' },
        { status: 403 }
      );
    }
    const token = extractToken(request);
    if (!token || !(await verifyTokenSignature(token))) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  const token = extractToken(request);

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  if (!(await verifyTokenSignature(token))) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired token' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

/**
 * Only protect API routes. Do not run auth on document navigations to `/`, `/login`, etc. — that
 * caused redirect loops when `auth_token` cookie was missing or not yet applied on LAN/HTTP, while
 * the client still had a valid `localStorage` session + `Authorization: Bearer` on fetches.
 */
export const config = {
  matcher: ['/api/:path*'],
};
