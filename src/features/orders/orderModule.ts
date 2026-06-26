import {
  TRANSACTION_DRAFT_TRANS_CODE,
  isTransactionDraftTransCode,
  reserveTransactionNumber,
} from '@/lib/transactionDraft';

export const ORDER_SESSION_KEY = 'order_session_id';
export const ORDER_CLONE_KEY_PREFIX = 'order_clone_';
export const ORDER_BASE_PATH = '/sales/orders';

export { TRANSACTION_DRAFT_TRANS_CODE, isTransactionDraftTransCode as isOrderDraftTransCode };

export async function reserveOrderNumber(sessionId: string): Promise<string> {
  return reserveTransactionNumber('SO', sessionId);
}

export function orderCreatePath(transCode: string): string {
  return `${ORDER_BASE_PATH}/create/${encodeURIComponent(transCode)}`;
}

export function orderDraftCreatePath(): string {
  return orderCreatePath(TRANSACTION_DRAFT_TRANS_CODE);
}
