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

/** Audit create/edit of t_prefix master (affects transaction type display codes / numbering). */
export async function logPrefixAction(params: {
  request: NextRequest;
  action: Extract<AuditAction, 'CREATE' | 'EDIT'>;
  prefixRef: string;
  prefixCode?: string;
  details?: Record<string, unknown>;
}) {
  const { request, action, prefixRef, prefixCode, details } = params;
  const user = await getAuditUser(request);
  const headerCtx = getUserFromRequest(request);
  const userId = user ? String(user.uid) : headerCtx.userId || 'anonymous';
  const username = user ? user.username : headerCtx.username || 'anonymous';

  userActionLogger.log({
    userId,
    username,
    action,
    resource: 'PREFIX',
    resourceId: prefixRef || prefixCode,
    details: {
      prefix_ref: prefixRef || undefined,
      prefix_code: prefixCode || undefined,
      ...details,
    },
    ipAddress: getRequestIp(request) ?? headerCtx.ipAddress,
    userAgent: getRequestUserAgent(request) ?? headerCtx.userAgent,
    method: request.method,
    path: new URL(request.url).pathname,
  });
}

/**
 * Audit employee password changes via administration API.
 * Never include the password (plaintext or hash) in details.
 */
export async function logEmployeePasswordAction(params: {
  request: NextRequest;
  targetEmployeeCode: string;
  targetUid?: number | null;
  outcome: 'success' | 'denied' | 'not_found' | 'error';
  details?: Record<string, unknown>;
  statusCode?: number;
}) {
  const { request, targetEmployeeCode, targetUid, outcome, details, statusCode } = params;
  const user = await getAuditUser(request);
  const headerCtx = getUserFromRequest(request);
  const userId = user ? String(user.uid) : headerCtx.userId || 'anonymous';
  const username = user ? user.username : headerCtx.username || 'anonymous';
  const editorEmployeeCode = user?.employee_code != null ? String(user.employee_code) : undefined;
  const isSelfChange =
    editorEmployeeCode != null &&
    String(editorEmployeeCode).trim() === String(targetEmployeeCode).trim();

  userActionLogger.log({
    userId,
    username,
    action: 'PASSWORD_CHANGE',
    resource: 'EMPLOYEE',
    resourceId: targetEmployeeCode,
    details: {
      target_employee_code: targetEmployeeCode,
      target_uid: targetUid ?? undefined,
      editor_employee_code: editorEmployeeCode,
      self_change: isSelfChange,
      outcome,
      ...details,
    },
    ipAddress: getRequestIp(request) ?? headerCtx.ipAddress,
    userAgent: getRequestUserAgent(request) ?? headerCtx.userAgent,
    method: request.method,
    path: new URL(request.url).pathname,
    statusCode,
  });
}

