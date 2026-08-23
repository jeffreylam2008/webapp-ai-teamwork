import {
  TRANSACTION_DRAFT_TRANS_CODE,
  isTransactionDraftTransCode,
  reserveTransactionNumber,
} from '@/lib/transactionDraft';
import { PREFIX_REF } from '@/lib/prefixRef';

export const QUOTATION_SESSION_KEY = 'quotation_session_id';
export const QUOTATION_CLONE_KEY_PREFIX = 'quotation_clone_';
export const QUOTATION_BASE_PATH = '/sales/quotations';

export { TRANSACTION_DRAFT_TRANS_CODE, isTransactionDraftTransCode as isQuotationDraftTransCode };

export async function reserveQuotationNumber(sessionId: string): Promise<string> {
  return reserveTransactionNumber(PREFIX_REF.QTA, sessionId);
}

export function quotationCreatePath(transCode: string): string {
  return `${QUOTATION_BASE_PATH}/create/${encodeURIComponent(transCode)}`;
}

export function quotationDraftCreatePath(): string {
  return quotationCreatePath(TRANSACTION_DRAFT_TRANS_CODE);
}
