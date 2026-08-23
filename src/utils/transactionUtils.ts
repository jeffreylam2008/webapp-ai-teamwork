/**
 * Client-safe utility functions for transaction generation
 * These functions don't depend on Node.js modules and can be used in browser code
 */

/**
 * Generate a unique session ID
 * @returns string - Unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}${randomStr}`;
}

/**
 * Get current suffix in format YYMM (e.g., 2509 for September 2025)
 * @returns string - Current suffix
 */
export function getCurrentSuffix(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month with leading zero
  return `${year}${month}`;
}

import { DISPLAY_TO_PREFIX_REF, DEFAULT_DISPLAY_BY_REF } from '@/lib/prefixRef';

/**
 * Soft client-side hint only. Authoritative validation is t_prefix via
 * /api/transaction-generator/next (resolvePrefixPair).
 */
export function isValidPrefix(prefix: string): boolean {
  const raw = String(prefix || '').trim().toUpperCase();
  if (!raw) return false;
  if (raw.startsWith('_') && raw.length >= 2) return true;
  if (DISPLAY_TO_PREFIX_REF[raw]) return true;
  if (DEFAULT_DISPLAY_BY_REF[raw]) return true;
  return raw.length >= 1 && raw.length <= 10;
}

/**
 * Default display seeds — live list comes from t_prefix / /api/prefixes.
 */
export function getValidPrefixes(): string[] {
  return Object.values(DEFAULT_DISPLAY_BY_REF);
}

/**
 * Get prefix description
 * @param prefix - The prefix to get description for
 * @returns string - Description of the prefix
 */
export function getPrefixDescription(prefix: string): string {
  const descriptions: { [key: string]: string } = {
    'DN': 'Delivery Note',
    'INV': 'Invoice',
    'QTA': 'Quote',
    'PO': 'Purchase Order',
    'SO': 'Sales Order',
    'CR': 'Credit Note',
    'DR': 'Debit Note',
    'GRN': 'Goods Received Note',
    'ADJ': 'Adjustment',
    'ST': 'Stocktake'
  };
  return descriptions[prefix] || 'Unknown';
}

/**
 * Get prefix color for UI display
 * @param prefix - The prefix to get color for
 * @returns string - Color name for the prefix
 */
export function getPrefixColor(prefix: string): string {
  const colors: { [key: string]: string } = {
    'DN': 'blue',
    'INV': 'green',
    'QTA': 'orange',
    'PO': 'purple',
    'SO': 'cyan',
    'CR': 'red',
    'DR': 'magenta',
    'GRN': 'geekblue',
    'ADJ': 'gold',
    'ST': 'lime'
  };
  return colors[prefix] || 'default';
}

/**
 * Parse a generated transaction code like `QTA2605-001` or `GRN2605-012` into
 * prefix, YYMM suffix, and numeric sequence. Uses longest matching known prefix.
 * Used when committing generator state when `session_id` no longer matches DB
 * (one generator row per prefix+suffix overwrites session_id on each next()).
 */
export function parseGeneratedTransactionCode(transCode: string): {
  prefix: string;
  suffix: string;
  lastNumber: number;
} | null {
  const code = String(transCode || '').trim().toUpperCase();
  if (!code) return null;
  const m = code.match(/^(.+?)(\d{4})-(\d+)$/);
  if (!m) return null;
  const lastNumber = parseInt(m[3], 10);
  if (!Number.isFinite(lastNumber) || lastNumber < 1) return null;
  return { prefix: m[1], suffix: m[2], lastNumber };
}
