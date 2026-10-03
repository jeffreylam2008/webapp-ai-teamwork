import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  pendingPoForGrnCountQuery,
  pendingPoForGrnListQuery,
} from '@/lib/pendingGrnPurchaseOrders';
import { getShopScopeFromAuth, shopScopeRequiredResponse } from '@/lib/shopScope';

/**
 * GET /api/grn/purchase-orders
 * Open purchase orders awaiting GRN (current shop only).
 * Query: countOnly=1 — returns { pending_count } only (for stock page badge).
 */
export async function GET(request: NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const auth = await verifyToken(token);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const scopeShop = getShopScopeFromAuth(auth.user);
  if (!scopeShop) return shopScopeRequiredResponse();

  try {
    const countOnly = request.nextUrl.searchParams.get('countOnly') === '1';
    const countQ = pendingPoForGrnCountQuery(scopeShop);
    const countResult = await dbService.query<{ c: number }>(countQ.sql, countQ.params);
    const pending_count = Number((countResult.data?.[0] as { c?: unknown })?.c ?? 0) || 0;

    if (countOnly) {
      return NextResponse.json({ success: true, pending_count });
    }

    const listQ = pendingPoForGrnListQuery(scopeShop);
    const result = await dbService.query<{
      transaction_id: string;
      transaction_date: string | null;
      supplier_name: string | null;
      supplier_code: string | null;
      is_settle: number | null;
      is_void: number | null;
    }>(listQ.sql, listQ.params);

    const data = (result.data || [])
      .map((row) => {
        const code = String(row.transaction_id || '').trim();
        const supplierCode = String(row.supplier_code || '').trim();
        const supplierName = String(row.supplier_name || '').trim();
        return {
          transaction_id: code,
          supplier_code: supplierCode || undefined,
          supplier_name: supplierName || undefined,
          transaction_date: row.transaction_date ?? undefined,
          is_settle: Number(row.is_settle ?? 0) === 1 ? 1 : 0,
          status: Number(row.is_settle ?? 0) === 1 ? 'Settled' : 'Active',
        };
      })
      .filter((row) => row.transaction_id);

    return NextResponse.json({ success: true, data, pending_count });
  } catch (err) {
    console.error('[grn/purchase-orders GET]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load purchase orders' },
      { status: 500 }
    );
  }
}
