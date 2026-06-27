import {
  TRANSACTION_DRAFT_TRANS_CODE,
  isTransactionDraftTransCode,
  reserveTransactionNumber,
} from '@/lib/transactionDraft';

export const PURCHASE_SESSION_KEY = 'purchase_session_id';
export const PURCHASE_CLONE_KEY_PREFIX = 'purchase_clone_';
export const PURCHASE_BASE_PATH = '/purchasing/purchases';

export { TRANSACTION_DRAFT_TRANS_CODE, isTransactionDraftTransCode as isPurchaseDraftTransCode };

export async function reservePurchaseNumber(sessionId: string): Promise<string> {
  return reserveTransactionNumber('PO', sessionId);
}

export function purchaseCreatePath(transCode: string): string {
  return `${PURCHASE_BASE_PATH}/create/${encodeURIComponent(transCode)}`;
}

export function purchaseDraftCreatePath(): string {
  return purchaseCreatePath(TRANSACTION_DRAFT_TRANS_CODE);
}
