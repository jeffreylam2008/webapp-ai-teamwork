import { NextResponse } from 'next/server';
import type { AuthUser } from '@/lib/authUtils';
import dbService from '@/lib/database';

/** Login shop: selected shop at login, else employee default. */
export function getShopScopeFromAuth(user: AuthUser | null | undefined): string {
  if (!user) return '';
  return (user.selected_shopcode || user.default_shopcode || '').trim();
}

export function shopScopeRequiredResponse() {
  return NextResponse.json(
    { success: false, error: 'No shop selected. Please log in with a shop.' },
    { status: 400 }
  );
}

/** Use 404 so cross-shop existence is not leaked. */
export function transactionOutOfShopScopeResponse() {
  return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
}

export function sameShopCode(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
}

export function isTransactionInShopScope(
  transactionShopCode: string | null | undefined,
  scopeShopCode: string
): boolean {
  if (!scopeShopCode) return false;
  return sameShopCode(transactionShopCode, scopeShopCode);
}

/** SQL fragment + bind value for header shop isolation. */
export function shopScopeSql(
  scopeShopCode: string,
  alias = 'h'
): { sql: string; params: string[] } {
  return {
    sql: ` AND ${alias}.shop_code = ?`,
    params: [scopeShopCode],
  };
}

/**
 * Ensure trans_code belongs to the user's shop.
 * Returns a NextResponse to send, or null if allowed.
 */
export async function assertTransCodeInShopScope(
  transCode: string,
  scopeShopCode: string
): Promise<NextResponse | null> {
  const code = String(transCode || '').trim();
  if (!scopeShopCode) return shopScopeRequiredResponse();
  if (!code) {
    return NextResponse.json({ success: false, error: 'transCode is required' }, { status: 400 });
  }

  const res = await dbService.query<{ shop_code: string | null }>(
    'SELECT shop_code FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
    [code]
  );
  const row = res.data?.[0];
  if (!row) {
    return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
  }
  if (!isTransactionInShopScope(row.shop_code, scopeShopCode)) {
    return transactionOutOfShopScopeResponse();
  }
  return null;
}
