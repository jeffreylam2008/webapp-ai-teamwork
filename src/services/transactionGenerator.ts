import { generateSessionId, getCurrentSuffix } from '@/utils/transactionUtils';
import { normalizeToPrefixRef } from '@/lib/prefixRef';

export interface TransactionSession {
  sessionId: string;
  /** Current display prefix from t_prefix (used in trans_code). */
  prefix: string;
  /** Stable type id from t_prefix.prefix_ref. */
  prefix_ref?: string;
  suffix: string;
  lastNumber: number;
  transactionCode: string;
}

export class TransactionGenerator {
  private static generateSessionId(): string {
    return generateSessionId();
  }

  private static getCurrentSuffix(): string {
    return getCurrentSuffix();
  }

  /**
   * @param prefixOrRef Stable prefix_ref (_SO) preferred, or display code from t_prefix.
   */
  static async startTransaction(prefixOrRef: string): Promise<TransactionSession> {
    const sessionId = this.generateSessionId();
    const suffix = this.getCurrentSuffix();
    return this.requestNext(sessionId, prefixOrRef, suffix);
  }

  private static async requestNext(
    sessionId: string,
    prefixOrRef: string,
    suffix: string
  ): Promise<TransactionSession> {
    const raw = String(prefixOrRef || '').trim();
    if (!raw) throw new Error('prefix_ref is required');

    const body = {
      suffix,
      sessionId,
      prefix_ref: normalizeToPrefixRef(raw),
    };

    const response = await fetch('/api/transaction-generator/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to generate transaction code');
    }

    return {
      sessionId,
      prefix: String(result.prefix || '').toUpperCase(),
      prefix_ref: String(result.prefix_ref || normalizeToPrefixRef(raw)).toUpperCase(),
      suffix,
      lastNumber: result.lastNumber,
      transactionCode: result.transactionCode,
    };
  }

  /**
   * @param prefixOrRef Stable prefix_ref (_SO) preferred, or display code from t_prefix.
   */
  static async startTransactionWithPrefix(
    prefixOrRef: string,
    customSuffix?: string
  ): Promise<TransactionSession> {
    const sessionId = this.generateSessionId();
    const suffix = customSuffix || this.getCurrentSuffix();
    return this.requestNext(sessionId, prefixOrRef, suffix);
  }

  /**
   * @param sessionId Browser session from sessionStorage (may be stale if another next() ran for same prefix+suffix).
   * @param transactionCode Saved document code — used as fallback to mark the generator row.
   */
  static async commitTransaction(sessionId: string, transactionCode?: string): Promise<void> {
    try {
      const response = await fetch('/api/transaction-generator/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId || undefined,
          transactionCode: transactionCode?.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to commit transaction');
      }
    } catch (error) {
      console.error('Error committing transaction:', error);
      throw error;
    }
  }

  /**
   * @param sessionId Browser session from sessionStorage (may be stale if another next() ran).
   * @param transactionCode Saved document code — fallback to release the generator row.
   */
  static async discardTransaction(sessionId?: string, transactionCode?: string): Promise<void> {
    const sid = sessionId?.trim() || '';
    const code = transactionCode?.trim() || '';
    if (!sid && !code) return;

    try {
      const response = await fetch('/api/transaction-generator/discard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sid || undefined,
          transactionCode: code || undefined,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to discard transaction');
      }
    } catch (error) {
      console.error('Error discarding transaction:', error);
      throw error;
    }
  }
}
