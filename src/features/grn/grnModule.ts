import {
  TRANSACTION_DRAFT_TRANS_CODE,
  ensureBrowserSessionId,
  reserveTransactionNumber,
} from '@/lib/transactionDraft';

export const GRN_SESSION_KEY = 'grn_session_id';
export const GRN_BASE_PATH = '/warehouse/stock/grn';
export const GRN_STOCK_LIST_PATH = '/warehouse/stock';

export { TRANSACTION_DRAFT_TRANS_CODE, ensureBrowserSessionId };

export async function reserveGrnNumber(sessionId: string): Promise<string> {
  return reserveTransactionNumber('GRN', sessionId);
}
