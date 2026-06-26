import { getCurrentSuffix } from '@/utils/transactionUtils';

/** Placeholder route segment — document number is reserved on save, not at page load. */
export const TRANSACTION_DRAFT_TRANS_CODE = 'new';

export function isTransactionDraftTransCode(code: string | undefined | null): boolean {
  return String(code || '').trim().toLowerCase() === TRANSACTION_DRAFT_TRANS_CODE;
}

export function ensureBrowserSessionId(sessionKey: string): string {
  if (typeof window === 'undefined') return '';
  let sessionId = sessionStorage.getItem(sessionKey) || '';
  if (!sessionId) {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    sessionId = `browser_${timestamp}${randomStr}`;
    sessionStorage.setItem(sessionKey, sessionId);
  }
  return sessionId;
}

export async function reserveTransactionNumber(prefix: string, sessionId: string): Promise<string> {
  const suffix = getCurrentSuffix();
  const response = await fetch('/api/transaction-generator/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, suffix, sessionId }),
  });
  const result = (await response.json()) as {
    success: boolean;
    transactionCode?: string;
    error?: string;
  };
  if (!result.success || !result.transactionCode) {
    throw new Error(result.error || 'Failed to generate transaction number');
  }
  return result.transactionCode;
}
