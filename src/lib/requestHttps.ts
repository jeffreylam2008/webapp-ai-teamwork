import type { NextRequest } from 'next/server';

/** True when the incoming request is HTTPS (or behind a proxy that sets x-forwarded-proto). */
export function isRequestHttps(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  return forwardedProto === 'https' || request.nextUrl.protocol === 'https:';
}
