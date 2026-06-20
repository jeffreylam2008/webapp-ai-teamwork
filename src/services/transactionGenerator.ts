import { generateSessionId, getCurrentSuffix, isValidPrefix, getValidPrefixes } from '@/utils/transactionUtils';

export interface TransactionSession {
  sessionId: string;
  prefix: string;
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

  static async startTransaction(prefix: string): Promise<TransactionSession> {
    const sessionId = this.generateSessionId();
    const suffix = this.getCurrentSuffix();
    
    console.log('TransactionGenerator.startTransaction called:', { prefix, suffix, sessionId });
    
    try {
      console.log('Making API call to /api/transaction-generator/next with:', { prefix, suffix, sessionId });
      
      // Get the next available number for this prefix+suffix combination
      const response = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix,
          suffix,
          sessionId
        }),
      });

      console.log('API response status:', response.status);
      console.log('API response ok:', response.ok);

      const result = await response.json();
      console.log('API response data:', result);
      
      if (result.success) {
        const sessionData = {
          sessionId,
          prefix,
          suffix,
          lastNumber: result.lastNumber,
          transactionCode: result.transactionCode
        };
        console.log('Returning session data:', sessionData);
        return sessionData;
      } else {
        console.error('API returned error:', result.error);
        throw new Error(result.error || 'Failed to generate transaction code');
      }
    } catch (error) {
      console.error('Error starting transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error details:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      throw error;
    }
  }

  /**
   * Start a transaction with a specific prefix type
   * @param prefix - The transaction prefix (DN, INV, QTA, etc.)
   * @param customSuffix - Optional custom suffix, defaults to current YYMM
   * @returns Promise<TransactionSession>
   */
  static async startTransactionWithPrefix(prefix: string, customSuffix?: string): Promise<TransactionSession> {
    const sessionId = this.generateSessionId();
    const suffix = customSuffix || this.getCurrentSuffix();
    
    console.log('TransactionGenerator.startTransactionWithPrefix called:', { prefix, suffix, sessionId });
    
    // Validate prefix
    if (!isValidPrefix(prefix)) {
      throw new Error(`Invalid prefix: ${prefix}. Valid prefixes are: ${getValidPrefixes().join(', ')}`);
    }
    
    try {
      console.log('Making API call to /api/transaction-generator/next with:', { prefix, suffix, sessionId });
      
      const response = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix,
          suffix,
          sessionId
        }),
      });

      console.log('API response status:', response.status);
      console.log('API response ok:', response.ok);

      const result = await response.json();
      console.log('API response data:', result);
      
      if (result.success) {
        const sessionData = {
          sessionId,
          prefix,
          suffix,
          lastNumber: result.lastNumber,
          transactionCode: result.transactionCode
        };
        console.log('Returning session data:', sessionData);
        return sessionData;
      } else {
        console.error('API returned error:', result.error);
        throw new Error(result.error || 'Failed to generate transaction code');
      }
    } catch (error) {
      console.error('Error starting transaction with prefix:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error details:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      throw error;
    }
  }

  /**
   * Get all valid prefix types
   * @returns string[] - Array of valid prefixes
   */
  static getValidPrefixes(): string[] {
    return getValidPrefixes();
  }

  /**
   * Validate if a prefix is valid
   * @param prefix - The prefix to validate
   * @returns boolean - Whether the prefix is valid
   */
  static isValidPrefix(prefix: string): boolean {
    return isValidPrefix(prefix);
  }

  /**
   * @param sessionId Browser session from sessionStorage (may be stale if another next() ran for same prefix+suffix).
   * @param transactionCode Saved document code (e.g. QTA2605-001) — used as fallback to mark the generator row.
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
   * @param transactionCode Saved document code (e.g. QTA2605-001) — fallback to release the generator row.
   */
  static async discardTransaction(sessionId?: string, transactionCode?: string): Promise<void> {
    const sid = sessionId?.trim() || '';
    const code = transactionCode?.trim() || '';
    if (!sid && !code) return;

    try {
      console.log('TransactionGenerator.discardTransaction called with:', { sessionId: sid, transactionCode: code });

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

      console.log('Discard API response status:', response.status);
      console.log('Discard API response ok:', response.ok);

      const result = await response.json();
      console.log('Discard API response data:', result);
      
      if (!result.success) {
        console.error('Discard API returned error:', result.error);
        throw new Error(result.error || 'Failed to discard transaction');
      }
      
      console.log('Transaction discarded successfully');
    } catch (error) {
      console.error('Error discarding transaction:', error);
      throw error;
    }
  }
}
