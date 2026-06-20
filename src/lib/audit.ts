import type { NextRequest } from 'next/server';
import { extractTokenFromRequest, verifyToken, type AuthUser } from '@/lib/authUtils';
import { getUserFromRequest } from '@/lib/user-context';
import { userActionLogger } from '@/lib/simple-logger';

export type AuditAction =
  | 'VIEW'
  | 'SEARCH'
  | 'CREATE'
  | 'EDIT'
  | 'DELETE'
  | 'CONFIRM'
  | 'CONVERT'
  | 'VOID';

export function getRequestIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')?.[0]?.trim() || realIp?.trim();
  return ip || undefined;
}

export function getRequestUserAgent(request: NextRequest): string | undefined {
  const ua = request.headers.get('user-agent');
  return ua || undefined;
}

export async function getAuditUser(request: NextRequest): Promise<AuthUser | null> {
  const token = extractTokenFromRequest(request);
  if (!token) return null;
  const auth = await verifyToken(token);
  return auth.success && auth.user ? auth.user : null;
}

export async function logTransactionAction(params: {
  request: NextRequest;
  action: AuditAction;
  transCode?: string;
  prefix?: string;
  details?: Record<string, unknown>;
}) {
  const { request, action, transCode, prefix, details } = params;
  const user = await getAuditUser(request);
  const headerCtx = getUserFromRequest(request);
  const userId = user ? String(user.uid) : headerCtx.userId || 'anonymous';
  const username = user ? user.username : headerCtx.username || 'anonymous';

  userActionLogger.log({
    userId,
    username,
    action,
    resource: prefix ? `TRANSACTION:${prefix}` : 'TRANSACTION',
    resourceId: transCode,
    details: {
      prefix,
      ...details,
    },
    ipAddress: getRequestIp(request) ?? headerCtx.ipAddress,
    userAgent: getRequestUserAgent(request) ?? headerCtx.userAgent,
    method: request.method,
    path: new URL(request.url).pathname,
  });
}

